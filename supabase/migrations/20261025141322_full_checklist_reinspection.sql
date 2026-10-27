-- Full-checklist work-item reinspection after corrections. Never rewrite signed-off results or evidence.
-- CLI-generated stub version aligned to the hosted connector migration version after verified application.
alter table public.qa_inspections add column full_checklist_reinspection boolean not null default false;
alter table public.qa_inspection_items add column origin_item_id uuid references public.qa_inspection_items(id);
create index qa_item_origin on public.qa_inspection_items(origin_item_id) where origin_item_id is not null;
create index qa_reinspection_parent on public.qa_inspections(reinspection_of) where reinspection_of is not null;

-- Full frozen criteria from the immediately preceding inspection; no inferred matches by title/position.
create function public.qa_prior_criteria(p_inspection uuid) returns setof public.qa_inspection_items
language sql stable security definer set search_path='' as $$
  select x.* from public.qa_inspections current
    join public.qa_inspections previous on previous.id=current.reinspection_of and previous.project_id=current.project_id
      and previous.pin_id is not distinct from current.pin_id
    join public.qa_inspection_items x on x.inspection_id=previous.id where current.id=p_inspection;
$$;

create function public.configure_full_qa_reinspection(p_inspection uuid,p_origins uuid[] default null) returns void
language plpgsql security definer set search_path='' as $$
declare i public.qa_inspections; n integer;
begin
  select * into i from public.qa_inspections where id=p_inspection for update;
  if i.id is null or i.reinspection_of is null then return; end if;
  if i.status<>'requested' or exists(select 1 from public.qa_inspection_items where inspection_id=i.id and result<>'pending')
    or exists(select 1 from public.qa_photos where inspection_id=i.id or item_id in(select id from public.qa_inspection_items where inspection_id=i.id)) then
    raise exception 'Reinspection scope is already in use'; end if;
  -- Replace only the brand-new Pending snapshot. Every criterion gets a fresh result, measurement and required photo.
  delete from public.qa_inspection_items where inspection_id=i.id;
  insert into public.qa_inspection_items(inspection_id,project_id,position,text,severity,kind,unit,min_value,max_value,reference,
    requires_photo,hold_point,acceptance_criteria,evidence_requirement,origin_item_id)
    select i.id,i.project_id,row_number() over(order by position,id)-1,text,severity,kind,unit,min_value,max_value,reference,
      requires_photo,hold_point,acceptance_criteria,evidence_requirement,coalesce(origin_item_id,id)
    from (
      select * from public.qa_prior_criteria(i.id)
      union
      -- Older findings may predate the last full snapshot, without reliable lineage.
      -- Include their exact frozen source as well, never drop a selected finding or guess its identity.
      select old.* from public.qa_inspection_items old join public.qa_inspections source on source.id=old.inspection_id
        where old.id=any(p_origins) and source.project_id=i.project_id and source.pin_id is not distinct from i.pin_id
          and not exists(select 1 from public.qa_prior_criteria(i.id) previous
            where coalesce(previous.origin_item_id,previous.id)=coalesce(old.origin_item_id,old.id))
    ) x;
  get diagnostics n=row_count;
  if n=0 then raise exception 'The earlier inspection has no frozen checklist criteria'; end if;
  update public.qa_inspections set full_checklist_reinspection=true where id=i.id;
  insert into public.qa_inspection_events(project_id,inspection_id,actor_id,kind,note)
    values(i.project_id,i.id,auth.uid(),'reinspection_scope',
      'Full checklist reinspection: all '||n||' recorded check(s) need fresh results, including previously passed checks. Original results/evidence remain unchanged. This is not project-wide resubmission.');
end; $$;

create function public.prepare_full_work_qa() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.item_ids is not null then perform public.configure_full_qa_reinspection(new.inspection_id); end if;
  return new;
end; $$;
create trigger full_work_qa before insert on public.pin_qa_submissions for each row execute function public.prepare_full_work_qa();

-- Prior results are reference/history only; they are never carried forward as new Passes.
create function public.qa_reinspection_context(p_inspection uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i public.qa_inspections;
begin
  select * into i from public.qa_inspections where id=p_inspection;
  if i.id is null or not public.is_staff() or not public.can_view_project(i.project_id) then raise exception 'Inspection not found or access denied'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('source_number',source.number) order by x.position,x.id)
    from public.qa_prior_criteria(i.id) x join public.qa_inspections source on source.id=x.inspection_id),'[]'::jsonb);
end; $$;

-- Locate a signed-off Pass for this exact finding, not an unrelated check or request.
-- An inspection may fail on another finding; that does not invalidate this criterion's recorded Pass.
create function public.qa_ncr_verified_inspection(p_defect uuid) returns uuid
language sql stable security definer set search_path='' as $$
  with recursive finding as (
    select d.*,coalesce(original.origin_item_id,original.id) as origin,original as criterion
    from public.qa_defects d join public.qa_inspection_items original on original.id=d.inspection_item_id where d.id=p_defect
  ), descendants(id) as (
    select i.id from public.qa_inspections i join finding d on i.reinspection_of=d.inspection_id
    union select i.id from public.qa_inspections i join descendants d on i.reinspection_of=d.id
  )
  select i.id from finding d join descendants child on true join public.qa_inspections i on i.id=child.id
    join public.qa_inspection_items x on x.inspection_id=i.id
    where i.project_id=d.project_id and i.pin_id=d.pin_id and i.status in ('passed','failed','conditional') and x.result='pass'
      and (d.fixed_at is null or i.completed_at>=d.fixed_at)
      and (d.correction_attempt_id is null or i.id=(select submitted_inspection_id from public.qa_work_attempts where id=d.correction_attempt_id))
      and (x.origin_item_id=d.origin or (x.origin_item_id is null and
        (x.text,x.severity,x.kind,x.unit,x.min_value,x.max_value,x.reference,x.requires_photo,x.hold_point,x.acceptance_criteria,x.evidence_requirement)
        is not distinct from ((d.criterion).text,(d.criterion).severity,(d.criterion).kind,(d.criterion).unit,(d.criterion).min_value,(d.criterion).max_value,
          (d.criterion).reference,(d.criterion).requires_photo,(d.criterion).hold_point,(d.criterion).acceptance_criteria,(d.criterion).evidence_requirement)))
      -- A later failed check, or a pending recheck of the same affected work, invalidates an older Pass.
      -- Unrelated checks/requests do not block this finding's closure.
      and not exists(select 1 from public.qa_inspection_items later_check join public.qa_inspections later_ir on later_ir.id=later_check.inspection_id
        where later_check.origin_item_id=d.origin and later_ir.project_id=d.project_id and later_ir.pin_id=d.pin_id and later_ir.number>i.number
          and (later_ir.status in ('requested','in_progress') or (later_ir.status in ('passed','failed','conditional') and later_check.result='fail')))
    order by i.number desc limit 1;
$$;

create function public.qa_ncr_reinspection_state(p_defect uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.qa_defects; verified uuid; linked uuid; i public.qa_inspections;
begin
  select * into d from public.qa_defects where id=p_defect;
  if d.id is null or not public.is_staff() or not public.can_view_project(d.project_id) then raise exception 'NCR not found or access denied'; end if;
  verified:=public.qa_ncr_verified_inspection(d.id);
  if d.correction_attempt_id is not null then select submitted_inspection_id into linked from public.qa_work_attempts where id=d.correction_attempt_id;
  else linked:=verified; end if;
  select * into i from public.qa_inspections where id=linked;
  return jsonb_build_object('id',i.id,'status',i.status,'number',i.number,'ready',verified is not null);
end; $$;

create function public.guard_full_ncr_closure() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='closed' and old.status<>'closed' and old.inspection_item_id is not null
    and exists(select 1 from public.pin_qa_submissions where inspection_id=old.inspection_id and item_ids is not null)
    and public.qa_ncr_verified_inspection(old.id) is null then
    raise exception 'Pass the linked reinspection of this NCR finding before closing it'; end if;
  return new;
end; $$;
create trigger full_ncr_closure before update of status on public.qa_defects for each row execute function public.guard_full_ncr_closure();

revoke all on function public.qa_prior_criteria(uuid),public.configure_full_qa_reinspection(uuid,uuid[]),public.prepare_full_work_qa(),
  public.qa_ncr_verified_inspection(uuid),public.guard_full_ncr_closure() from public,anon,authenticated;
revoke all on function public.qa_reinspection_context(uuid),public.qa_ncr_reinspection_state(uuid) from public,anon;
grant execute on function public.qa_reinspection_context(uuid),public.qa_ncr_reinspection_state(uuid) to authenticated;

-- Existing entrypoints retain their signatures and authorization; only full correction scope/failed-NCR reuse changes.
create or replace function public.submit_correction_package(p_items uuid[], p_defects uuid[] default '{}', p_root_cause text default null,
  p_preventive text default null, p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare pid uuid; pn public.pins; c public.pin_checklist_items; d public.qa_defects; a public.qa_work_attempts; ir uuid; irn integer;
  items uuid[]; selected uuid[]; ref text; r record;
begin
  select array_agg(distinct x) into items from unnest(coalesce(p_items,'{}'::uuid[])) x;
  if coalesce(cardinality(items),0)=0 then raise exception 'Choose the work item(s) this correction is for'; end if;
  select pin_id into pid from public.pin_checklist_items where id=items[1];
  if pid is null or not public.can_work_on_pin(pid) then raise exception 'Only the active Foreman assigned to this work submits corrections'; end if;
  select * into pn from public.pins where id=pid for update;
  if (select count(*) from public.pin_checklist_items where id=any(items) and pin_id=pid)<>cardinality(items) then
    raise exception 'All work items in one correction must belong to the same work'; end if;
  for c in select * from public.pin_checklist_items where id=any(items) order by id for update loop
    if not exists(select 1 from public.qa_work_attempts where item_id=c.id and submitted_inspection_id is null) then
      raise exception 'Start the correction for % first: record what was corrected and add new photos', c.text; end if;
    if not c.done then update public.pin_checklist_items set done=true where id=c.id; end if;
  end loop;

  select coalesce(array_agg(distinct x),'{}'::uuid[]) into selected from unnest(coalesce(p_defects,'{}'::uuid[])) x;
  if (select count(*) from public.qa_defects where id=any(selected))<>cardinality(selected) then raise exception 'One of the selected NCRs no longer exists'; end if;
  if cardinality(selected)=0 and exists(select 1 from public.qa_defects finding where finding.status in ('open','in_progress')
    and exists(select 1 from unnest(items) work(id) where finding.id in(select public.item_defect_ids(work.id)))) then
    raise exception 'Select at least one NCR finding this correction actually answers'; end if;
  for d in select * from public.qa_defects where id=any(selected) order by number for update loop
    ref:='NCR-'||lpad(d.number::text,4,'0');
    if not exists(select 1 from unnest(items) i(id) where d.id in (select public.item_defect_ids(i.id))) then
      raise exception '% is not linked to the work item(s) in this correction', ref; end if;
    if d.status not in ('open','in_progress') then raise exception '% is not waiting for a correction', ref; end if;
    if d.assigned_to is not null and d.assigned_to is distinct from auth.uid() then raise exception '% is assigned to another Foreman', ref; end if;
    select w.* into a from public.qa_work_attempts w join unnest(items) with ordinality u(id,n) on u.id=w.item_id
      where w.submitted_inspection_id is null and d.id in (select public.item_defect_ids(w.item_id)) order by u.n limit 1;
    if char_length(btrim(a.remarks))<10 then raise exception 'Describe the corrective action for % (at least 10 characters)', ref; end if;
  end loop;

  -- Same checks and snapshot as any resubmission: remarks, fresh eligible photos, one open inspection per work.
  if (select count(distinct previous_inspection_id) from public.qa_work_attempts where item_id=any(items) and submitted_inspection_id is null)>1 then
    raise exception 'Submit corrections from different earlier inspections separately'; end if;
  ir:=public.submit_checklist_qa(pid,items,p_note);
  if cardinality(selected)>0 then
    perform public.configure_full_qa_reinspection(ir,
      (select array_agg(distinct coalesce(x.origin_item_id,x.id)) from public.qa_defects chosen_defect join public.qa_inspection_items x on x.id=chosen_defect.inspection_item_id where chosen_defect.id=any(selected)));
  end if;
  select number into irn from public.qa_inspections where id=ir;

  for d in select * from public.qa_defects where id=any(selected) order by number loop
    select w.* into a from public.qa_work_attempts w join unnest(items) with ordinality u(id,n) on u.id=w.item_id
      where w.submitted_inspection_id=ir and d.id in (select public.item_defect_ids(w.item_id)) order by u.n limit 1;
    update public.qa_defects set status='for_verification', corrective_action=left(btrim(a.remarks),2000),
      root_cause=coalesce(nullif(btrim(coalesce(p_root_cause,'')),''),root_cause),
      preventive_action=coalesce(nullif(btrim(coalesce(p_preventive,'')),''),preventive_action),
      fixed_at=now(), fixed_by=auth.uid(), correction_attempt_id=a.id, updated_at=now() where id=d.id;
    insert into public.qa_defect_events(defect_id,project_id,kind,from_status,to_status,note)
      values(d.id,d.project_id,'status',d.status,'for_verification','Correction package submitted with IR-'||lpad(irn::text,4,'0'));
  end loop;

  if cardinality(selected)>0 then
    for r in select pm.user_id from public.project_members pm where pm.project_id=pn.project_id and pm.member_role='engineer' and pm.user_id is distinct from auth.uid() loop
      perform public.notify_user(r.user_id,'qa.defect_verify','Correction package: '||left(pn.title,80),
        'IR-'||lpad(irn::text,4,'0')||' and '||cardinality(selected)||' NCR(s) to review together',
        '/engineer/verification?project='||pn.project_id||'&item='||items[1],pn.project_id,ir);
    end loop;
  end if;
  return ir;
end; $$;

create or replace function public.complete_inspection(p_id uuid, p_summary text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.qa_inspections;
  w jsonb := coalesce((select value from public.system_settings where key = 'qa.weights'), '{"critical":5,"major":3,"minor":1}'::jsonb);
  th numeric := coalesce((select (value #>> '{}')::numeric from public.system_settings where key = 'qa.acceptance_threshold'), 90);
  pass_w numeric;
  total_w numeric;
  fails integer;
  crit_fail boolean;
  hold_fail boolean;
  res text;
  sc numeric;
  it record;
  v_defect uuid;
  v_number integer;
  v_assignee uuid;
  v_existing_status text;
  v_pin public.pins;
  made integer := 0;
  r record;
begin
  select * into i from public.qa_inspections where id = p_id for update;
  if i.id is null or not public.can_edit_blueprints(i.project_id) then raise exception 'Inspection not found or you are not allowed to complete it'; end if;
  if i.status <> 'in_progress' then raise exception 'Only an inspection in progress can be completed'; end if;
  if i.inspector_id is distinct from auth.uid() then raise exception 'Only the inspector who started it can complete it'; end if;
  if exists (select 1 from public.qa_inspection_items where inspection_id = p_id and result = 'pending') then raise exception 'Every item needs a result (pass, fail or N/A)'; end if;
  if exists (select 1 from public.qa_inspection_items x where x.inspection_id = p_id and x.requires_photo and x.result in ('pass', 'fail') and not exists (select 1 from public.qa_photos p where p.item_id = x.id)) then
    raise exception 'Add the required photo for every item marked with a camera';
  end if;
  select coalesce(sum(public.qa_weight(severity, w)) filter (where result = 'pass'), 0), coalesce(sum(public.qa_weight(severity, w)) filter (where result in ('pass', 'fail')), 0),
         count(*) filter (where result = 'fail'), coalesce(bool_or(result = 'fail' and severity = 'critical'), false), coalesce(bool_or(result = 'fail' and hold_point), false)
    into pass_w, total_w, fails, crit_fail, hold_fail from public.qa_inspection_items where inspection_id = p_id;
  if total_w = 0 then raise exception 'Every item is N/A, so nothing was inspected'; end if;
  sc := round(100 * pass_w / total_w, 2);
  res := case when fails = 0 then 'passed' when sc >= th and not crit_fail and not hold_fail then 'conditional' else 'failed' end;
  update public.qa_inspections set status = res, score = sc, threshold = th, weights = w, completed_at = now(), summary = nullif(btrim(coalesce(p_summary, '')), ''), updated_at = now() where id = p_id;

  if i.pin_id is not null then select * into v_pin from public.pins where id = i.pin_id; end if;
  v_assignee := v_pin.assigned_to;
  if v_assignee is null and exists (select 1 from public.project_members where project_id = i.project_id and user_id = i.requested_by and member_role = 'foreman') then v_assignee := i.requested_by; end if;

  for it in select * from public.qa_inspection_items where inspection_id = p_id and result = 'fail' order by position loop
    -- Rejected corrective work stays on its existing NCR. A newly affected criterion still raises its own NCR.
    select d.id,d.status into v_defect,v_existing_status from public.qa_defects d join public.qa_inspection_items original on original.id=d.inspection_item_id
      where it.origin_item_id is not null and d.project_id=i.project_id and d.pin_id=i.pin_id and d.status<>'closed'
        and coalesce(original.origin_item_id,original.id)=it.origin_item_id order by d.number limit 1 for update of d;
    if v_defect is not null then
      update public.qa_defects set status='in_progress',fixed_at=null,fixed_by=null,updated_at=now() where id=v_defect;
      insert into public.qa_defect_events(defect_id,project_id,kind,from_status,to_status,note)
        values(v_defect,i.project_id,'rejected',v_existing_status,'in_progress',
          left('Reinspection IR-'||lpad(i.number::text,4,'0')||' failed: '||coalesce(it.remarks,'Correction remains unsatisfactory'),2000));
      continue;
    end if;
    v_number := public.next_qa_number(i.project_id, 'ncr');
    insert into public.qa_defects (project_id, number, inspection_id, inspection_item_id, pin_id, title, description, category, severity, trade, reference, assigned_to, due_date)
    values (i.project_id, v_number, p_id, it.id, i.pin_id, left(it.text, 160), left(coalesce(it.remarks, ''), 2000), case when i.trade = 'safety' then 'safety' else 'workmanship' end,
            it.severity, i.trade, it.reference, v_assignee, current_date + public.qa_due_days(it.severity)) returning id into v_defect;
    insert into public.qa_defect_events (defect_id, project_id, kind, to_status, note) values (v_defect, i.project_id, 'raised', 'open', 'Raised from inspection IR-' || lpad(i.number::text, 4, '0'));
    made := made + 1;
    if v_assignee is not null and v_assignee is distinct from auth.uid() then
      perform public.notify_user(v_assignee, 'qa.defect', 'NCR-' || lpad(v_number::text, 4, '0') || ' (' || it.severity || '): ' || left(it.text, 100), 'Due ' || to_char(current_date + public.qa_due_days(it.severity), 'Mon DD'),
        '/foreman/issues?project=' || i.project_id || '&defect=' || v_defect, i.project_id, v_defect);
    end if;
  end loop;

  if i.requested_by is not null and i.requested_by is distinct from auth.uid() then
    perform public.notify_user(i.requested_by, 'qa.result', 'Inspection IR-' || lpad(i.number::text, 4, '0') || ' ' || res || ' (' || sc::text || '%)', left(i.title, 120) || case when made > 0 then ' - ' || made || ' NCR(s) raised' else '' end,
      '/foreman/quality-control?project=' || i.project_id || '&inspection=' || p_id, i.project_id, p_id);
  end if;
  return jsonb_build_object('result', res, 'score', sc, 'threshold', th, 'defects', made, 'critical_failed', crit_fail, 'hold_point_failed', hold_fail);
end;
$$;

notify pgrst,'reload schema';

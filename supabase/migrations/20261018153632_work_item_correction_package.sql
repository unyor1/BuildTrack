-- Work item QA: one correction package, item-scoped acceptance, and completion that follows the last cleared blocker.
-- The checklist item (e.g. LAUNDRY -> FLOOR) is the record. NCRs raised by an inspection that included the item are "linked" to it.
-- NCR closure stays an explicit Engineer decision: nothing here closes an NCR or records an inspection result.

-- Which correction package answered an NCR (the package's remarks and photos are the NCR's corrective evidence).
alter table public.qa_defects add column correction_attempt_id uuid references public.qa_work_attempts(id);
create index qa_defect_correction on public.qa_defects(correction_attempt_id) where correction_attempt_id is not null;

-- NCRs raised by any inspection whose submission contained this work item (by permanent item id, so renaming keeps the link).
create function public.item_defect_ids(p_item uuid) returns setof uuid
language sql stable security definer set search_path='' as $$
  select distinct d.id from public.pin_checklist_items c
  join public.pin_qa_submissions s on s.pin_id=c.pin_id
  join public.qa_defects d on d.inspection_id=s.inspection_id and d.pin_id=c.pin_id
  where c.id=p_item and (c.id=any(s.item_ids) or (s.item_ids is null and exists(
    select 1 from jsonb_array_elements(s.checklist_snapshot) e(v) where e.v->>'id'=c.id::text and (e.v->>'done')::boolean)));
$$;

-- Completed = every work item accepted and all NCRs / inspections clear. Re-checked whenever the last blocker may have cleared.
create function public.try_complete_work(p_pin uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare pn public.pins;
begin
  select * into pn from public.pins where id=p_pin;
  if pn.id is null or pn.status='verified' or not public.can_edit_blueprints(pn.project_id)
    or not exists(select 1 from public.pin_qa_submissions where pin_id=p_pin and item_ids is not null)
    or public.pin_qa_verification_problem(p_pin) is not null then return false; end if;
  update public.pins set status='verified' where id=p_pin;
  return true;
end; $$;

-- Item acceptance now waits only for the NCRs linked to that item; work completion still waits for every NCR on the pin.
create or replace function public.review_checklist_item(p_item uuid,p_accept boolean,p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare c public.pin_checklist_items; pn public.pins; s public.pin_qa_submissions; original jsonb;
begin
  select * into c from public.pin_checklist_items where id=p_item;
  select * into pn from public.pins where id=c.pin_id for update;
  select * into c from public.pin_checklist_items where id=p_item for update;
  if c.id is null or not public.can_edit_blueprints(c.project_id) then raise exception 'Only the project Engineer verifies checklist items'; end if;
  if exists(select 1 from public.qa_inspections where pin_id=c.pin_id and status in ('requested','in_progress')) then raise exception 'Finish the pending QA inspection first'; end if;
  if c.review_status='verified' and p_accept then raise exception 'This checklist item is already verified'; end if;
  if p_accept then
    if not c.done or c.review_status<>'for_review' or not exists(select 1 from public.qa_inspections where id=c.review_inspection_id and status='passed') then
      raise exception 'This item must be submitted and pass QA before Engineer verification'; end if;
    if exists(select 1 from public.qa_defects where id in (select public.item_defect_ids(c.id)) and status<>'closed') then
      raise exception 'Close the open NCRs linked to this work item first'; end if;
    select * into s from public.pin_qa_submissions where inspection_id=c.review_inspection_id;
    select x into original from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text;
    if original is null or (original-array['review_status','review_inspection_id','verified_by','verified_at']) is distinct from
      (to_jsonb(c)-array['review_status','review_inspection_id','verified_by','verified_at']) or s.work_snapshot<>public.pin_qa_work(c.pin_id) then
      raise exception 'Work changed after inspection; submit again'; end if;
    if not exists(select 1 from public.pin_photos where checklist_item_id=c.id and public.photo_eligible(stamp_flag)) then raise exception 'Eligible photo evidence is required'; end if;
    update public.pin_checklist_items set review_status='verified',verified_by=auth.uid(),verified_at=now() where id=c.id;
  else
    if char_length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Provide a correction reason (at least 5 characters)'; end if;
    update public.pin_checklist_items set review_status='returned',verified_by=null,verified_at=null where id=c.id;
    if pn.status='verified' then update public.pins set status='in_progress' where id=pn.id; end if;
  end if;
  insert into public.pin_events(pin_id,project_id,kind,note) values(c.pin_id,c.project_id,'comment',left(c.text||case when p_accept then ': item verified by Engineer.' else ': returned. '||p_reason end,2000));
  if not (p_accept and public.try_complete_work(c.pin_id))
    and not exists(select 1 from public.pin_checklist_items where pin_id=c.pin_id and review_status='for_review') then
    update public.pins set status='in_progress' where id=c.pin_id and status='for_review'; end if;
  perform public.notify_user(pn.assigned_to,'qa.item_review',case when p_accept then 'Checklist item verified' else 'Checklist correction required' end,
    left(c.text||coalesce(': '||p_reason,''),500),
    '/foreman/'||case when p_accept then 'quality-control' else 'issues' end||'?project='||c.project_id||'&item='||c.id,c.project_id,c.id);
end; $$;

-- A rejected NCR correction routes the work item back to the Foreman's correction form (unless a re-inspection is still open:
-- its result decides). Closing the last blocking NCR completes the work when every item is already accepted.
create or replace function public.verify_defect(p_id uuid, p_close boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.qa_defects; returned integer := 0;
begin
  select * into d from public.qa_defects where id = p_id for update;
  if d.id is null or not public.can_edit_blueprints(d.project_id) then raise exception 'Defect not found or you are not allowed to verify it'; end if;
  if d.status <> 'for_verification' then raise exception 'Only a defect sent for verification can be closed or sent back'; end if;
  if btrim(coalesce(p_note, '')) = '' or char_length(btrim(p_note)) < 5 then raise exception 'Write a verification note (at least 5 characters)'; end if;
  if p_close then
    update public.qa_defects set status = 'closed', closed_at = now(), closed_by = auth.uid(), closing_note = btrim(p_note), updated_at = now() where id = p_id;
    insert into public.qa_defect_events (defect_id, project_id, kind, from_status, to_status, note) values (p_id, d.project_id, 'closed', d.status, 'closed', btrim(p_note));
  else
    update public.qa_defects set status = 'in_progress', fixed_at = null, fixed_by = null, updated_at = now() where id = p_id;
    insert into public.qa_defect_events (defect_id, project_id, kind, from_status, to_status, note) values (p_id, d.project_id, 'rejected', d.status, 'in_progress', btrim(p_note));
    if d.pin_id is not null and not exists(select 1 from public.qa_inspections where pin_id = d.pin_id and status in ('requested', 'in_progress')) then
      perform 1 from public.pins where id = d.pin_id for update;
      update public.pin_checklist_items c set review_status = 'returned', verified_by = null, verified_at = null
        where c.pin_id = d.pin_id and c.review_status = 'for_review' and d.id in (select public.item_defect_ids(c.id));
      get diagnostics returned = row_count;
      if returned > 0 then
        if not exists(select 1 from public.pin_checklist_items where pin_id = d.pin_id and review_status = 'for_review') then
          update public.pins set status = 'in_progress' where id = d.pin_id and status = 'for_review';
        end if;
        insert into public.pin_events (pin_id, project_id, kind, note) values (d.pin_id, d.project_id, 'comment',
          left('NCR-' || lpad(d.number::text, 4, '0') || ' correction sent back; ' || returned || ' work item(s) returned for correction. ' || btrim(p_note), 2000));
      end if;
    end if;
  end if;
  if d.assigned_to is not null and d.assigned_to is distinct from auth.uid() then
    perform public.notify_user(d.assigned_to, case when p_close then 'qa.defect_closed' else 'qa.defect_rejected' end,
      case when p_close then 'Closed: NCR-' else 'Sent back: NCR-' end || lpad(d.number::text, 4, '0'), left(btrim(p_note), 200), '/foreman/issues?project=' || d.project_id || '&defect=' || p_id, d.project_id, p_id);
  end if;
  if p_close and d.pin_id is not null then perform public.try_complete_work(d.pin_id); end if;
end;
$$;

-- A passed stage / hold-point inspection can be the last blocker between accepted work items and completion.
create or replace function public.finish_work_qa() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.pin_qa_submissions;
begin
  if new.status=old.status or new.status not in ('passed','failed','conditional','cancelled') then return new; end if;
  select * into s from public.pin_qa_submissions where inspection_id=new.id;
  if s.id is null then
    if new.status='passed' and new.pin_id is not null then perform public.try_complete_work(new.pin_id); end if;
    return new;
  end if;
  if s.item_ids is not null then
    if new.status<>'passed' then update public.pin_checklist_items set review_status='returned' where review_inspection_id=new.id; end if;
    if new.status<>'passed' then update public.pins set status='in_progress' where id=s.pin_id; end if;
  elsif new.status<>'passed' or not s.all_complete then
    update public.pins set status='in_progress' where id=s.pin_id and status='for_review';
  end if;
  insert into public.pin_events(pin_id,project_id,kind,note) values(s.pin_id,s.project_id,'comment',case when new.status='passed' then 'Inspection passed. ' else 'Sent back: inspection '||new.status||'. ' end||
    case when new.status='passed' then 'Engineer verifies the submitted checklist items next.' else coalesce(new.summary,'Correct the work and resubmit.') end);
  return new;
end; $$;

-- One correction package: the Foreman records the correction and new photos once (in the item's open correction draft), chooses
-- the linked NCRs it answers, and submits. Atomically: the items are re-submitted for QA (linked re-inspection) and every chosen
-- NCR goes For verification with the package remarks as its corrective action and the package photos as its evidence.
create function public.submit_correction_package(p_items uuid[], p_defects uuid[] default '{}', p_root_cause text default null,
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
  ir:=public.submit_checklist_qa(pid,items,p_note);
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

revoke all on function public.item_defect_ids(uuid), public.try_complete_work(uuid) from public, anon, authenticated;
revoke all on function public.submit_correction_package(uuid[],uuid[],text,text,text) from public, anon;
grant execute on function public.submit_correction_package(uuid[],uuid[],text,text,text) to authenticated;

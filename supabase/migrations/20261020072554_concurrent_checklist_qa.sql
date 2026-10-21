-- Hosted version 20261020072554; filename aligned after deployment.
-- Concurrent checklist-item QA: parent-pin lock serializes writes, but waiting for a review does not lock other items.
-- No submitted snapshots are rewritten. Legacy stage / whole-work request routes retain their own pin-wide gate.
alter table public.qa_inspections add column work_item_ids uuid[]
  check(work_item_ids is null or cardinality(work_item_ids) between 1 and 60);
drop index public.qa_one_pending_inspection_per_pin;
create unique index qa_one_pending_inspection_per_pin on public.qa_inspections(pin_id)
  where pin_id is not null and work_item_ids is null and status in ('requested','in_progress');

-- Checked read-only item preflight: RLS remains effective (invoker), and no anonymous access.
create function public.checklist_qa_submission_problem(p_item uuid) returns text
language plpgsql stable security invoker set search_path='' as $$
declare c public.pin_checklist_items; pn public.pins;
begin
  select * into c from public.pin_checklist_items where id=p_item;
  select * into pn from public.pins where id=c.pin_id;
  if c.id is null or not public.is_staff() or not public.can_view_project(c.project_id) then return 'Access denied'; end if;
  if pn.status='verified' then return 'Completed work must be reopened by the Engineer'; end if;
  if c.review_status='verified' then return 'This checklist item is already accepted by the Engineer'; end if;
  if exists(select 1 from public.qa_inspections i where i.pin_id=c.pin_id and i.status in ('requested','in_progress') and
    (c.id=any(i.work_item_ids) or i.id=c.review_inspection_id or exists(select 1 from public.pin_qa_submissions s where s.inspection_id=i.id
      and (c.id=any(s.item_ids) or (s.item_ids is null and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text and (x->>'done')::boolean)))))) then
    return 'QA inspection is already pending for this checklist item'; end if;
  if c.review_status='for_review' then return 'QA is already pending Engineer item verification for this checklist item'; end if;
  return null;
end; $$;
revoke all on function public.checklist_qa_submission_problem(uuid) from public,anon;
grant execute on function public.checklist_qa_submission_problem(uuid) to authenticated;

create or replace function public.guard_one_open_inspection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.work_item_ids is distinct from old.work_item_ids or new.pin_id is distinct from old.pin_id) then
    raise exception 'Inspection work-item scope is immutable'; end if;
  if new.pin_id is not null and new.status in ('requested','in_progress') then
    perform 1 from public.pins where id=new.pin_id for update;
    -- Starting an existing request does not create another one; other items may have been submitted since it was requested.
    if tg_op='UPDATE' and old.status in ('requested','in_progress') then return new; end if;
    if new.work_item_ids is null then
      if exists(select 1 from public.qa_inspections where pin_id=new.pin_id and id<>new.id and status in ('requested','in_progress')) then
        raise exception 'An inspection is already pending or in progress for this work. Finish it before submitting another stage QA request'; end if;
      if exists(select 1 from public.pin_checklist_items where pin_id=new.pin_id and review_status='for_review' and review_inspection_id is distinct from new.id) then
        raise exception 'Checklist QA is already pending Engineer item verification'; end if;
    else
      if cardinality(new.work_item_ids)<>(select count(distinct id) from public.pin_checklist_items where pin_id=new.pin_id and project_id=new.project_id and id=any(new.work_item_ids)) then
        raise exception 'Select distinct checklist items belonging to this work'; end if;
      if exists(select 1 from public.pin_checklist_items where id=any(new.work_item_ids) and (review_status='verified' or
        (review_status='for_review' and review_inspection_id is distinct from new.id))) then
        raise exception 'This checklist item is already pending review or accepted'; end if;
      if exists(select 1 from public.qa_inspections i where i.pin_id=new.pin_id and i.id<>new.id and i.status in ('requested','in_progress') and
        (i.work_item_ids && new.work_item_ids or exists(select 1 from public.pin_qa_submissions s where s.inspection_id=i.id and
          (s.item_ids && new.work_item_ids or (s.item_ids is null and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x
            where (x->>'id')::uuid=any(new.work_item_ids) and (x->>'done')::boolean)))))) then
        raise exception 'QA inspection is already pending for this checklist item'; end if;
    end if;
  elsif new.pin_id is null and new.status in ('requested','in_progress') then
    perform 1 from public.projects where id=new.project_id for update;
    if new.work_item_ids is not null then raise exception 'Work items require their work pin'; end if;
    if exists(select 1 from public.qa_inspections where project_id=new.project_id and pin_id is null and id<>new.id and template_id=new.template_id
      and lower(btrim(title))=lower(btrim(new.title)) and coalesce(location,'')=coalesce(new.location,'') and status in ('requested','in_progress')) then
      raise exception 'An inspection is already pending or in progress for this location and checklist'; end if;
  end if;
  if tg_op='INSERT' and new.escalation_owner is null then
    select user_id into new.escalation_owner from public.project_members where project_id=new.project_id and member_role='engineer' order by user_id limit 1;
  end if;
  return new;
end; $$;

create or replace function public.guard_work_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare pid uuid; cid uuid; pn public.pins; c public.pin_checklist_items; review_only boolean:=false; photo_id uuid;
begin
  pid:=case when tg_op='DELETE' then old.pin_id else new.pin_id end;
  select * into pn from public.pins where id=pid for update;
  if tg_table_name='pin_checklist_items' then
    cid:=case when tg_op='DELETE' then old.id else new.id end;
    if tg_op='UPDATE' then
      review_only:=(to_jsonb(new)-array['review_status','review_inspection_id','verified_by','verified_at'])=(to_jsonb(old)-array['review_status','review_inspection_id','verified_by','verified_at']);
      if not review_only and old.review_status='verified' then raise exception 'Reopen the checklist item before changing verified evidence'; end if;
      if not review_only and old.review_status='for_review' then raise exception 'Awaiting Engineer inspection: this checklist item and its evidence are locked'; end if;
      if not review_only and (new.done is distinct from old.done or new.text is distinct from old.text or new.remark is distinct from old.remark) then
        new.review_status:=case when old.review_inspection_id is null then 'not_submitted' else 'returned' end;
        new.review_inspection_id:=old.review_inspection_id; new.verified_at:=null; new.verified_by:=null;
      end if;
    end if;
  else
    cid:=case when tg_op='DELETE' then old.checklist_item_id else new.checklist_item_id end;
    if tg_op='UPDATE' and (new.checklist_item_id,new.qa_attempt_id) is distinct from (old.checklist_item_id,old.qa_attempt_id) then
      raise exception 'Evidence cannot move between checklist items or attempts'; end if;
    if tg_op in ('UPDATE','DELETE') then
      photo_id:=old.id;
      if exists(select 1 from public.pin_qa_submissions s,jsonb_array_elements(s.photos_snapshot) ph where s.pin_id=pid and ph->>'id'=photo_id::text) then
        raise exception 'Submitted photo evidence is immutable'; end if;
    end if;
  end if;
  select * into c from public.pin_checklist_items where id=cid;
  if not review_only and (pn.status='verified' or (cid is null and pn.status='for_review') or c.review_status in ('for_review','verified')) then
    raise exception 'Awaiting Engineer inspection or verified: this item and its evidence are locked'; end if;
  if not review_only and cid is not null and exists(select 1 from public.qa_inspections i join public.pin_qa_submissions s on s.inspection_id=i.id
    where i.pin_id=pid and i.status in ('requested','in_progress') and (cid=any(s.item_ids) or (s.item_ids is null and exists(
      select 1 from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=cid::text and (x->>'done')::boolean)))) then
    raise exception 'Awaiting Engineer inspection: this checklist item is locked'; end if;
  if tg_op='UPDATE' and new.pin_id is distinct from old.pin_id then raise exception 'Evidence cannot move between work items'; end if;
  if tg_op='DELETE' and tg_table_name='pin_checklist_items' and exists(select 1 from public.pin_qa_submissions s,jsonb_array_elements(s.checklist_snapshot) x
    where s.pin_id=pid and x->>'id'=old.id::text) then raise exception 'Submitted checklist history cannot be deleted'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create or replace function public.guard_pin_photo_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.checklist_item_id is not null and public.can_work_on_pin(old.pin_id)
    and not exists(select 1 from public.pin_qa_submissions s,jsonb_array_elements(s.photos_snapshot) x where s.pin_id=old.pin_id and x->>'id'=old.id::text)
    and exists(select 1 from public.pin_checklist_items c join public.pins p on p.id=c.pin_id where c.id=old.checklist_item_id
      and p.status<>'verified' and c.review_status not in ('for_review','verified')) then return old; end if;
  if exists(select 1 from public.pins where id=old.pin_id) and public.pin_has_evidence(old.pin_id) then
    raise exception 'This photo is evidence for submitted work and cannot be removed' using hint='evidence_locked'; end if;
  return old;
end; $$;

create or replace function public.request_work_item_inspection(p_project uuid, p_template uuid, p_title text, p_pin uuid, p_items uuid[], p_note text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  t public.qa_templates;
  v_id uuid;
  n integer;
  r record;
begin
  if not public.can_work_on_pin(p_pin) then raise exception 'Only the assigned active Foreman submits checklist QA'; end if;
  if not public.can_report_on_project(p_project) then raise exception 'You are not allowed to request inspections on this project'; end if;
  select * into t from public.qa_templates where id = p_template and not archived and (project_id is null or project_id = p_project);
  if t.id is null then raise exception 'That checklist is not available for this project'; end if;
  if p_pin is not null and not exists (select 1 from public.pins where id = p_pin and project_id = p_project) then raise exception 'That pin is not part of this project'; end if;
  n := public.next_qa_number(p_project, 'ir');
  insert into public.qa_inspections (project_id, number, template_id, title, trade, pin_id, location, request_note, standards,work_item_ids)
  values (p_project, n, t.id, btrim(p_title), t.trade, p_pin, null, nullif(btrim(coalesce(p_note, '')), ''), t.standards,p_items)
  returning id into v_id;
  insert into public.qa_inspection_items (inspection_id, project_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement)
  select v_id, p_project, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement from public.qa_template_items where template_id = t.id order by position;
  for r in select pm.user_id from public.project_members pm where pm.project_id = p_project and pm.member_role = 'engineer' and pm.user_id is distinct from auth.uid() loop
    perform public.notify_user(r.user_id, 'qa.requested', 'Inspection requested: ' || left(btrim(p_title), 120), 'IR-' || lpad(n::text, 4, '0') || ' - ' || t.name,
      '/engineer/qa?project=' || p_project || '&inspection=' || v_id, p_project, v_id);
  end loop;
  return v_id;
end;
$$;

revoke all on function public.request_work_item_inspection(uuid,uuid,text,uuid,uuid[],text) from public,anon,authenticated;

create or replace function public.save_work_checklist_item(p_pin uuid,p_item uuid,p_text text,p_criteria jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; c public.pin_checklist_items; criterion jsonb; template uuid; item_id uuid; why text;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_edit_blueprints(pn.project_id) then raise exception 'Only the project Engineer creates checklist items and their criteria'; end if;
  if pn.status='verified' then raise exception 'Completed work must be reopened by the Engineer'; end if;
  if char_length(btrim(coalesce(p_text,''))) not between 3 and 200 then raise exception 'Enter a work item name (3 to 200 characters)'; end if;
  if p_item is not null then
    select * into c from public.pin_checklist_items where id=p_item and pin_id=p_pin for update;
    if c.id is null then raise exception 'Checklist item not found on this work'; end if;
    if c.review_status in ('verified','for_review') or exists(select 1 from public.pin_qa_submissions s,jsonb_array_elements(s.checklist_snapshot) x where s.pin_id=p_pin and x->>'id'=p_item::text) then
      raise exception 'Submitted criteria are preserved with QA history; create a new checklist item for a different scope'; end if;
  end if;
  if p_criteria is null or jsonb_typeof(p_criteria)<>'array' or jsonb_array_length(p_criteria) not between 1 and 60 then
    raise exception 'Add between 1 and 60 inspection criteria before saving the checklist item'; end if;
  for criterion in select value from jsonb_array_elements(p_criteria) loop
    if char_length(btrim(coalesce(criterion->>'text',''))) not between 3 and 500 or char_length(btrim(coalesce(criterion->>'acceptance_criteria',''))) not between 5 and 1000 then
      raise exception 'Each criterion needs a test/check and a specific passing requirement'; end if;
    if char_length(coalesce(criterion->>'reference',''))>200 or char_length(coalesce(criterion->>'evidence_requirement',''))>1000 then raise exception 'Criterion reference or evidence instructions are too long'; end if;
  end loop;
  template:=public.save_qa_template(null,pn.project_id,left(pn.title||' / '||btrim(p_text),120),'general',
    'Criteria defined by the Engineer with the work checklist item','{}',p_criteria);
  if p_item is null then
    insert into public.pin_checklist_items(pin_id,project_id,text,qa_template_id) values(p_pin,pn.project_id,btrim(p_text),template) returning id into item_id;
  else
    update public.pin_checklist_items set text=btrim(p_text),qa_template_id=template where id=p_item returning id into item_id;
  end if;
  insert into public.pin_events(pin_id,project_id,kind,note) values(p_pin,pn.project_id,'comment','Engineer saved checklist item and inspection criteria: '||btrim(p_text));
  return item_id;
end; $$;

create or replace function public.submit_checklist_qa(p_pin uuid,p_items uuid[],p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; ir uuid; previous uuid; selected uuid[]; c public.pin_checklist_items; a public.qa_work_attempts; prior uuid; criteria uuid; chosen uuid; why text;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_work_on_pin(p_pin) then raise exception 'Only the active Foreman assigned to this work may submit it'; end if;
  if pn.status='verified' then raise exception 'Completed work must be reopened by the Engineer'; end if;
  select array_agg(distinct id) into selected from public.pin_checklist_items where pin_id=p_pin and id=any(p_items);
  if coalesce(cardinality(selected),0)=0 or cardinality(selected)<>(select count(distinct x) from unnest(p_items) x) then raise exception 'Select checklist items belonging to this work'; end if;
  for c in select * from public.pin_checklist_items where id=any(selected) order by id for update loop
    why:=public.checklist_qa_submission_problem(c.id);
    if why is not null then raise exception '%',why; end if;
    chosen:=coalesce(c.qa_template_id,case when public.pin_qa_template_approved(p_pin) then pn.qa_template_id end);
    if chosen is null or not exists(select 1 from public.qa_templates t where t.id=chosen and not t.archived
      and (t.project_id is null or t.project_id=pn.project_id) and exists(select 1 from public.qa_template_items where template_id=t.id)) then
      raise exception 'The Engineer must add inspection criteria to % first',c.text; end if;
    if criteria is not null and criteria<>chosen then raise exception 'Submit items with different inspection criteria separately'; end if;
    criteria:=chosen;
    select s.inspection_id into prior from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
      where s.pin_id=p_pin and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text and (x->>'done')::boolean)
      order by i.number desc limit 1;
    select * into a from public.qa_work_attempts where item_id=c.id and submitted_inspection_id is null for update;
    if prior is not null then
      if a.id is null or a.previous_inspection_id<>prior then raise exception 'Prepare a separate resubmission for each previously submitted item'; end if;
      if char_length(btrim(a.remarks))<5 then raise exception 'Describe the correction in the new attempt remarks (at least 5 characters)'; end if;
      if not exists(select 1 from public.pin_photos ph where ph.checklist_item_id=c.id and ph.qa_attempt_id=a.id and public.photo_eligible(ph.stamp_flag)) then
        raise exception 'Add new eligible photos to this resubmission. Photos from the old request do not count'; end if;
      update public.pin_checklist_items set remark=a.remarks where id=c.id;
    elsif not exists(select 1 from public.pin_photos ph where ph.checklist_item_id=c.id and ph.qa_attempt_id is null and public.photo_eligible(ph.stamp_flag)) then
      raise exception 'Every submitted item requires eligible photo evidence; away-from-site or invalid-time photos do not count';
    end if;
    -- The submission itself declares the work finished; no separate Ready action.
    if not c.done then update public.pin_checklist_items set done=true where id=c.id; end if;
  end loop;
  select s.inspection_id into previous from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
    where s.pin_id=p_pin and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where (x->>'id')::uuid=any(selected) and (x->>'done')::boolean)
    order by i.number desc limit 1;
  ir:=public.request_work_item_inspection(pn.project_id,criteria,left(pn.title,160),p_pin,selected,
    left(case when previous is null then 'Initial checklist submission. ' else 'Resubmission of corrected checklist work. ' end||coalesce(p_note,''),2000));
  update public.qa_inspections set reinspection_of=previous where id=ir;
  -- Corrections are judged against the previous request's frozen criteria, not later library edits.
  if previous is not null then
    delete from public.qa_inspection_items where inspection_id=ir;
    insert into public.qa_inspection_items(inspection_id,project_id,position,text,severity,kind,unit,min_value,max_value,reference,requires_photo,hold_point,acceptance_criteria,evidence_requirement)
      select ir,pn.project_id,position,text,severity,kind,unit,min_value,max_value,reference,requires_photo,hold_point,acceptance_criteria,evidence_requirement
      from public.qa_inspection_items where inspection_id=previous order by position;
  end if;
  insert into public.pin_qa_submissions(project_id,pin_id,inspection_id,template_id,submitted_by,checklist_snapshot,photos_snapshot,work_snapshot,all_complete,item_ids)
    select pn.project_id,p_pin,ir,criteria,auth.uid(),
      (select jsonb_agg(to_jsonb(ci) order by ci.id) from public.pin_checklist_items ci where id=any(selected)),
      coalesce((select jsonb_agg(to_jsonb(ph) order by ph.id) from public.pin_photos ph where ph.checklist_item_id=any(selected) and (
        ph.qa_attempt_id in (select id from public.qa_work_attempts where item_id=any(selected) and submitted_inspection_id is null)
        or (ph.qa_attempt_id is null and not exists(select 1 from public.pin_qa_submissions old_s,jsonb_array_elements(old_s.checklist_snapshot) x
          where old_s.pin_id=p_pin and x->>'id'=ph.checklist_item_id::text and (x->>'done')::boolean)))),'[]'::jsonb),
      public.pin_qa_work(p_pin),not exists(select 1 from public.pin_checklist_items where pin_id=p_pin and not done),selected;
  update public.qa_work_attempts set submitted_inspection_id=ir,updated_at=now() where item_id=any(selected) and submitted_inspection_id is null;
  update public.pin_checklist_items set review_status='for_review',review_inspection_id=ir where id=any(selected);
  update public.pins set status='for_review' where id=p_pin;
  insert into public.pin_events(pin_id,project_id,kind,note) values(p_pin,pn.project_id,'comment',
    case when previous is null then 'Initial QA request: ' else 'QA resubmission: ' end||cardinality(selected)||' item(s); inspection '||ir||coalesce('; replaces request '||previous,'')||'.');
  return ir;
end; $$;

create or replace function public.begin_checklist_resubmission(p_item uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.pin_checklist_items; pn public.pins; previous uuid; draft uuid;
begin
  select * into c from public.pin_checklist_items where id=p_item;
  select * into pn from public.pins where id=c.pin_id for update;
  select * into c from public.pin_checklist_items where id=p_item for update;
  if c.id is null or not public.can_work_on_pin(c.pin_id) then raise exception 'Only the assigned active Foreman prepares corrections'; end if;
  if pn.status='verified' or c.review_status in ('for_review','verified') or exists(select 1 from public.qa_inspections where id=c.review_inspection_id and status in ('requested','in_progress')) then raise exception 'Finish this item pending inspection or Engineer verification before preparing another submission'; end if;
  select id into draft from public.qa_work_attempts where item_id=c.id and submitted_inspection_id is null;
  if draft is not null then return draft; end if;
  select s.inspection_id into previous from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
    where s.pin_id=c.pin_id and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text and (x->>'done')::boolean)
    order by i.number desc limit 1;
  if previous is null then raise exception 'This item has no earlier submission; upload its initial evidence and submit it first'; end if;
  insert into public.qa_work_attempts(project_id,pin_id,item_id,previous_inspection_id,created_by)
    values(c.project_id,c.pin_id,c.id,previous,auth.uid()) returning id into draft;
  insert into public.pin_events(pin_id,project_id,kind,note) values(c.pin_id,c.project_id,'comment','Correction draft opened for '||c.text||'; previous inspection '||previous||'. Original evidence remains unchanged.');
  return draft;
end; $$;

create or replace function public.save_checklist_attempt(p_attempt uuid,p_remarks text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.qa_work_attempts;
begin
  select * into a from public.qa_work_attempts where id=p_attempt;
  perform 1 from public.pins where id=a.pin_id for update;
  select * into a from public.qa_work_attempts where id=p_attempt for update;
  if a.id is null or not public.can_work_on_pin(a.pin_id) then raise exception 'Only the assigned active Foreman edits correction evidence'; end if;
  if a.submitted_inspection_id is not null then raise exception 'Submitted attempt remarks are immutable; prepare a new correction'; end if;
  if exists(select 1 from public.qa_inspections where id=(select review_inspection_id from public.pin_checklist_items where id=a.item_id) and status in ('requested','in_progress')) then raise exception 'An inspection is already pending'; end if;
  update public.qa_work_attempts set remarks=left(btrim(coalesce(p_remarks,'')),1000),updated_at=now() where id=a.id;
  insert into public.pin_events(pin_id,project_id,kind,note) values(a.pin_id,a.project_id,'comment','Correction remarks saved for attempt '||a.id||'.');
end; $$;

create or replace function public.review_checklist_item(p_item uuid,p_accept boolean,p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare c public.pin_checklist_items; pn public.pins; s public.pin_qa_submissions; original jsonb;
begin
  select * into c from public.pin_checklist_items where id=p_item;
  select * into pn from public.pins where id=c.pin_id for update;
  select * into c from public.pin_checklist_items where id=p_item for update;
  if c.id is null or not public.can_edit_blueprints(c.project_id) then raise exception 'Only the project Engineer verifies checklist items'; end if;
  if exists(select 1 from public.qa_inspections where id=c.review_inspection_id and status in ('requested','in_progress')) then raise exception 'Finish the pending QA inspection first'; end if;
  if c.review_status='verified' and p_accept then raise exception 'This checklist item is already verified'; end if;
  if p_accept then
    if not c.done or c.review_status<>'for_review' or not exists(select 1 from public.qa_inspections where id=c.review_inspection_id and status='passed') then
      raise exception 'This item must be submitted and pass QA before Engineer verification'; end if;
    if exists(select 1 from public.qa_defects where id in (select public.item_defect_ids(c.id)) and status<>'closed') then
      raise exception 'Close the open NCRs linked to this work item first'; end if;
    select * into s from public.pin_qa_submissions where inspection_id=c.review_inspection_id;
    select x into original from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text;
    -- Snapshots created before item-specific criteria do not have this additive column.
    if original is not null and not (original ? 'qa_template_id') then original:=original||jsonb_build_object('qa_template_id',null); end if;
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
    and not exists(select 1 from public.pin_checklist_items where pin_id=c.pin_id and review_status='for_review')
    and not exists(select 1 from public.qa_inspections where pin_id=c.pin_id and status in ('requested','in_progress')) then
    update public.pins set status='in_progress' where id=c.pin_id and status='for_review'; end if;
  perform public.notify_user(pn.assigned_to,'qa.item_review',case when p_accept then 'Checklist item verified' else 'Checklist correction required' end,
    left(c.text||coalesce(': '||p_reason,''),500),
    '/foreman/'||case when p_accept then 'quality-control' else 'issues' end||'?project='||c.project_id||'&item='||c.id,c.project_id,c.id);
end; $$;

create or replace function public.finish_work_qa() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.pin_qa_submissions;
begin
  if new.status=old.status or new.status not in ('passed','failed','conditional','cancelled') then return new; end if;
  select * into s from public.pin_qa_submissions where inspection_id=new.id;
  if s.id is null then
    if new.status='passed' and new.pin_id is not null then perform public.try_complete_work(new.pin_id); end if;
    if new.pin_id is not null and not exists(select 1 from public.qa_inspections where pin_id=new.pin_id and status in ('requested','in_progress'))
      and not exists(select 1 from public.pin_checklist_items where pin_id=new.pin_id and review_status='for_review') then
      update public.pins set status='in_progress' where id=new.pin_id and status='for_review'; end if;
    return new;
  end if;
  if s.item_ids is not null then
    if new.status<>'passed' then update public.pin_checklist_items set review_status='returned' where review_inspection_id=new.id; end if;
    if new.status<>'passed' then update public.pins set status=case
      when exists(select 1 from public.qa_inspections where pin_id=s.pin_id and status in ('requested','in_progress'))
        or exists(select 1 from public.pin_checklist_items where pin_id=s.pin_id and review_status='for_review') then 'for_review'::public.pin_status
      else 'in_progress'::public.pin_status end where id=s.pin_id; end if;
  elsif new.status<>'passed' or not s.all_complete then
    update public.pins set status=case
      when exists(select 1 from public.qa_inspections where pin_id=s.pin_id and status in ('requested','in_progress'))
        or exists(select 1 from public.pin_checklist_items where pin_id=s.pin_id and review_status='for_review') then 'for_review'::public.pin_status
      else 'in_progress'::public.pin_status end where id=s.pin_id and status='for_review';
  end if;
  insert into public.pin_events(pin_id,project_id,kind,note) values(s.pin_id,s.project_id,'comment',case when new.status='passed' then 'Inspection passed. ' else 'Sent back: inspection '||new.status||'. ' end||
    case when new.status='passed' then 'Engineer verifies the submitted checklist items next.' else coalesce(new.summary,'Correct the work and resubmit.') end);
  return new;
end; $$;

notify pgrst, 'reload schema';

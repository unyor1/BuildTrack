-- Hosted version 20261020064247; local filename aligned after deployment.
-- Preserve acceptance of requests created before the additive item-criteria column.
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
    and not exists(select 1 from public.pin_checklist_items where pin_id=c.pin_id and review_status='for_review') then
    update public.pins set status='in_progress' where id=c.pin_id and status='for_review'; end if;
  perform public.notify_user(pn.assigned_to,'qa.item_review',case when p_accept then 'Checklist item verified' else 'Checklist correction required' end,
    left(c.text||coalesce(': '||p_reason,''),500),
    '/foreman/'||case when p_accept then 'quality-control' else 'issues' end||'?project='||c.project_id||'&item='||c.id,c.project_id,c.id);
end; $$;

-- Engineer defines criteria while creating the work checklist item. Foreman submits directly.
-- Existing pin-level selections and immutable historical snapshots are retained for compatibility.
alter table public.pin_checklist_items add column qa_template_id uuid references public.qa_templates(id);
create index checklist_item_qa_template on public.pin_checklist_items(qa_template_id) where qa_template_id is not null;
-- This field is deliberately not granted for client INSERT/UPDATE: only the checked RPC writes it.

-- Legacy whole-pin snapshots predate the new column. Null additions must not invalidate their existing Pass.
create or replace function public.pin_qa_checklist(p_pin uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(case when c.qa_template_id is null then to_jsonb(c)-'qa_template_id' else to_jsonb(c) end order by c.id),'[]'::jsonb)
  from public.pin_checklist_items c where c.pin_id=p_pin;
$$;

create function public.save_work_checklist_item(p_pin uuid,p_item uuid,p_text text,p_criteria jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; c public.pin_checklist_items; criterion jsonb; template uuid; item_id uuid; why text;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_edit_blueprints(pn.project_id) then raise exception 'Only the project Engineer creates checklist items and their criteria'; end if;
  why:=public.pin_qa_submission_problem(p_pin);
  if why is not null then raise exception '%',why; end if;
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

notify pgrst, 'reload schema';
revoke all on function public.save_work_checklist_item(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.save_work_checklist_item(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.submit_checklist_qa(p_pin uuid,p_items uuid[],p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; ir uuid; previous uuid; selected uuid[]; c public.pin_checklist_items; a public.qa_work_attempts; prior uuid; criteria uuid; chosen uuid;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_work_on_pin(p_pin) then raise exception 'Only the active Foreman assigned to this work may submit it'; end if;
  if pn.status='verified' then raise exception 'Completed work must be reopened by the Engineer'; end if;
  if pn.status='for_review' or exists(select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress'))
    or exists(select 1 from public.pin_checklist_items where pin_id=p_pin and review_status='for_review') then
    raise exception 'An inspection is already pending or in progress. Finish it before submitting another QA request'; end if;
  select array_agg(distinct id) into selected from public.pin_checklist_items where pin_id=p_pin and id=any(p_items);
  if coalesce(cardinality(selected),0)=0 or cardinality(selected)<>(select count(distinct x) from unnest(p_items) x) then raise exception 'Select checklist items belonging to this work'; end if;
  for c in select * from public.pin_checklist_items where id=any(selected) order by id for update loop
    if c.review_status in ('verified','for_review') then raise exception 'Only unverified items can be submitted for review'; end if;
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
  ir:=public.request_inspection(pn.project_id,criteria,left(pn.title,160),p_pin,null,
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

-- Follow-up to 20261023075351_away_photo_counts: away-from-site photos now count, so the Foreman-facing message of
-- submit_checklist_qa no longer lists them. The body is the applied 20261020072554 version, unchanged except that message
-- (live md5 of the old body: 4736310bc7b23fee40ef29ae8a034007). Grants are kept by create or replace.

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
      raise exception 'Every submitted item requires eligible photo evidence; photos with a wrong phone clock or older than 3 days do not count';
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

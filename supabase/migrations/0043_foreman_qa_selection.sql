-- 0043: Foreman selects an existing QA checklist; Engineer retains inspection/verification authority.
-- No new browser-side write permission on pins or QA results. Existing evidence and snapshot locks remain.
create or replace function public.guard_work_qa_config() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.qa_template_id is not null) or (tg_op = 'UPDATE' and new.qa_template_id is distinct from old.qa_template_id) then
    if tg_op = 'INSERT' or not public.can_work_on_pin(new.id) then raise exception 'Only the assigned active Foreman selects the QA checklist'; end if;
    if old.status in ('for_review','verified') or exists(select 1 from public.qa_inspections where pin_id=new.id and status in ('requested','in_progress')) then raise exception 'Finish the current review before changing the QA checklist'; end if;
    if new.qa_template_id is not null and not exists (select 1 from public.qa_templates where id = new.qa_template_id and not archived
      and (project_id is null or project_id = new.project_id)) then raise exception 'QA checklist is not available for this project'; end if;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.pin_qa_submissions s join public.qa_inspections i on i.id = s.inspection_id
      where s.pin_id = old.id and i.status in ('requested', 'in_progress')) then
    if new.status <> 'for_review' or new.qa_template_id is distinct from old.qa_template_id
      or new.assigned_to is distinct from old.assigned_to or new.title is distinct from old.title
      or new.description is distinct from old.description or new.blueprint_id is distinct from old.blueprint_id
      or new.revision_id is distinct from old.revision_id or new.x is distinct from old.x or new.y is distinct from old.y
      or new.category is distinct from old.category or new.discipline is distinct from old.discipline then
      raise exception 'Awaiting Engineer inspection: complete or cancel the inspection before changing this work';
    end if;
  end if;
  if tg_op='UPDATE' and old.status='verified' and new.status='verified' and (
    new.title is distinct from old.title or new.description is distinct from old.description
    or new.qa_template_id is distinct from old.qa_template_id or new.revision_id is distinct from old.revision_id
    or new.x is distinct from old.x or new.y is distinct from old.y
    or new.category is distinct from old.category or new.discipline is distinct from old.discipline) then
    raise exception 'The Engineer must reopen verified work before changing it';
  end if;
  return new;
end;
$$;

create function public.select_pin_qa_checklist(p_pin uuid, p_template uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pn public.pins;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_work_on_pin(p_pin) then raise exception 'Only the assigned active Foreman selects the QA checklist'; end if;
  if pn.status in ('for_review','verified') or exists(select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress')) then
    raise exception 'Finish the current review before changing the QA checklist';
  end if;
  if p_template is null or not exists(select 1 from public.qa_templates t where t.id=p_template and not t.archived
    and (t.project_id is null or t.project_id=pn.project_id)
    and exists(select 1 from public.qa_template_items where template_id=t.id)) then
    raise exception 'Select an available QA checklist with inspection items for this project';
  end if;
  update public.pins set qa_template_id=p_template where id=p_pin;
end;
$$;
revoke all on function public.select_pin_qa_checklist(uuid,uuid) from public,anon;
grant execute on function public.select_pin_qa_checklist(uuid,uuid) to authenticated;

create or replace function public.submit_pin_qa(p_pin uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pn public.pins; ir uuid; previous uuid; snap jsonb; complete boolean;
begin
  select * into pn from public.pins where id = p_pin for update;
  if pn.id is null or not public.can_work_on_pin(p_pin) then
    raise exception 'Only the active Foreman assigned to this work may submit it';
  end if;
  if pn.status = 'verified' then raise exception 'Verified work cannot be submitted'; end if;
  if exists (select 1 from public.qa_inspections where pin_id = p_pin and status in ('requested', 'in_progress')) then
    raise exception 'Awaiting Engineer inspection: an inspection is already pending or in progress';
  end if;
  if not exists (select 1 from public.qa_templates t where t.id = pn.qa_template_id and not t.archived
      and (t.project_id is null or t.project_id = pn.project_id))
     or not exists (select 1 from public.qa_template_items where template_id = pn.qa_template_id) then
    raise exception 'Select an available QA checklist with inspection items before submitting';
  end if;
  if not exists (select 1 from public.pin_checklist_items where pin_id = p_pin) then
    raise exception 'The Engineer must configure the work checklist first';
  end if;
  if exists (select 1 from public.pin_checklist_items c where c.pin_id = p_pin and c.done
      and not exists (select 1 from public.pin_photos ph where ph.checklist_item_id = c.id)) then
    raise exception 'Every completed checklist item requires photo evidence';
  end if;
  snap := public.pin_qa_checklist(p_pin);
  complete := not exists (select 1 from public.pin_checklist_items where pin_id = p_pin and not done);
  select s.inspection_id into previous from public.pin_qa_submissions s join public.qa_inspections i on i.id = s.inspection_id
    where s.pin_id = p_pin order by i.number desc limit 1;
  ir := public.request_inspection(pn.project_id, pn.qa_template_id, left(pn.title, 160), p_pin, null,
    left(case when complete then 'Complete work submission. ' else 'Partial work submission: outstanding items remain. ' end || coalesce(p_note, ''), 2000));
  update public.qa_inspections set reinspection_of = previous where id = ir;
  insert into public.pin_qa_submissions(project_id, pin_id, inspection_id, template_id, submitted_by,
      checklist_snapshot, photos_snapshot, work_snapshot, all_complete)
    select pn.project_id, p_pin, ir, pn.qa_template_id, auth.uid(), snap,
      coalesce((select jsonb_agg(to_jsonb(ph) order by ph.id) from public.pin_photos ph where ph.pin_id = p_pin), '[]'::jsonb),
      public.pin_qa_work(p_pin), complete;
  update public.pins set status = 'for_review' where id = p_pin;
  insert into public.pin_events(pin_id, project_id, kind, note) values
    (p_pin, pn.project_id, 'comment', case when complete then 'Submitted for QA inspection.' else 'Submitted for partial QA inspection; incomplete work is not final verification.' end);
  return ir;
end;
$$;



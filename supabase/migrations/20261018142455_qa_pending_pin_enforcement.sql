-- One pending inspection per work pin, regardless of which request route is used.
-- Do not repair duplicates by deleting history: fail deployment if a conflicting row exists.
create unique index qa_one_pending_inspection_per_pin on public.qa_inspections(pin_id)
  where pin_id is not null and status in ('requested','in_progress');

create function public.pin_qa_submission_problem(p_pin uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare pn public.pins; active_ir public.qa_inspections;
begin
  select * into pn from public.pins where id=p_pin;
  if pn.id is null or not public.is_staff() or not public.can_view_project(pn.project_id) then return 'Access denied'; end if;
  if pn.status='verified' then return 'Completed work must be reopened by the Engineer'; end if;
  select * into active_ir from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress') order by number limit 1;
  if active_ir.id is not null then
    return 'An inspection is already pending or in progress for this work (IR-'||lpad(active_ir.number::text,4,'0')||'). Finish it before submitting another QA request';
  end if;
  if exists(select 1 from public.pin_checklist_items where pin_id=p_pin and review_status='for_review') then
    return 'Checklist QA is already pending Engineer item verification. Finish it before submitting another request'; end if;
  if pn.status='for_review' then return 'This work is already pending Engineer review. Finish it before submitting another QA request'; end if;
  return null;
end; $$;
revoke all on function public.pin_qa_submission_problem(uuid) from public,anon;
grant execute on function public.pin_qa_submission_problem(uuid) to authenticated;

create or replace function public.request_inspection(p_project uuid,p_template uuid,p_title text,p_pin uuid default null,p_location text default null,p_note text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare why text;
begin
  if not public.can_report_on_project(p_project) then raise exception 'You are not allowed to request inspections on this project'; end if;
  if p_pin is not null then
    perform 1 from public.pins where id=p_pin and project_id=p_project for update;
    if not found then raise exception 'That pin is not part of this project'; end if;
    why:=public.pin_qa_submission_problem(p_pin);
    if why is not null then raise exception '%',why; end if;
  end if;
  return public.request_stage_inspection(p_project,p_template,p_title,p_pin,p_location,p_note);
end; $$;

create or replace function public.request_reinspection(p_id uuid,p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.qa_inspections; why text;
begin
  select * into i from public.qa_inspections where id=p_id;
  if i.id is null or not public.can_report_on_project(i.project_id) then raise exception 'Inspection not found or you are not allowed to request a re-inspection'; end if;
  if i.status not in ('failed','conditional') then raise exception 'Only a failed or conditional inspection can be re-inspected'; end if;
  if exists(select 1 from public.qa_inspections where reinspection_of=p_id and status in ('requested','in_progress')) then raise exception 'A re-inspection is already open'; end if;
  if exists(select 1 from public.pin_qa_submissions where inspection_id=p_id) then raise exception 'Resubmit from the assigned work checklist with confirmation'; end if;
  if i.pin_id is not null then
    perform 1 from public.pins where id=i.pin_id for update;
    why:=public.pin_qa_submission_problem(i.pin_id);
    if why is not null then raise exception '%',why; end if;
  end if;
  return public.request_stage_reinspection(p_id,p_note);
end; $$;

create or replace function public.submit_pin_qa(p_pin uuid,p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare why text;
begin
  perform 1 from public.pins where id=p_pin for update;
  if not public.can_work_on_pin(p_pin) then raise exception 'Only the active Foreman assigned to this work may submit it'; end if;
  why:=public.pin_qa_submission_problem(p_pin);
  if why is not null then raise exception '%',why; end if;
  if not exists(select 1 from public.pins where id=p_pin and qa_approved_by is not null) then
    raise exception 'Select an available QA checklist with inspection items before submitting; project Engineer approval is required'; end if;
  if exists(select 1 from public.pin_checklist_items c where c.pin_id=p_pin and c.done and not exists(
    select 1 from public.pin_photos ph where ph.checklist_item_id=c.id and public.photo_eligible(ph.stamp_flag))) then
    raise exception 'Every completed checklist item requires photo evidence that passes site and time checks'; end if;
  return public.legacy_submit_pin_qa(p_pin,p_note);
end; $$;

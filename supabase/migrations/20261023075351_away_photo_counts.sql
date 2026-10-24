-- Photos taken away from the project site count as evidence (owner's decision, 2026-10-23).
-- The database still computes and stores stamp_flag = 'away_from_site' with the distance, and the screens still show it.
-- Only a photo whose time cannot be trusted (phone clock ahead, or more than 3 days old) stays out of QA evidence.
-- photo_eligible() feeds every submission check, the inspection evidence guard and the Engineer's storage access
-- (evidence_image_allowed), so this one rule covers all of them. The two messages below drop the "site" wording.

create or replace function public.photo_eligible(p_flag text) returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_flag not in ('clock_ahead','old_photo'),true);
$$;

create or replace function public.guard_inspection_evidence_eligibility() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('passed','conditional','failed') and old.status not in ('passed','conditional','failed') and exists(
    select 1 from public.qa_inspection_items x where x.inspection_id=new.id and x.requires_photo and x.result in ('pass','fail')
      and not exists(select 1 from public.qa_photos p where p.item_id=x.id and public.photo_eligible(p.stamp_flag))) then
    raise exception 'Each required photo needs a trusted time; photos with the phone clock ahead or older than 3 days cannot satisfy QA'; end if;
  return new;
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
    raise exception 'Every completed checklist item requires photo evidence with a trusted time (phone clock correct, taken within 3 days)'; end if;
  return public.legacy_submit_pin_qa(p_pin,p_note);
end; $$;

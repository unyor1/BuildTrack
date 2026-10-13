-- 0037: pin_has_evidence (0033) answers only about pins the caller may see. A signed-in person asking about a pin of another
-- project gets "false" instead of a fact about it. Database-internal calls (service role, no signed-in user) keep the full check,
-- and the delete guards still work for everyone allowed to delete (deleting a pin or sheet implies being allowed to see it).

create or replace function public.pin_has_evidence(p_pin uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or exists (select 1 from public.pins where id = p_pin and public.can_view_project(project_id)))
     and (exists (select 1 from public.pins where id = p_pin and (status in ('for_review', 'verified') or verified_at is not null))
       or exists (select 1 from public.pin_events where pin_id = p_pin and kind = 'status' and to_status in ('for_review', 'verified')));
$$;

revoke execute on function public.pin_has_evidence(uuid) from public, anon;
grant execute on function public.pin_has_evidence(uuid) to authenticated;

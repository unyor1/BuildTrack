-- BuildTrack 0016: BUG FIX in the access-request guard from 0013.
-- Problem: guard_access_request_update() rejected EVERY status change except "the user cancels their own pending request".
-- That also blocked the people who are supposed to decide requests: the admin-users Edge Function (service role) that approves or
-- declines a request, and the whitelist (0015) that closes a pending request. Approving a request would have failed with
-- "You can only cancel your own pending request".
-- Fix: the restriction applies to ordinary API roles (authenticated, anon) only. Server-side code (service role, database
-- functions) may decide requests; users still cannot approve, edit or delete their own request.
-- Requires 0001-0015. Applied through the BUILDTRACK_MIGRATIONS connector.

create or replace function public.guard_access_request_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (
       old.status <> 'pending' or new.status <> 'cancelled'
       or new.user_id <> old.user_id or new.requested_role <> old.requested_role
       or new.discipline is distinct from old.discipline or new.message is distinct from old.message) then
    raise exception 'You can only cancel your own pending request';
  end if;
  return new;
end;
$$;

-- BuildTrack 0013: self-service sign-up with a base `user` role, and "Request elevated access".
-- New behavior (state machine):
--   sign-up (email+OTP or Google)  ->  profile: role `user`, status `active`   (no admin approval)
--   `user` -> "Request elevated access" (engineer | foreman | client) -> access_requests row `pending`
--   admin with users.approve approves  -> profile role becomes the requested role   (done by the admin-users Edge Function)
--   admin rejects                      -> request `rejected`, user stays `user` and may ask again
--   user may cancel their own pending request
-- A `user` can see no project data (RLS gives project data only to assigned members and admins).
-- Admin/Super Admin roles can never be requested or self-assigned. Role in sign-up metadata is still ignored.
-- Requires 0012. Applied through the BUILDTRACK_MIGRATIONS connector.

alter table public.profiles add column avatar_url text check (avatar_url is null or (avatar_url like 'https://%' and char_length(avatar_url) <= 500));

-- New sign-ups (email or Google): basic active user. Text from the identity provider is trimmed to sane lengths.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_avatar text := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
begin
  insert into public.profiles (id, email, full_name, phone, company, position, avatar_url, role, status)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120),
    left(new.raw_user_meta_data ->> 'phone', 40),
    left(new.raw_user_meta_data ->> 'company', 120),
    left(new.raw_user_meta_data ->> 'position', 120),
    case when v_avatar like 'https://%' and char_length(v_avatar) <= 500 then v_avatar end,
    'user',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- People who registered before this change and are still waiting for approval become basic users.
update public.profiles set role = 'user', status = 'active' where role is null and status = 'pending';

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  requested_role public.app_role not null check (requested_role in ('engineer', 'foreman', 'client')),
  discipline text check (discipline is null or discipline in ('civil_structural', 'architectural', 'mep')),
  message text check (message is null or char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  created_at timestamptz not null default now()
);
create unique index access_requests_one_pending on public.access_requests (user_id) where status = 'pending';
create index access_requests_status_idx on public.access_requests (status, created_at desc);

-- The database decides who is asking and the state; only basic, active users may ask.
create or replace function public.prepare_access_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.status <> 'active' or p.role is distinct from 'user' then
    raise exception 'Only a basic account can request elevated access';
  end if;
  new.user_id := p.id;
  new.status := 'pending';
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  return new;
end;
$$;
create trigger access_requests_prepare before insert on public.access_requests
  for each row execute function public.prepare_access_request();

-- Users may only cancel their own pending request; nothing else about a request can be changed by the user.
create or replace function public.guard_access_request_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'pending' or new.status <> 'cancelled'
     or new.user_id <> old.user_id or new.requested_role <> old.requested_role
     or new.discipline is distinct from old.discipline or new.message is distinct from old.message then
    raise exception 'You can only cancel your own pending request';
  end if;
  return new;
end;
$$;
create trigger access_requests_guard before update on public.access_requests
  for each row execute function public.guard_access_request_update();

create trigger access_requests_audit after insert or update on public.access_requests
  for each row execute function public.log_row_change();

revoke execute on function public.prepare_access_request(), public.guard_access_request_update()
  from public, anon, authenticated;

alter table public.access_requests enable row level security;

create policy "own requests, or admins who review users" on public.access_requests
  for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.approve') or public.has_permission('users.view'));
create policy "ask for elevated access" on public.access_requests
  for insert to authenticated with check (user_id = auth.uid());
create policy "cancel own pending request" on public.access_requests
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending') with check (user_id = auth.uid());

-- Approving / rejecting is done by the admin-users Edge Function (service role); users get no direct write beyond cancel.
revoke update on public.access_requests from authenticated, anon;
grant update (status) on public.access_requests to authenticated;
revoke delete on public.access_requests from authenticated, anon;

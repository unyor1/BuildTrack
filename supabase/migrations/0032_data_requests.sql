-- 0032: right to erasure ("delete my data", RA 10173).
--   * A person asks to have their personal data erased (`request_data_erasure`); one open request at a time.
--   * An administrator with users.approve declines it with a reason, or the `admin-users` Edge Function erases the data
--     (service role): ID documents, profile details, notifications, requests and the sign-in email are cleared and the
--     account is closed. Work records (reports, pins, QA) stay, because they belong to the project; they show "Deleted account".
--   * Administrators cannot request erasure here (a Super Admin must remove the admin role first).
--   * Everything is audited. The table is read-only to the API.

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'erase' check (kind in ('erase')),
  status text not null default 'open' check (status in ('open', 'done', 'declined', 'withdrawn')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500)
);
create unique index data_requests_one_open on public.data_requests (user_id) where status = 'open';
create index data_requests_status_idx on public.data_requests (status, created_at);

alter table public.data_requests enable row level security;
create policy "own request or reviewing admins" on public.data_requests for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.approve') or public.has_permission('users.view'));
revoke all on public.data_requests from anon, authenticated;
grant select on public.data_requests to authenticated;

create function public.request_data_erasure(p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  rid uuid;
  reason text := nullif(btrim(coalesce(p_reason, '')), '');
  admin_id uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Sign in first'; end if;
  if me.role in ('super_admin', 'admin') then raise exception 'Administrator accounts must first be changed to another role by a Super Admin'; end if;
  if reason is not null and char_length(reason) > 500 then raise exception 'Keep the reason under 500 characters'; end if;
  if exists (select 1 from public.data_requests where user_id = me.id and status = 'open') then raise exception 'You already have a request waiting'; end if;
  insert into public.data_requests (user_id, reason) values (me.id, reason) returning id into rid;
  insert into public.audit_log (actor_id, target_id, action, details) values (me.id, me.id, 'privacy.erasure_requested', jsonb_build_object('request', rid));
  for admin_id in
    select p.id from public.profiles p
    where p.status = 'active' and (p.role = 'super_admin' or (p.role = 'admin' and exists (select 1 from public.admin_permissions a where a.user_id = p.id and a.permission = 'users.approve')))
  loop
    perform public.notify_user(admin_id, 'privacy.erasure', 'Someone asked to delete their data', 'A data deletion request is waiting in User Management.', '/admin/user-management?tab=queue', null, rid);
  end loop;
  return rid;
end;
$$;

create function public.withdraw_data_request(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.data_requests set status = 'withdrawn', decided_at = now() where id = p_id and user_id = auth.uid() and status = 'open';
  if not found then raise exception 'Only a request that is still waiting can be withdrawn'; end if;
  insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), auth.uid(), 'privacy.erasure_withdrawn', jsonb_build_object('request', p_id));
end;
$$;

create function public.decline_data_request(p_id uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.data_requests; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_permission('users.approve') then raise exception 'Missing permission: users.approve'; end if;
  if note is null or char_length(note) < 5 then raise exception 'Tell the person why (at least 5 characters)'; end if;
  select * into r from public.data_requests where id = p_id for update;
  if r.id is null or r.status <> 'open' then raise exception 'This request was already decided'; end if;
  update public.data_requests set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = note where id = p_id;
  insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), r.user_id, 'privacy.erasure_declined', jsonb_build_object('request', p_id, 'note', note));
  perform public.notify_user(r.user_id, 'privacy.declined', 'Your deletion request was not carried out', note, '/user/home', null, p_id);
end;
$$;

-- Clears one person's personal data and closes the account. Service role only (the Edge Function deletes the files and the sign-in email).
create function public.erase_user_data(p_user uuid, p_request uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.data_requests;
  paths text[];
begin
  select * into r from public.data_requests where id = p_request and user_id = p_user for update;
  if r.id is null or r.status <> 'open' then raise exception 'No open request for this person'; end if;
  if exists (select 1 from public.profiles where id = p_user and role in ('super_admin', 'admin')) then raise exception 'Administrator accounts cannot be erased'; end if;
  select coalesce(array_agg(x), '{}') into paths from (
    select front_path x from public.identity_verifications where user_id = p_user
    union select back_path from public.identity_verifications where user_id = p_user and back_path is not null
    union select selfie_path from public.identity_verifications where user_id = p_user
  ) s;
  delete from public.identity_verifications where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.access_requests where user_id = p_user;
  delete from public.invite_redemptions where user_id = p_user;
  delete from public.whitelisted_emails where lower(email) = lower((select email from public.profiles where id = p_user));
  update public.profiles set
    full_name = 'Deleted account', email = 'deleted-' || p_user::text || '@erased.invalid', phone = null, company = null, position = null, avatar_url = null,
    status = 'disabled', identity_status = 'unverified', identity_verified_at = null
  where id = p_user;
  update public.data_requests set status = 'done', decided_by = p_actor, decided_at = now() where id = p_request;
  insert into public.audit_log (actor_id, target_id, action, details) values (p_actor, p_user, 'privacy.erased', jsonb_build_object('request', p_request, 'files', coalesce(array_length(paths, 1), 0)));
  perform public.revoke_user_sessions(p_user);
  return jsonb_build_object('paths', to_jsonb(paths));
end;
$$;

revoke execute on function public.request_data_erasure(text), public.withdraw_data_request(uuid), public.decline_data_request(uuid, text), public.erase_user_data(uuid, uuid, uuid) from public, anon;
grant execute on function public.request_data_erasure(text), public.withdraw_data_request(uuid), public.decline_data_request(uuid, text) to authenticated;
revoke execute on function public.erase_user_data(uuid, uuid, uuid) from authenticated;
grant execute on function public.erase_user_data(uuid, uuid, uuid) to service_role;

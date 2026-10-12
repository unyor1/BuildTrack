-- 0029: Strict Google gate, registration details, audit of status/role changes, session revocation.
--
-- Problem fixed: signing in with an unknown Google account used to create a profile that was ACTIVE straight away (role `user`).
-- Now a Google account that has never completed registration has NO access:
--   * a Google sign-up creates a profile with status `pending` (never active), `registration_completed_at` empty;
--   * the person must submit their details on /register (`complete_registration`), which keeps them `pending` for an administrator,
--     unless their email is on the whitelist (then the pre-assigned role is applied at once, as before);
--   * a login attempt (not a registration) with such an account is cut off by the Edge Function `oauth-gate`, which deletes the
--     half-created account and tells the person to register first.
-- Email + password sign-up is unchanged (verified by the 6-digit code, basic `user`, active).
--
-- Also: every status / role change on a profile is written to audit_log by the database itself (whoever or whatever made it), the
-- registration and the blocked login attempt are logged, and `revoke_user_sessions` lets the admin function end a person's sessions.

alter table public.profiles
  add column registration_completed_at timestamptz,
  add column requested_role public.app_role check (requested_role is null or requested_role in ('engineer', 'foreman', 'client')),
  add column signup_provider text check (signup_provider is null or signup_provider in ('email', 'google', 'admin'));
-- Everyone who exists today has already registered.
update public.profiles set registration_completed_at = created_at, signup_provider = 'email' where registration_completed_at is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_avatar text := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
  v_google boolean := coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'google';
begin
  insert into public.profiles (id, email, full_name, phone, company, position, avatar_url, role, status, registration_completed_at, signup_provider)
  values (
    new.id,
    lower(new.email),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120),
    left(new.raw_user_meta_data ->> 'phone', 40),
    left(new.raw_user_meta_data ->> 'company', 120),
    left(new.raw_user_meta_data ->> 'position', 120),
    case when v_avatar like 'https://%' and char_length(v_avatar) <= 500 then v_avatar end,
    'user',
    case when v_google then 'pending'::public.user_status else 'active'::public.user_status end,
    case when v_google then null else now() end,
    case when v_google then 'google' else 'email' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- The whitelist also frees a Google sign-up that is still waiting for details.
create or replace function public.apply_whitelist(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  confirmed timestamptz;
  w public.whitelisted_emails;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null or p.status not in ('active', 'pending') or p.role is distinct from 'user' then
    return false;
  end if;
  select email_confirmed_at into confirmed from auth.users where id = p_user;
  if confirmed is null then
    return false;
  end if;
  select * into w from public.whitelisted_emails where email = lower(p.email) and used_at is null for update;
  if w.id is null then
    return false;
  end if;
  update public.profiles
    set role = w.assigned_role, status = 'active', discipline = coalesce(w.discipline, discipline), approved_by = w.created_by, approved_at = now(),
        registration_completed_at = coalesce(registration_completed_at, now())
    where id = p.id;
  update public.whitelisted_emails set used_at = now(), used_by = p.id where id = w.id;
  update public.access_requests
    set status = 'approved', decided_by = w.created_by, decided_at = now(), decision_note = 'Pre-approved by the whitelist'
    where user_id = p.id and status = 'pending';
  insert into public.audit_log (actor_id, target_id, action, details)
  values (w.created_by, p.id, 'whitelist.apply', jsonb_build_object('email', p.email, 'role', w.assigned_role));
  return true;
end;
$$;

-- The details a Google sign-up must give before an administrator can decide.
create function public.complete_registration(p_full_name text, p_phone text, p_company text, p_position text, p_requested_role public.app_role, p_discipline text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  r record;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Profile not found'; end if;
  if p.status not in ('pending', 'active') then raise exception 'This account cannot register'; end if;
  if p.registration_completed_at is not null then raise exception 'Registration was already submitted'; end if;
  if char_length(btrim(coalesce(p_full_name, ''))) not between 2 and 120 then raise exception 'Enter your full name'; end if;
  if char_length(btrim(coalesce(p_phone, ''))) not between 7 and 40 or btrim(p_phone) !~ '^[0-9+()./ -]+$' then raise exception 'Enter a valid phone number'; end if;
  if p_requested_role is null or p_requested_role not in ('engineer', 'foreman', 'client') then raise exception 'Choose Engineer, Foreman or Client'; end if;
  if p_requested_role = 'engineer' and (p_discipline is null or p_discipline not in ('civil_structural', 'architectural', 'mep')) then raise exception 'Engineers choose a discipline'; end if;
  update public.profiles set
    full_name = btrim(p_full_name), phone = btrim(p_phone), company = left(nullif(btrim(coalesce(p_company, '')), ''), 120), position = left(nullif(btrim(coalesce(p_position, '')), ''), 120),
    requested_role = p_requested_role, discipline = case when p_requested_role = 'engineer' then p_discipline else null end, registration_completed_at = now()
  where id = p.id;
  insert into public.audit_log (actor_id, target_id, action, details)
  values (p.id, p.id, case when p.signup_provider = 'google' then 'oauth.enroll' else 'registration.submitted' end, jsonb_build_object('email', p.email, 'requested_role', p_requested_role, 'status', p.status));
  if p.status = 'pending' then
    for r in
      select pr.id from public.profiles pr
      where pr.status = 'active' and (pr.role = 'super_admin' or (pr.role = 'admin' and exists (select 1 from public.admin_permissions ap where ap.user_id = pr.id and ap.permission = 'users.approve')))
    loop
      perform public.notify_user(r.id, 'registration.new', 'New registration: ' || left(coalesce(nullif(btrim(p_full_name), ''), p.email), 100), 'Asked for ' || p_requested_role::text || ' access (' || p.email || ')', '/admin/user-management', null, p.id);
    end loop;
  end if;
  return p.status::text;
end;
$$;

-- Every status or role change is recorded by the database, whoever made it (admin function, whitelist, access approval, SQL).
create function public.trg_audit_profile_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), new.id, 'profile.status_changed', jsonb_build_object('from', old.status, 'to', new.status, 'email', new.email));
  end if;
  if old.role is distinct from new.role then
    insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), new.id, 'profile.role_changed', jsonb_build_object('from', old.role, 'to', new.role, 'email', new.email));
  end if;
  return new;
end;
$$;
create trigger profiles_audit_changes after update of status, role on public.profiles
  for each row when (old.status is distinct from new.status or old.role is distinct from new.role) execute function public.trg_audit_profile_changes();

-- Ends every session of a person (used when an admin disables or rejects an account). Service role only.
create function public.revoke_user_sessions(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.trg_audit_profile_changes(), public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;
revoke execute on function public.complete_registration(text, text, text, text, public.app_role, text) from public, anon;
grant execute on function public.complete_registration(text, text, text, text, public.app_role, text) to authenticated;

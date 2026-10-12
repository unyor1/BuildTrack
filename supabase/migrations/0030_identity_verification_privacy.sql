-- 0030: Identity verification (ID upload) for email sign-ups, and recorded data-privacy consent.
--
-- Email + password sign-up still gives a basic account straight away, but a person must VERIFY THEIR IDENTITY before they can ask for
-- elevated access (Engineer / Foreman / Client) or redeem an invitation code:
--   1. they fill in their legal details and upload a government ID (front, back where there is one) and a selfie holding it;
--   2. an administrator with `users.approve` (MFA) reviews the documents and approves or rejects with a reason;
--   3. approved -> `profiles.identity_status = 'verified'`; rejected -> they may correct and submit again.
-- Trusted paths skip it: an administrator creating the account, a whitelist entry, an approved registration or an invitation granted a role
-- (when a role is granted to a basic account the profile is marked verified by the trigger below). Everyone who exists today is grandfathered.
--
-- Data-privacy (Data Privacy Act of 2012, RA 10173): the person must accept the privacy notice (recorded, versioned) before sending personal
-- data; ID images live in a private bucket readable only by the owner and by admins with users.approve / users.view; every time an admin
-- opens the documents it is written to the audit log; admins can delete the images after the decision.

alter table public.profiles
  add column identity_status text not null default 'verified' check (identity_status in ('unverified', 'pending', 'verified', 'rejected')),
  add column identity_verified_at timestamptz;
update public.profiles set identity_verified_at = created_at;
alter table public.profiles alter column identity_status set default 'unverified';

-- ---------------------------------------------------------------- privacy consent
create table public.privacy_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('registration', 'identity', 'profile', 'admin_account', 'whitelist', 'client_report', 'general')),
  version text not null check (char_length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  unique (user_id, scope, version)
);
alter table public.privacy_consents enable row level security;
create policy "read own consents or admins" on public.privacy_consents for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.view') or public.has_permission('users.approve'));
revoke all on public.privacy_consents from anon, authenticated;
grant select on public.privacy_consents to authenticated;

create function public.record_privacy_consent(p_scope text, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_active() then raise exception 'Not signed in'; end if;
  if p_scope not in ('registration', 'identity', 'profile', 'admin_account', 'whitelist', 'client_report', 'general') then raise exception 'Unknown privacy scope'; end if;
  insert into public.privacy_consents (user_id, scope, version) values (auth.uid(), p_scope, left(btrim(p_version), 20)) on conflict do nothing;
end;
$$;

-- A sign-up that already accepted the notice (email registration form) carries it in its metadata; keep the record.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_avatar text := coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture');
  v_google boolean := coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'google';
  v_consent text := left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'consent_version', '')), ''), 20);
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
  if v_consent is not null then
    insert into public.privacy_consents (user_id, scope, version) values (new.id, 'registration', v_consent) on conflict do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- identity verification
create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'withdrawn')),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 120),
  birth_date date not null,
  address text not null check (char_length(btrim(address)) between 10 and 250),
  phone text not null check (char_length(btrim(phone)) between 7 and 40),
  id_type text not null check (id_type in ('philsys', 'passport', 'drivers_license', 'umid', 'prc', 'postal', 'voters', 'sss', 'philhealth', 'tin', 'senior_citizen', 'other')),
  id_last4 text not null check (id_last4 ~ '^[A-Za-z0-9]{3,4}$'),
  id_expiry date,
  front_path text not null check (char_length(front_path) between 10 and 300),
  back_path text check (back_path is null or char_length(back_path) between 10 and 300),
  selfie_path text not null check (char_length(selfie_path) between 10 and 300),
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  consented_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  docs_deleted_at timestamptz
);
create unique index identity_one_open on public.identity_verifications (user_id) where status = 'submitted';
create index identity_user_idx on public.identity_verifications (user_id, submitted_at desc);
create index identity_status_idx on public.identity_verifications (status, submitted_at);

alter table public.identity_verifications enable row level security;
create policy "own verification or reviewing admins" on public.identity_verifications for select to authenticated
  using (user_id = auth.uid() or public.has_permission('users.approve') or public.has_permission('users.view'));
revoke all on public.identity_verifications from anon, authenticated;
grant select on public.identity_verifications to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-docs', 'identity-docs', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "identity docs: view" on storage.objects for select to authenticated
  using (bucket_id = 'identity-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_permission('users.approve') or public.has_permission('users.view')));
create policy "identity docs: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'identity-docs' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active());
create policy "identity docs: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'identity-docs' and (
    public.has_permission('users.approve')
    or ((storage.foldername(name))[1] = auth.uid()::text
        and not exists (select 1 from public.identity_verifications v where v.status in ('submitted', 'approved') and name in (v.front_path, v.back_path, v.selfie_path)))));

create function public.submit_identity_verification(
  p_legal_name text, p_birth_date date, p_address text, p_phone text, p_id_type text, p_id_last4 text, p_id_expiry date,
  p_front_path text, p_back_path text, p_selfie_path text, p_consent_version text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  v_id uuid;
  r record;
  uid text := auth.uid()::text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.status <> 'active' then raise exception 'Your account is not active'; end if;
  if me.identity_status not in ('unverified', 'rejected') then raise exception 'Your identity is already verified or waiting for review'; end if;
  if p_birth_date is null or p_birth_date > current_date - interval '18 years' or p_birth_date < date '1900-01-01' then raise exception 'You must be at least 18 years old'; end if;
  if p_id_expiry is not null and p_id_expiry < current_date then raise exception 'That ID has expired. Use a valid ID'; end if;
  if btrim(coalesce(p_consent_version, '')) = '' then raise exception 'Accept the data privacy notice first'; end if;
  if p_front_path is null or p_selfie_path is null then raise exception 'Upload the front of your ID and a selfie holding it'; end if;
  if (select count(*) from public.identity_verifications where user_id = auth.uid() and submitted_at > now() - interval '1 day') >= 3 then raise exception 'Too many submissions today. Try again tomorrow'; end if;
  for r in select unnest(array[p_front_path, p_back_path, p_selfie_path]) as path loop
    if r.path is null then continue; end if;
    if split_part(r.path, '/', 1) <> uid then raise exception 'A file is not inside your own folder'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'identity-docs' and o.name = r.path) then raise exception 'A file was not uploaded'; end if;
  end loop;
  insert into public.identity_verifications (user_id, legal_name, birth_date, address, phone, id_type, id_last4, id_expiry, front_path, back_path, selfie_path, consent_version)
  values (auth.uid(), btrim(p_legal_name), p_birth_date, btrim(p_address), btrim(p_phone), p_id_type, upper(p_id_last4), p_id_expiry, p_front_path, p_back_path, p_selfie_path, left(btrim(p_consent_version), 20))
  returning id into v_id;
  update public.profiles set identity_status = 'pending' where id = auth.uid();
  insert into public.privacy_consents (user_id, scope, version) values (auth.uid(), 'identity', left(btrim(p_consent_version), 20)) on conflict do nothing;
  insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), auth.uid(), 'identity.submit', jsonb_build_object('id_type', p_id_type, 'verification', v_id));
  for r in
    select pr.id from public.profiles pr
    where pr.status = 'active' and (pr.role = 'super_admin' or (pr.role = 'admin' and exists (select 1 from public.admin_permissions ap where ap.user_id = pr.id and ap.permission = 'users.approve')))
  loop
    perform public.notify_user(r.id, 'identity.new', 'Identity to verify: ' || left(coalesce(nullif(btrim(p_legal_name), ''), me.email), 100), 'Sent ' || p_id_type || ' and a selfie (' || me.email || ')', '/admin/user-management?tab=queue', null, v_id);
  end loop;
  return v_id;
end;
$$;

create function public.withdraw_identity_verification(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.identity_verifications;
begin
  select * into v from public.identity_verifications where id = p_id and user_id = auth.uid() for update;
  if v.id is null or v.status <> 'submitted' then raise exception 'Only a submission that is still waiting can be withdrawn'; end if;
  update public.identity_verifications set status = 'withdrawn' where id = p_id;
  update public.profiles set identity_status = 'unverified' where id = auth.uid();
end;
$$;

create function public.decide_identity_verification(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.identity_verifications; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.has_permission('users.approve') then raise exception 'Missing permission: users.approve'; end if;
  select * into v from public.identity_verifications where id = p_id for update;
  if v.id is null then raise exception 'Verification not found'; end if;
  if v.user_id = auth.uid() then raise exception 'You cannot verify your own identity'; end if;
  if v.status <> 'submitted' then raise exception 'This submission was already decided'; end if;
  if not p_approve and (note is null or char_length(note) < 5) then raise exception 'Tell the person what to correct (at least 5 characters)'; end if;
  update public.identity_verifications set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now(), decision_note = note where id = p_id;
  update public.profiles set identity_status = case when p_approve then 'verified' else 'rejected' end, identity_verified_at = case when p_approve then now() else identity_verified_at end where id = v.user_id;
  insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), v.user_id, case when p_approve then 'identity.approve' else 'identity.reject' end, jsonb_build_object('verification', p_id, 'note', note));
  perform public.notify_user(v.user_id, case when p_approve then 'identity.approved' else 'identity.rejected' end,
    case when p_approve then 'Your identity is verified' else 'Your identity needs a correction' end,
    case when p_approve then 'You can now request access for your role.' else coalesce(note, 'Please check your details and documents and send them again.') end, '/user/home', null, p_id);
end;
$$;

-- Written every time an administrator opens the documents.
create function public.record_identity_view(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.identity_verifications;
begin
  if not (public.has_permission('users.approve') or public.has_permission('users.view')) then raise exception 'Missing permission'; end if;
  select * into v from public.identity_verifications where id = p_id;
  if v.id is null then raise exception 'Verification not found'; end if;
  insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), v.user_id, 'identity.view', jsonb_build_object('verification', p_id));
end;
$$;

-- After a decision the images can be deleted (the admin screen removes the files, then calls this to record it).
create function public.mark_identity_docs_deleted(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.identity_verifications;
begin
  if not public.has_permission('users.approve') then raise exception 'Missing permission: users.approve'; end if;
  select * into v from public.identity_verifications where id = p_id for update;
  if v.id is null or v.status not in ('approved', 'rejected', 'withdrawn') then raise exception 'Only a decided submission can have its images deleted'; end if;
  update public.identity_verifications set docs_deleted_at = now() where id = p_id;
  insert into public.audit_log (actor_id, target_id, action, details) values (auth.uid(), v.user_id, 'identity.docs_deleted', jsonb_build_object('verification', p_id));
end;
$$;

-- ---------------------------------------------------------------- who counts as verified
-- Elevated access needs verification; a role granted by an administrator, the whitelist, an approved registration or an invitation is trusted.
create function public.trg_trust_on_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role and new.role is not null and new.role <> 'user' and new.identity_status <> 'verified' then
    update public.profiles set identity_status = 'verified', identity_verified_at = now() where id = new.id;
  end if;
  return new;
end;
$$;
create trigger profiles_trust_on_role after update of role on public.profiles
  for each row when (new.role is distinct from old.role) execute function public.trg_trust_on_role();

create or replace function public.prepare_access_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null or p.status <> 'active' or p.role is distinct from 'user' then
    raise exception 'Only a basic account can request elevated access';
  end if;
  if p.identity_status <> 'verified' then
    raise exception 'Verify your identity first: upload your ID so an administrator can confirm who you are';
  end if;
  new.user_id := p.id;
  new.status := 'pending';
  new.decided_by := null;
  new.decided_at := null;
  new.decision_note := null;
  return new;
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  c public.invite_codes;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  confirmed timestamptz;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if me.role is distinct from 'user' then
    return jsonb_build_object('ok', false, 'reason', 'already_has_role');
  end if;
  if me.identity_status <> 'verified' then
    return jsonb_build_object('ok', false, 'reason', 'not_verified');
  end if;
  select email_confirmed_at into confirmed from auth.users where id = me.id;
  if confirmed is null then
    return jsonb_build_object('ok', false, 'reason', 'unconfirmed');
  end if;
  if (select count(*) from public.invite_attempts where user_id = me.id and not ok and created_at > now() - interval '1 hour') >= 8 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  select * into c from public.invite_codes
  where code = v_code and not disabled and expires_at > now() and uses < max_uses for update;
  if c.id is null then
    insert into public.invite_attempts (user_id, ok) values (me.id, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update public.profiles
    set role = c.assigned_role, discipline = coalesce(c.discipline, discipline), approved_by = c.created_by, approved_at = now()
    where id = me.id;
  update public.invite_codes set uses = uses + 1 where id = c.id;
  insert into public.invite_redemptions (code_id, user_id) values (c.id, me.id) on conflict do nothing;
  insert into public.invite_attempts (user_id, ok) values (me.id, true);
  update public.access_requests
    set status = 'approved', decided_by = c.created_by, decided_at = now(), decision_note = 'Joined with an invitation code'
    where user_id = me.id and status = 'pending';
  insert into public.audit_log (actor_id, target_id, action, details)
  values (c.created_by, me.id, 'invite.redeem', jsonb_build_object('role', c.assigned_role, 'email', me.email));
  return jsonb_build_object('ok', true, 'role', c.assigned_role);
end;
$$;

revoke execute on function public.trg_trust_on_role() from public, anon, authenticated;
revoke execute on function public.record_privacy_consent(text, text), public.submit_identity_verification(text, date, text, text, text, text, date, text, text, text, text),
  public.withdraw_identity_verification(uuid), public.decide_identity_verification(uuid, boolean, text), public.record_identity_view(uuid), public.mark_identity_docs_deleted(uuid) from public, anon;
grant execute on function public.record_privacy_consent(text, text), public.submit_identity_verification(text, date, text, text, text, text, date, text, text, text, text),
  public.withdraw_identity_verification(uuid), public.decide_identity_verification(uuid, boolean, text), public.record_identity_view(uuid), public.mark_identity_docs_deleted(uuid) to authenticated;

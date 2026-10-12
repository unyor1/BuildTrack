-- BuildTrack 0015: email whitelist. A trusted person whose email is on the list gets their pre-assigned role
-- the moment their email is CONFIRMED, with no access request and no admin review.
--
-- Security design:
--   * The role is applied when the email is confirmed (OTP verified, or Google which is already verified), NOT when the
--     account row is created. Otherwise someone could register with a trusted person's address, choose a password, and the real
--     owner could later confirm the code into the attacker's account.
--   * Runs in the database (a trigger on auth.users), so email sign-up, Google sign-in and admin-created accounts are all covered.
--   * Only engineer / foreman / client can be pre-assigned by an admin with users.approve; `admin` only by a Super Admin
--     (enforced in the Edge Function); `super_admin` can never be whitelisted.
--   * Entries are single-use. Used entries stay as history; unused entries can be removed.
--   * Writes go through the admin-users Edge Function (service role). Admins can only read the list.
-- If the person already has a basic account when their email is added, the role is applied immediately.
-- Requires 0001-0014. Applied through the BUILDTRACK_MIGRATIONS connector.

create table public.whitelisted_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  assigned_role public.app_role not null check (assigned_role in ('engineer', 'foreman', 'client', 'admin')),
  discipline text check (discipline is null or discipline in ('civil_structural', 'architectural', 'mep')),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null
);
create index whitelisted_emails_unused_idx on public.whitelisted_emails (email) where used_at is null;

-- Applies a matching, unused whitelist entry to a basic confirmed account. Returns true when a role was granted.
create or replace function public.apply_whitelist(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  confirmed timestamptz;
  w public.whitelisted_emails;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null or p.status <> 'active' or p.role is distinct from 'user' then
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
    set role = w.assigned_role, discipline = coalesce(w.discipline, discipline), approved_by = w.created_by, approved_at = now()
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

create or replace function public.trg_apply_whitelist()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_whitelist(new.id);
  return new;
end;
$$;

-- Fires after on_auth_user_created (alphabetical order), so the profile already exists for a Google / pre-confirmed sign-up.
create trigger on_auth_user_whitelist_insert
  after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public.trg_apply_whitelist();
create trigger on_auth_user_whitelist_confirm
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.trg_apply_whitelist();

-- Adding an email whose owner already has a confirmed basic account applies the role right away.
create or replace function public.trg_whitelist_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.apply_whitelist(p.id) from public.profiles p where p.email = new.email;
  return new;
end;
$$;
create trigger whitelisted_emails_added
  after insert on public.whitelisted_emails
  for each row execute function public.trg_whitelist_added();

create trigger whitelisted_emails_audit
  after insert or update or delete on public.whitelisted_emails
  for each row execute function public.log_row_change();

revoke execute on function public.apply_whitelist(uuid), public.trg_apply_whitelist(), public.trg_whitelist_added()
  from public, anon, authenticated;

alter table public.whitelisted_emails enable row level security;
create policy "admins who review users can read the whitelist" on public.whitelisted_emails
  for select to authenticated
  using (public.has_permission('users.approve') or public.has_permission('users.view'));
revoke insert, update, delete on public.whitelisted_emails from authenticated, anon;

-- BuildTrack 0001: profiles, RBAC, admin permissions, audit log.
-- Run once in Supabase Dashboard -> SQL Editor (BuildTrack project only).

create type public.app_role as enum ('super_admin', 'admin', 'engineer', 'foreman', 'client');
create type public.user_status as enum ('pending', 'active', 'rejected', 'disabled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  company text,
  position text,
  discipline text check (discipline in ('civil_structural', 'architectural', 'mep')),
  role public.app_role,
  status public.user_status not null default 'pending',
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_permissions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null check (permission in (
    'users.view', 'users.create', 'users.edit', 'users.approve', 'users.disable',
    'users.impersonate', 'biometrics.manage', 'projects.manage', 'blueprints.manage'
  )),
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id),
  target_id uuid references auth.users (id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helper functions (security definer so RLS policies can call them without recursion).
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = 'super_admin'
  );
$$;

create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select 1 from public.profiles pr
    join public.admin_permissions ap on ap.user_id = pr.id
    where pr.id = auth.uid() and pr.status = 'active' and pr.role = 'admin' and ap.permission = p
  );
$$;

-- New auth user (email signup or Google) -> pending profile. Role is NEVER taken from user metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, phone, company, position)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'company',
    new.raw_user_meta_data ->> 'position'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.audit_log enable row level security;

create policy "own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admins view profiles" on public.profiles
  for select to authenticated using (public.has_permission('users.view'));
create policy "update own basic info" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users may change only harmless columns of their own row; role/status/etc. only via Edge Functions.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, phone, company, position) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

create policy "own permissions" on public.admin_permissions
  for select to authenticated using (user_id = auth.uid());
create policy "super admin views permissions" on public.admin_permissions
  for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.admin_permissions from authenticated, anon;

create policy "super admin reads audit" on public.audit_log
  for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.audit_log from authenticated, anon;

grant execute on function public.is_active(), public.is_super_admin(), public.has_permission(text)
  to authenticated;

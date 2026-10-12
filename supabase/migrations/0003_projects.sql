-- BuildTrack 0003: projects + team assignment with Row Level Security.
-- Admins (permission projects.manage) create/edit projects and assign people.
-- Engineers, Foremen and Clients can read ONLY projects they are assigned to.
-- Requires 0001 and 0002. Run in Supabase SQL Editor (BuildTrack project only).

create type public.project_phase as enum ('plan_review', 'team_briefing', 'mobilization', 'execution');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed', 'cancelled');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 2 and 30),
  name text not null check (char_length(name) between 2 and 120),
  location text,
  client_name text,
  description text,
  phase public.project_phase not null default 'plan_review',
  status public.project_status not null default 'planning',
  start_date date,
  end_date date,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  member_role public.app_role not null,
  assigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- Only active Engineers / Foremen / Clients can be assigned; member_role is copied from their profile.
create or replace function public.check_project_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where id = new.user_id;
  if p.id is null or p.status <> 'active' or p.role not in ('engineer', 'foreman', 'client') then
    raise exception 'Only active Engineers, Foremen and Clients can be assigned to a project';
  end if;
  new.member_role = p.role;
  return new;
end;
$$;

create trigger project_members_check before insert or update on public.project_members
  for each row execute function public.check_project_member();

-- Membership helper (security definer avoids RLS recursion between the two tables).
create or replace function public.is_project_member(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_active() and exists (
    select 1 from public.project_members where project_id = pid and user_id = auth.uid()
  );
$$;
grant execute on function public.is_project_member(uuid) to authenticated;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

create policy "view assigned or managed projects" on public.projects
  for select to authenticated
  using (public.has_permission('projects.manage') or public.is_project_member(id));
create policy "manage projects insert" on public.projects
  for insert to authenticated with check (public.has_permission('projects.manage'));
create policy "manage projects update" on public.projects
  for update to authenticated
  using (public.has_permission('projects.manage')) with check (public.has_permission('projects.manage'));
create policy "manage projects delete" on public.projects
  for delete to authenticated using (public.has_permission('projects.manage'));

create policy "view own or managed memberships" on public.project_members
  for select to authenticated
  using (public.has_permission('projects.manage') or user_id = auth.uid() or public.is_project_member(project_id));
create policy "manage memberships insert" on public.project_members
  for insert to authenticated with check (public.has_permission('projects.manage'));
create policy "manage memberships update" on public.project_members
  for update to authenticated
  using (public.has_permission('projects.manage')) with check (public.has_permission('projects.manage'));
create policy "manage memberships delete" on public.project_members
  for delete to authenticated using (public.has_permission('projects.manage'));

-- Project managers need to see who can be assigned (without the broad users.view permission).
create policy "project managers view assignable profiles" on public.profiles
  for select to authenticated
  using (
    public.has_permission('projects.manage')
    and status = 'active' and role in ('engineer', 'foreman', 'client')
  );

-- Audit every project / assignment change (audit_log is not writable by users directly).
create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, target_id, action, details)
  values (
    auth.uid(),
    case when tg_table_name = 'project_members' then coalesce(new.user_id, old.user_id) else null end,
    tg_table_name || '.' || lower(tg_op),
    jsonb_build_object('row', to_jsonb(coalesce(new, old)))
  );
  return coalesce(new, old);
end;
$$;

create trigger projects_audit after insert or update or delete on public.projects
  for each row execute function public.log_project_change();
create trigger project_members_audit after insert or update or delete on public.project_members
  for each row execute function public.log_project_change();

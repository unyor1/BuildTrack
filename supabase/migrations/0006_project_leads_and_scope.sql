-- BuildTrack 0006: who takes care of a project, and what work it covers.
--   manager_name       free text: the person in charge (e.g. the proprietor or a site manager with no login)
--   lead_engineer_id   Engineer in charge (a real user; automatically added to the project team)
--   lead_foreman_id    Foreman in charge (a real user; automatically added to the project team)
--   disciplines        scope of work, matching Valencia's service lines
-- Plus: get_project_team() so assigned users can see WHO is on their project (names + roles only),
-- and indexes for the queries the app actually runs.
-- Requires 0001-0005. Run in Supabase SQL Editor (BuildTrack project only).

alter table public.projects
  add column manager_name text check (manager_name is null or char_length(manager_name) <= 120),
  add column lead_engineer_id uuid references public.profiles (id) on delete set null,
  add column lead_foreman_id uuid references public.profiles (id) on delete set null,
  add column disciplines text[] not null default '{}'
    check (disciplines <@ array['civil_structural', 'architectural', 'mep']::text[]);

create index projects_status_idx on public.projects (status);
create index projects_created_idx on public.projects (created_at desc);
create index projects_lead_engineer_idx on public.projects (lead_engineer_id);
create index projects_lead_foreman_idx on public.projects (lead_foreman_id);

-- Leads must be active people with the right role; they are added to the team automatically.
create or replace function public.sync_project_leads()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
begin
  if new.lead_engineer_id is not null then
    select * into p from public.profiles where id = new.lead_engineer_id;
    if p.id is null or p.status <> 'active' or p.role is distinct from 'engineer' then
      raise exception 'The engineer in charge must be an active Engineer';
    end if;
    insert into public.project_members (project_id, user_id)
    values (new.id, new.lead_engineer_id) on conflict do nothing;
  end if;
  if new.lead_foreman_id is not null then
    select * into p from public.profiles where id = new.lead_foreman_id;
    if p.id is null or p.status <> 'active' or p.role is distinct from 'foreman' then
      raise exception 'The foreman in charge must be an active Foreman';
    end if;
    insert into public.project_members (project_id, user_id)
    values (new.id, new.lead_foreman_id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger projects_sync_leads
  after insert or update of lead_engineer_id, lead_foreman_id on public.projects
  for each row execute function public.sync_project_leads();

-- Removing someone from the team also removes them as lead.
create or replace function public.clear_lead_on_member_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set lead_engineer_id = null
    where id = old.project_id and lead_engineer_id = old.user_id;
  update public.projects set lead_foreman_id = null
    where id = old.project_id and lead_foreman_id = old.user_id;
  return old;
end;
$$;

create trigger project_members_clear_lead
  after delete on public.project_members
  for each row execute function public.clear_lead_on_member_removal();

-- A lead who is disabled, rejected or switched to another role stops being lead.
create or replace function public.clear_lead_on_profile_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'active' or new.role is distinct from old.role then
    update public.projects set lead_engineer_id = null
      where lead_engineer_id = new.id and (new.status <> 'active' or new.role is distinct from 'engineer');
    update public.projects set lead_foreman_id = null
      where lead_foreman_id = new.id and (new.status <> 'active' or new.role is distinct from 'foreman');
  end if;
  return new;
end;
$$;

create trigger profiles_clear_lead
  after update of role, status on public.profiles
  for each row execute function public.clear_lead_on_profile_change();

-- Names and roles of everyone on a project. Callable only for projects the caller may see.
-- (Assigned users cannot read other people's profiles directly, and must not see emails or phones.)
create or replace function public.get_project_team(pid uuid)
returns table (user_id uuid, full_name text, role public.app_role, is_lead boolean)
language sql stable security definer set search_path = '' as $$
  select pm.user_id,
         coalesce(pr.full_name, pr.email),
         pm.member_role,
         (pm.user_id = p.lead_engineer_id or pm.user_id = p.lead_foreman_id)
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  join public.profiles pr on pr.id = pm.user_id
  where pm.project_id = pid
    and (public.has_permission('projects.manage') or public.is_project_member(pid))
  order by pm.member_role, 2;
$$;

revoke execute on function public.get_project_team(uuid) from public, anon;
grant execute on function public.get_project_team(uuid) to authenticated;

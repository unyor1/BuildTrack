-- BuildTrack 0005: BUG FIX - creating a project failed with
--   record "new" has no field "user_id"
-- Cause: 0003 used ONE audit trigger function (log_project_change) for both `projects` and `project_members`
-- and it read NEW.user_id, a column that only exists on project_members. Postgres evaluates that field
-- reference even inside a CASE branch that is never taken, so every insert/update/delete on `projects` failed.
-- Fix: read the row as jsonb, which has no per-table column assumptions.
--
-- Also hardens related foreign keys (found while reviewing): audit_log and the "who did it" columns
-- pointed at auth.users WITHOUT a delete rule, so deleting any user who ever approved someone, created a
-- project or appeared in the audit log would have been refused. Those now become NULL instead (history stays).
-- And created_by / assigned_by are now filled automatically.
-- Requires 0001-0004. Run in Supabase SQL Editor (BuildTrack project only).

create or replace function public.log_project_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_id, target_id, action, details)
  values (
    auth.uid(),
    case when tg_table_name = 'project_members' then (v_row ->> 'user_id')::uuid else null end,
    tg_table_name || '.' || lower(tg_op),
    jsonb_build_object('row', v_row)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- created_by / assigned_by are set by the database, never trusted from the client.
create or replace function public.set_actor_columns()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'projects' then
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.assigned_by := coalesce(new.assigned_by, auth.uid());
  end if;
  return new;
end;
$$;

create trigger projects_actor before insert on public.projects
  for each row execute function public.set_actor_columns();
create trigger project_members_actor before insert on public.project_members
  for each row execute function public.set_actor_columns();

-- Foreign keys to auth.users: keep history when a user is deleted.
alter table public.audit_log drop constraint audit_log_actor_id_fkey,
  add constraint audit_log_actor_id_fkey foreign key (actor_id) references auth.users (id) on delete set null;
alter table public.audit_log drop constraint audit_log_target_id_fkey,
  add constraint audit_log_target_id_fkey foreign key (target_id) references auth.users (id) on delete set null;
alter table public.profiles drop constraint profiles_approved_by_fkey,
  add constraint profiles_approved_by_fkey foreign key (approved_by) references auth.users (id) on delete set null;
alter table public.admin_permissions drop constraint admin_permissions_granted_by_fkey,
  add constraint admin_permissions_granted_by_fkey foreign key (granted_by) references auth.users (id) on delete set null;
alter table public.projects drop constraint projects_created_by_fkey,
  add constraint projects_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.project_members drop constraint project_members_assigned_by_fkey,
  add constraint project_members_assigned_by_fkey foreign key (assigned_by) references auth.users (id) on delete set null;

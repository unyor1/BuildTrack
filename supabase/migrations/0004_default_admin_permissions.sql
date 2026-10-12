-- BuildTrack 0004: new Admins get a safe default permission set.
-- Without this, an Admin created by a Super Admin could not open Project Management until the
-- Super Admin ticked permissions by hand. Defaults are read/manage-projects only, never user
-- create/edit/disable/impersonate (those stay opt-in by the Super Admin).
-- Requires 0001-0003. Run in Supabase SQL Editor (BuildTrack project only).

create or replace function public.grant_default_admin_permissions()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'admin' and (tg_op = 'INSERT' or old.role is distinct from new.role) then
    insert into public.admin_permissions (user_id, permission, granted_by)
    select new.id, p, new.approved_by
    from unnest(array['users.view', 'projects.manage', 'blueprints.manage']) as p
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger profiles_default_admin_permissions
  after insert or update of role on public.profiles
  for each row execute function public.grant_default_admin_permissions();

-- Backfill: existing Admins that have no permissions at all get the same defaults.
insert into public.admin_permissions (user_id, permission)
select pr.id, p
from public.profiles pr
cross join unnest(array['users.view', 'projects.manage', 'blueprints.manage']) as p
where pr.role = 'admin'
  and not exists (select 1 from public.admin_permissions ap where ap.user_id = pr.id)
on conflict do nothing;

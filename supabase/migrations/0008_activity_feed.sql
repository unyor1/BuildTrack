-- BuildTrack 0008: read-only activity feed for administrators (Admin Dashboard + Project Overview).
-- audit_log itself stays readable only by the Super Admin (it holds raw row snapshots). This function returns
-- a safe summary (who, role, what, about whom/what, when) to admins who may see users or manage projects,
-- optionally limited to one project. Needs MFA (aal2) like every admin power (has_permission checks it).
-- Requires 0001-0007. Applied through the BUILDTRACK_MIGRATIONS connector.

create or replace function public.get_activity(pid uuid default null, lim integer default 20)
returns table (id bigint, created_at timestamptz, actor_name text, actor_role public.app_role, action text, subject text)
language sql stable security definer set search_path = '' as $$
  select a.id,
         a.created_at,
         coalesce(ap.full_name, ap.email, 'System'),
         ap.role,
         a.action,
         coalesce(
           case when a.action like 'projects.%'
                then nullif(concat_ws(' ', a.details -> 'row' ->> 'code', a.details -> 'row' ->> 'name'), '') end,
           case when a.action like 'project_members.%'
                then concat_ws(' on ',
                  (select coalesce(tp.full_name, tp.email) from public.profiles tp where tp.id = a.target_id),
                  (select p.code from public.projects p where p.id = (a.details -> 'row' ->> 'project_id')::uuid)) end,
           a.details ->> 'email',
           (select coalesce(tp.full_name, tp.email) from public.profiles tp where tp.id = a.target_id)
         )
  from public.audit_log a
  left join public.profiles ap on ap.id = a.actor_id
  where (public.has_permission('users.view') or public.has_permission('projects.manage'))
    and (pid is null
         or a.details -> 'row' ->> 'project_id' = pid::text
         or (a.action like 'projects.%' and a.details -> 'row' ->> 'id' = pid::text))
  order by a.id desc
  limit least(greatest(coalesce(lim, 20), 1), 50);
$$;

revoke execute on function public.get_activity(uuid, integer) from public, anon;
grant execute on function public.get_activity(uuid, integer) to authenticated;

-- 0023: Audit trail for project backups. The backup file is built in the admin's browser (project data and files they are allowed to read);
-- this function records that it happened (who, which project, with or without files, how many rows).
create function public.log_project_export(p_project uuid, p_with_files boolean, p_rows integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('projects.manage') then
    raise exception 'Missing permission: projects.manage';
  end if;
  if not exists (select 1 from public.projects where id = p_project) then
    raise exception 'Project not found';
  end if;
  insert into public.audit_log (actor_id, action, details)
  values (auth.uid(), 'project.export', jsonb_build_object('project_id', p_project, 'with_files', coalesce(p_with_files, false), 'rows', greatest(coalesce(p_rows, 0), 0)));
end;
$$;

revoke execute on function public.log_project_export(uuid, boolean, integer) from public, anon;
grant execute on function public.log_project_export(uuid, boolean, integer) to authenticated;

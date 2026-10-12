-- BuildTrack 0011: pin timeline with the names of who did what.
-- pin_events only stores actor ids, and project members cannot read each other's profiles (privacy),
-- so the pin panel needs this function. Same visibility as the timeline itself (0010): Engineers, Foremen and
-- admins who may see the project; Clients and outsiders get nothing. Only names and roles are returned (no emails).
-- Requires 0001-0010. Applied through the BUILDTRACK_MIGRATIONS connector.

create function public.get_pin_timeline(p_pin uuid)
returns table (
  id bigint, created_at timestamptz, kind text,
  from_status public.pin_status, to_status public.pin_status,
  note text, actor_name text, actor_role public.app_role
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.created_at, e.kind, e.from_status, e.to_status, e.note,
         coalesce(p.full_name, p.email, 'System'), p.role
  from public.pin_events e
  left join public.profiles p on p.id = e.actor_id
  where e.pin_id = p_pin
    and public.can_view_project(e.project_id)
    and not public.is_project_client(e.project_id)
  order by e.id;
$$;

revoke execute on function public.get_pin_timeline(uuid) from public, anon;
grant execute on function public.get_pin_timeline(uuid) to authenticated;

-- 0035: the sheet history names the new timeline entry from 0033 ('photo_removed') instead of filing it under "Checklist".
-- Same function as 0017, with one more case and the checklist case written out.

create or replace function public.get_sheet_history(p_blueprint uuid, p_limit integer default 100)
returns table (id text, created_at timestamptz, actor_name text, actor_role public.app_role, action text, item_type text, item_id uuid, summary text)
language sql stable security definer set search_path = '' as $$
  with bp as (
    select b.id, b.project_id from public.blueprints b
    where b.id = p_blueprint and public.can_view_project(b.project_id) and not public.is_project_client(b.project_id)
  )
  select t.id, t.created_at, t.actor_name, t.actor_role, t.action, t.item_type, t.item_id, t.summary
  from (
    select 'h' || h.id::text as id, h.created_at, coalesce(p.full_name, p.email, 'System') as actor_name, p.role as actor_role,
           h.action, h.item_type, h.item_id, h.summary, h.id as sort_id
    from public.sheet_history h
    join bp on bp.id = h.blueprint_id
    left join public.profiles p on p.id = h.actor_id
    union all
    select 'e' || e.id::text, e.created_at, coalesce(p.full_name, p.email, 'System'), p.role, e.kind, 'pin', e.pin_id,
           case e.kind
             when 'created' then 'Added pin "' || pn.title || '"'
             when 'moved' then 'Moved pin "' || pn.title || '"'
             when 'edited' then 'Edited pin "' || pn.title || '"'
             when 'status' then 'Pin "' || pn.title || '" is now ' || replace(e.to_status::text, '_', ' ')
             when 'comment' then 'Commented on pin "' || pn.title || '"'
             when 'photo' then 'Added a photo to pin "' || pn.title || '"'
             when 'photo_removed' then 'Removed a photo from pin "' || pn.title || '"'
             when 'checklist' then 'Checklist of pin "' || pn.title || '": ' || coalesce(e.note, 'updated')
             else 'Updated pin "' || pn.title || '"'
           end,
           e.id
    from public.pin_events e
    join public.pins pn on pn.id = e.pin_id
    join bp on bp.id = pn.blueprint_id
    left join public.profiles p on p.id = e.actor_id
  ) t
  order by t.created_at desc, t.sort_id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 300);
$$;

revoke execute on function public.get_sheet_history(uuid, integer) from public, anon;
grant execute on function public.get_sheet_history(uuid, integer) to authenticated;

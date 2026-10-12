-- BuildTrack 0017: advanced workspace editor (drawing tools, layering, locks, edit history).
--   * blueprint_annotations gets new kinds: text (text box), draw (freehand pen), highlight (highlighter), polyline
--     (open path measured in length) and area (closed outline measured in area), plus points / stroke / opacity /
--     z_index / locked / font_size columns.
--   * Layer order is decided by the database (new items go on top; move_annotation_layer() renumbers atomically).
--   * Locks are enforced by triggers, not only by the screen: a locked annotation cannot be moved, edited or deleted;
--     a locked pin cannot be moved, renamed or deleted (its status can still be reported); the base layer of a sheet
--     (blueprints.base_locked) blocks new revisions and scale changes.
--   * sheet_history + get_sheet_history(): who did what on a sheet (annotations, locks, deleted pins, plus the existing
--     pin timeline), readable by Engineers, Foremen and admins, never Clients.
-- Direct deletes only are guarded / logged (pg_trigger_depth() = 1) so deleting a whole sheet or project still cascades.
-- Requires 0001-0016. Applied through the BUILDTRACK_MIGRATIONS connector.

-- ---- Columns ----
alter table public.blueprints add column base_locked boolean not null default false;
alter table public.pins add column locked boolean not null default false;

alter table public.blueprint_annotations
  add column points jsonb,
  add column stroke numeric(5, 3) check (stroke is null or stroke between 0.02 and 5),
  add column opacity numeric(3, 2) not null default 1 check (opacity between 0.05 and 1),
  add column z_index integer not null default 0,
  add column locked boolean not null default false,
  add column font_size numeric(5, 2) check (font_size is null or font_size between 0.3 and 12);

-- Points are [[x, y], ...] in percent of the sheet (0-100).
create function public.valid_points(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'array' and coalesce((
    select bool_and(
      case
        when jsonb_typeof(e) <> 'array' then false
        when jsonb_array_length(e) <> 2 then false
        when jsonb_typeof(e -> 0) <> 'number' or jsonb_typeof(e -> 1) <> 'number' then false
        else (e ->> 0)::numeric between 0 and 100 and (e ->> 1)::numeric between 0 and 100
      end)
    from jsonb_array_elements(p) e), true);
$$;

-- The old kind rules only knew note and shape: replace all four (they all mention "kind").
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.blueprint_annotations'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.blueprint_annotations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.blueprint_annotations drop constraint blueprint_annotations_color_check;
alter table public.blueprint_annotations add constraint blueprint_annotations_color_check
  check (color in ('magenta', 'orange', 'blue', 'green', 'red', 'gray', 'yellow', 'black'));
alter table public.blueprint_annotations add constraint blueprint_annotations_kind_check
  check (kind in ('note', 'shape', 'text', 'draw', 'highlight', 'polyline', 'area'));
alter table public.blueprint_annotations add constraint annotation_points_valid
  check (points is null or public.valid_points(points));
alter table public.blueprint_annotations add constraint annotation_kind_rules check (
  case kind
    when 'note' then shape is null and w is null and h is null and points is null and char_length(btrim(coalesce(text, ''))) > 0
    when 'shape' then shape is not null and w is not null and h is not null and points is null and x + w <= 100.0001 and y + h <= 100.0001
    when 'text' then shape is null and h is null and points is null and char_length(btrim(coalesce(text, ''))) > 0 and (w is null or x + w <= 100.0001)
    when 'draw' then shape is null and w is null and h is null and text is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 2 and 600
    when 'highlight' then shape is null and w is null and h is null and text is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 2 and 600
    when 'polyline' then shape is null and w is null and h is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 2 and 300
    when 'area' then shape is null and w is null and h is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 3 and 300
    else false
  end);
create index blueprint_annotations_layer_idx on public.blueprint_annotations (blueprint_id, z_index);

-- ---- Database-decided fields ----
create or replace function public.prepare_annotation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bp public.blueprints;
  nx numeric;
  ny numeric;
begin
  if tg_op = 'INSERT' then
    select * into bp from public.blueprints where id = new.blueprint_id;
    if bp.id is null then
      raise exception 'Blueprint not found';
    end if;
    new.project_id := bp.project_id;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.z_index := coalesce((select max(z_index) from public.blueprint_annotations where blueprint_id = new.blueprint_id), -1) + 1;
    new.locked := coalesce(new.locked, false);
    if new.kind in ('draw', 'highlight', 'polyline', 'area') and new.stroke is null then
      new.stroke := case new.kind when 'highlight' then 1.4 when 'draw' then 0.2 else 0.15 end;
    end if;
    if new.kind = 'text' and new.font_size is null then
      new.font_size := 1.6;
    end if;
  else
    if new.blueprint_id <> old.blueprint_id or new.project_id <> old.project_id or new.kind <> old.kind then
      raise exception 'An annotation cannot change plan or type';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  -- Drawings are positioned by their points; x / y always mirror the top-left corner of the drawing.
  if new.kind in ('draw', 'highlight', 'polyline', 'area') and new.points is not null and public.valid_points(new.points) then
    select min((e ->> 0)::numeric), min((e ->> 1)::numeric) into nx, ny from jsonb_array_elements(new.points) e;
    new.x := nx;
    new.y := ny;
  end if;
  return new;
end;
$$;

-- ---- Locks ----
create function public.guard_annotation_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() = 1 then
      raise exception 'This item is locked. Unlock it first.';
    end if;
    return old;
  end if;
  if old.locked and new.locked and (
       (new.x, new.y, new.w, new.h, new.points, new.text, new.color, new.opacity, new.stroke, new.font_size, new.shape)
       is distinct from
       (old.x, old.y, old.w, old.h, old.points, old.text, old.color, old.opacity, old.stroke, old.font_size, old.shape)) then
    raise exception 'This item is locked. Unlock it first.';
  end if;
  return new;
end;
$$;
create trigger blueprint_annotations_lock before update or delete on public.blueprint_annotations
  for each row execute function public.guard_annotation_lock();

create function public.guard_pin_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() = 1 then
      raise exception 'This pin is locked. Unlock it first.';
    end if;
    return old;
  end if;
  if old.locked and new.locked and (new.x, new.y, new.title, new.description, new.category)
       is distinct from (old.x, old.y, old.title, old.description, old.category) then
    raise exception 'This pin is locked. Unlock it first.';
  end if;
  return new;
end;
$$;
create trigger pins_lock before update or delete on public.pins
  for each row execute function public.guard_pin_lock();

create function public.guard_blueprint_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.base_locked and new.base_locked and new.scale_width_m is distinct from old.scale_width_m then
    raise exception 'The base layer of this sheet is locked. Unlock it to change the scale.';
  end if;
  return new;
end;
$$;
create trigger blueprints_lock before update on public.blueprints
  for each row execute function public.guard_blueprint_lock();

create function public.guard_revision_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.blueprints where id = new.blueprint_id and base_locked) then
    raise exception 'The base layer of this sheet is locked. Unlock it before uploading a new revision.';
  end if;
  return new;
end;
$$;
create trigger blueprint_revisions_lock before insert on public.blueprint_revisions
  for each row execute function public.guard_revision_lock();

-- ---- Edit history ----
create table public.sheet_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  blueprint_id uuid not null references public.blueprints (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) <= 30),
  item_type text not null check (item_type in ('pin', 'annotation', 'sheet')),
  item_kind text check (item_kind is null or char_length(item_kind) <= 20),
  item_id uuid,
  summary text not null check (char_length(summary) <= 200),
  created_at timestamptz not null default now()
);
create index sheet_history_sheet_idx on public.sheet_history (blueprint_id, id desc);
alter table public.sheet_history enable row level security;
revoke all on public.sheet_history from anon, authenticated; -- read only through get_sheet_history()

create function public.log_sheet_event(p_blueprint uuid, p_action text, p_type text, p_kind text, p_item uuid, p_summary text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sheet_history (project_id, blueprint_id, actor_id, action, item_type, item_kind, item_id, summary)
  select b.project_id, b.id, auth.uid(), p_action, p_type, p_kind, p_item, left(p_summary, 200)
  from public.blueprints b where b.id = p_blueprint;
end;
$$;

create function public.record_annotation_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.blueprint_annotations;
  act text;
  label text;
  snippet text;
  summary text;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old; -- removed together with its sheet
    end if;
    r := old;
    act := 'deleted';
  elsif tg_op = 'INSERT' then
    r := new;
    act := 'added';
  else
    r := new;
    if new.locked is distinct from old.locked then
      act := case when new.locked then 'locked' else 'unlocked' end;
    elsif new.w is distinct from old.w or new.h is distinct from old.h then
      act := 'resized';
    elsif (new.x, new.y) is distinct from (old.x, old.y) or new.points is distinct from old.points then
      act := 'moved';
    elsif new.text is distinct from old.text then
      act := 'edited';
    elsif (new.color, new.opacity, new.stroke, new.font_size) is distinct from (old.color, old.opacity, old.stroke, old.font_size) then
      act := 'restyled';
    else
      return new; -- layer order only: logged once by move_annotation_layer()
    end if;
  end if;
  label := case r.kind
    when 'note' then 'note'
    when 'shape' then case r.shape when 'ellipse' then 'ellipse' else 'rectangle' end
    when 'text' then 'text box'
    when 'draw' then 'freehand drawing'
    when 'highlight' then 'highlight'
    when 'polyline' then 'polyline'
    else 'area outline'
  end;
  snippet := case when r.kind in ('note', 'text') and r.text is not null
                  then ': "' || left(regexp_replace(r.text, '\s+', ' ', 'g'), 40) || '"' else '' end;
  summary := case act
    when 'added' then 'Added a ' || label
    when 'deleted' then 'Deleted a ' || label
    when 'moved' then 'Moved a ' || label
    when 'resized' then 'Resized a ' || label
    when 'edited' then 'Edited the text of a ' || label
    when 'restyled' then 'Changed the style of a ' || label
    when 'locked' then 'Locked a ' || label
    else 'Unlocked a ' || label
  end || snippet;
  perform public.log_sheet_event(r.blueprint_id, act, 'annotation', r.kind, r.id, summary);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger blueprint_annotations_history after insert or update or delete on public.blueprint_annotations
  for each row execute function public.record_annotation_history();

create function public.record_pin_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    perform public.log_sheet_event(old.blueprint_id, 'deleted', 'pin', null, old.id, 'Deleted pin "' || left(old.title, 80) || '"');
    return old;
  end if;
  if new.locked is distinct from old.locked then
    perform public.log_sheet_event(new.blueprint_id, case when new.locked then 'locked' else 'unlocked' end, 'pin', null, new.id,
      case when new.locked then 'Locked' else 'Unlocked' end || ' pin "' || left(new.title, 80) || '"');
  end if;
  return new;
end;
$$;
create trigger pins_history after update or delete on public.pins
  for each row execute function public.record_pin_history();

create function public.record_blueprint_lock_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_sheet_event(new.id, case when new.base_locked then 'locked' else 'unlocked' end, 'sheet', null, new.id,
    case when new.base_locked then 'Locked' else 'Unlocked' end || ' the base layer');
  return new;
end;
$$;
create trigger blueprints_history after update of base_locked on public.blueprints
  for each row when (old.base_locked is distinct from new.base_locked)
  execute function public.record_blueprint_lock_history();

-- ---- Layering ----
-- Bring to front / forward / backward / send to back. Renumbers the whole sheet 0..n-1 in one transaction so the order
-- can never end up with gaps, duplicates or two people overwriting each other. SECURITY DEFINER because it writes the
-- history; the caller is checked explicitly with can_edit_blueprints().
create function public.move_annotation_layer(p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.blueprint_annotations;
  ids uuid[];
  n integer;
  pos integer;
  newpos integer;
begin
  if p_action not in ('front', 'back', 'forward', 'backward') then
    raise exception 'Unknown layer action';
  end if;
  select * into a from public.blueprint_annotations where id = p_id;
  if a.id is null then
    raise exception 'Item not found';
  end if;
  if not public.can_edit_blueprints(a.project_id) then
    raise exception 'You are not allowed to change the layers of this sheet';
  end if;
  select array_agg(s.id order by s.z_index, s.created_at, s.id) into ids
  from (select id, z_index, created_at from public.blueprint_annotations where blueprint_id = a.blueprint_id for update) s;
  n := array_length(ids, 1);
  pos := array_position(ids, p_id);
  newpos := case p_action when 'front' then n when 'back' then 1 when 'forward' then least(pos + 1, n) else greatest(pos - 1, 1) end;
  ids := array_remove(ids, p_id);
  ids := ids[1:newpos - 1] || array[p_id] || ids[newpos:];
  update public.blueprint_annotations t set z_index = (o.ord - 1)::integer
  from unnest(ids) with ordinality as o(id, ord)
  where t.id = o.id and t.z_index is distinct from (o.ord - 1)::integer;
  if newpos <> pos then
    perform public.log_sheet_event(a.blueprint_id, 'reordered', 'annotation', a.kind, a.id,
      case p_action when 'front' then 'Brought an item to the front' when 'back' then 'Sent an item to the back'
                    when 'forward' then 'Moved an item forward' else 'Moved an item backward' end);
  end if;
end;
$$;

-- Lock or unlock every annotation and pin of a sheet at once ("lock all components").
create function public.set_sheet_items_locked(p_blueprint uuid, p_locked boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  bp public.blueprints;
begin
  select * into bp from public.blueprints where id = p_blueprint;
  if bp.id is null then
    raise exception 'Sheet not found';
  end if;
  if not public.can_edit_blueprints(bp.project_id) then
    raise exception 'You are not allowed to lock items on this sheet';
  end if;
  update public.blueprint_annotations set locked = p_locked where blueprint_id = p_blueprint and locked is distinct from p_locked;
  update public.pins set locked = p_locked where blueprint_id = p_blueprint and locked is distinct from p_locked;
  perform public.log_sheet_event(p_blueprint, case when p_locked then 'locked' else 'unlocked' end, 'sheet', null, p_blueprint,
    case when p_locked then 'Locked every item on the sheet' else 'Unlocked every item on the sheet' end);
end;
$$;

-- Edit history of one sheet, newest first (annotations, locks, deleted pins, and the existing pin timeline).
create function public.get_sheet_history(p_blueprint uuid, p_limit integer default 100)
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
             else 'Checklist of pin "' || pn.title || '": ' || coalesce(e.note, 'updated')
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

revoke execute on function
  public.guard_annotation_lock(), public.guard_pin_lock(), public.guard_blueprint_lock(),
  public.guard_revision_lock(), public.log_sheet_event(uuid, text, text, text, uuid, text), public.record_annotation_history(),
  public.record_pin_history(), public.record_blueprint_lock_history()
  from public, anon, authenticated;
-- valid_points() is a harmless pure function used by a CHECK constraint, so API roles keep execute on it.
revoke execute on function public.valid_points(jsonb) from public, anon;
grant execute on function public.valid_points(jsonb) to authenticated;
revoke execute on function public.move_annotation_layer(uuid, text), public.set_sheet_items_locked(uuid, boolean),
  public.get_sheet_history(uuid, integer) from public, anon;
grant execute on function public.move_annotation_layer(uuid, text), public.set_sheet_items_locked(uuid, boolean),
  public.get_sheet_history(uuid, integer) to authenticated;

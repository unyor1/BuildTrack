-- BuildTrack 0018: more sheet objects, groups and atomic multi-item moves for the workspace editor.
--   * New annotation kinds: arrow (leader line, 2 points + optional label), dimension (2 points, length shown on screen),
--     cloud (revision cloud around an area, 3-60 corner points), symbol (fixed library of construction symbols).
--   * annotation.group_id: items that share a group id are selected and moved together by the editor.
--   * move_annotations(jsonb): moves / reshapes many items in ONE transaction (multi-select drag, align, distribute, undo).
--     Runs as the caller, so row level security and the lock triggers apply to every item; one locked item refuses the
--     whole batch.
-- Requires 0001-0017. Applied through the BUILDTRACK_MIGRATIONS connector.

alter table public.blueprint_annotations
  add column group_id uuid,
  add column symbol text;
create index blueprint_annotations_group_idx on public.blueprint_annotations (group_id) where group_id is not null;

alter table public.blueprint_annotations drop constraint annotation_kind_rules;
alter table public.blueprint_annotations drop constraint blueprint_annotations_kind_check;

alter table public.blueprint_annotations add constraint blueprint_annotations_kind_check
  check (kind in ('note', 'shape', 'text', 'draw', 'highlight', 'polyline', 'area', 'arrow', 'dimension', 'cloud', 'symbol'));
alter table public.blueprint_annotations add constraint annotation_symbol_valid
  check ((kind = 'symbol') = (symbol is not null)
         and (symbol is null or symbol in ('north_arrow', 'hazard', 'inspect', 'check', 'cross', 'equipment', 'crane', 'exit', 'fire_ext', 'first_aid', 'ppe', 'no_entry')));
alter table public.blueprint_annotations add constraint annotation_kind_rules check (
  case kind
    when 'note' then shape is null and w is null and h is null and points is null and char_length(btrim(coalesce(text, ''))) > 0
    when 'shape' then shape is not null and w is not null and h is not null and points is null and x + w <= 100.0001 and y + h <= 100.0001
    when 'text' then shape is null and h is null and points is null and char_length(btrim(coalesce(text, ''))) > 0 and (w is null or x + w <= 100.0001)
    when 'draw' then shape is null and w is null and h is null and text is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 2 and 600
    when 'highlight' then shape is null and w is null and h is null and text is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 2 and 600
    when 'polyline' then shape is null and w is null and h is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 2 and 300
    when 'area' then shape is null and w is null and h is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 3 and 300
    when 'arrow' then shape is null and w is null and h is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) = 2
    when 'dimension' then shape is null and w is null and h is null and text is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) = 2
    when 'cloud' then shape is null and w is null and h is null and coalesce(case when jsonb_typeof(points) = 'array' then jsonb_array_length(points) end, 0) between 3 and 60
    when 'symbol' then shape is null and h is null and points is null and w is not null and w between 0.5 and 30 and x + w <= 100.0001
    else false
  end);

-- Drawings follow their points; defaults for the new line kinds.
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
    if new.kind in ('draw', 'highlight', 'polyline', 'area', 'arrow', 'dimension', 'cloud') and new.stroke is null then
      new.stroke := case new.kind when 'highlight' then 1.4 when 'draw' then 0.2 when 'arrow' then 0.25 when 'cloud' then 0.2 else 0.15 end;
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
  if new.kind in ('draw', 'highlight', 'polyline', 'area', 'arrow', 'dimension', 'cloud') and new.points is not null and public.valid_points(new.points) then
    select min((e ->> 0)::numeric), min((e ->> 1)::numeric) into nx, ny from jsonb_array_elements(new.points) e;
    new.x := nx;
    new.y := ny;
  end if;
  return new;
end;
$$;

-- A locked item also keeps its symbol; grouping is not content, so group_id may change while locked.
create or replace function public.guard_annotation_lock()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() = 1 then
      raise exception 'This item is locked. Unlock it first.';
    end if;
    return old;
  end if;
  if old.locked and new.locked and (
       (new.x, new.y, new.w, new.h, new.points, new.text, new.color, new.opacity, new.stroke, new.font_size, new.shape, new.symbol)
       is distinct from
       (old.x, old.y, old.w, old.h, old.points, old.text, old.color, old.opacity, old.stroke, old.font_size, old.shape, old.symbol)) then
    raise exception 'This item is locked. Unlock it first.';
  end if;
  return new;
end;
$$;

create or replace function public.record_annotation_history()
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
    elsif (new.color, new.opacity, new.stroke, new.font_size, new.symbol) is distinct from (old.color, old.opacity, old.stroke, old.font_size, old.symbol) then
      act := 'restyled';
    else
      return new; -- layer order or grouping only
    end if;
  end if;
  label := case r.kind
    when 'note' then 'note'
    when 'shape' then case r.shape when 'ellipse' then 'ellipse' else 'rectangle' end
    when 'text' then 'text box'
    when 'draw' then 'freehand drawing'
    when 'highlight' then 'highlight'
    when 'polyline' then 'polyline'
    when 'arrow' then 'arrow'
    when 'dimension' then 'dimension line'
    when 'cloud' then 'revision cloud'
    when 'symbol' then 'symbol'
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

-- Moves many items in one transaction: [{ "id": uuid, "x": number, "y": number, "points": [[x, y], ...] }, ...]
-- x / y / points are optional per item (drawings follow their points). Runs as the caller (RLS + lock triggers apply).
create function public.move_annotations(p_moves jsonb)
returns integer language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  if jsonb_typeof(p_moves) <> 'array' or jsonb_array_length(p_moves) = 0 or jsonb_array_length(p_moves) > 300 then
    raise exception 'Send between 1 and 300 items';
  end if;
  update public.blueprint_annotations a
  set x = coalesce(m.x, a.x), y = coalesce(m.y, a.y), points = coalesce(m.points, a.points)
  from jsonb_to_recordset(p_moves) as m(id uuid, x numeric, y numeric, points jsonb)
  where a.id = m.id;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(p_moves) then
    raise exception 'Some items were not found or you are not allowed to move them';
  end if;
  return n;
end;
$$;

revoke execute on function public.move_annotations(jsonb) from public, anon;
grant execute on function public.move_annotations(jsonb) to authenticated;
revoke execute on function public.prepare_annotation(), public.guard_annotation_lock(), public.record_annotation_history()
  from public, anon, authenticated;

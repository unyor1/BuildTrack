-- BuildTrack 0019: floating images, rotation and drag-to-reorder layers for the workspace editor.
--   * New annotation kind `image`: a photo / vendor spec / logo placed on the sheet. The file lives in the private
--     `blueprints` bucket inside the project folder (same storage rules as sheets); the row stores its path, position,
--     size (w x h, percent of the sheet) and rotation.
--   * `rotation` (degrees, -360..360) is available to every positioned kind; the editor rotates images, shapes, text
--     boxes and symbols.
--   * reorder_annotations(): sets the whole layer order of a sheet in one transaction (drag and drop in the Layers panel).
-- Requires 0001-0018. Applied through the BUILDTRACK_MIGRATIONS connector.

alter table public.blueprint_annotations
  add column image_path text check (image_path is null or char_length(image_path) between 10 and 300),
  add column rotation numeric(6, 2) not null default 0 check (rotation between -360 and 360);

alter table public.blueprint_annotations drop constraint annotation_kind_rules;
alter table public.blueprint_annotations drop constraint blueprint_annotations_kind_check;

alter table public.blueprint_annotations add constraint blueprint_annotations_kind_check
  check (kind in ('note', 'shape', 'text', 'draw', 'highlight', 'polyline', 'area', 'arrow', 'dimension', 'cloud', 'symbol', 'image'));
alter table public.blueprint_annotations add constraint annotation_image_valid
  check ((kind = 'image') = (image_path is not null));
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
    when 'image' then shape is null and points is null and w is not null and h is not null and w between 0.5 and 100 and h between 0.5 and 100 and x + w <= 100.0001 and y + h <= 100.0001
    else false
  end);

-- The image file must live inside the project's folder and cannot be swapped afterwards; the caption is optional.
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
    if new.image_path is not null and split_part(new.image_path, '/', 1) <> bp.project_id::text then
      raise exception 'Images must be stored inside the project folder';
    end if;
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
    if new.image_path is distinct from old.image_path then
      raise exception 'The image file cannot be replaced; add a new image instead';
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
       (new.x, new.y, new.w, new.h, new.points, new.text, new.color, new.opacity, new.stroke, new.font_size, new.shape, new.symbol, new.rotation)
       is distinct from
       (old.x, old.y, old.w, old.h, old.points, old.text, old.color, old.opacity, old.stroke, old.font_size, old.shape, old.symbol, old.rotation)) then
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
      return old;
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
    elsif new.rotation is distinct from old.rotation then
      act := 'rotated';
    elsif (new.x, new.y) is distinct from (old.x, old.y) or new.points is distinct from old.points then
      act := 'moved';
    elsif new.text is distinct from old.text then
      act := 'edited';
    elsif (new.color, new.opacity, new.stroke, new.font_size, new.symbol) is distinct from (old.color, old.opacity, old.stroke, old.font_size, old.symbol) then
      act := 'restyled';
    else
      return new;
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
    when 'image' then 'image'
    else 'area outline'
  end;
  snippet := case when r.kind in ('note', 'text', 'image') and r.text is not null
                  then ': "' || left(regexp_replace(r.text, '\s+', ' ', 'g'), 40) || '"' else '' end;
  summary := case act
    when 'added' then 'Added a ' || label
    when 'deleted' then 'Deleted a ' || label
    when 'moved' then 'Moved a ' || label
    when 'resized' then 'Resized a ' || label
    when 'rotated' then 'Rotated a ' || label
    when 'edited' then 'Edited the text of a ' || label
    when 'restyled' then 'Changed the style of a ' || label
    when 'locked' then 'Locked a ' || label
    else 'Unlocked a ' || label
  end || snippet;
  perform public.log_sheet_event(r.blueprint_id, act, 'annotation', r.kind, r.id, summary);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Drag and drop in the Layers panel: the complete order of a sheet (bottom first) in one transaction.
create function public.reorder_annotations(p_blueprint uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  bp public.blueprints;
  have uuid[];
begin
  select * into bp from public.blueprints where id = p_blueprint;
  if bp.id is null then
    raise exception 'Sheet not found';
  end if;
  if not public.can_edit_blueprints(bp.project_id) then
    raise exception 'You are not allowed to change the layers of this sheet';
  end if;
  select array_agg(id) into have from (select id from public.blueprint_annotations where blueprint_id = p_blueprint for update) s;
  if coalesce(array_length(have, 1), 0) <> coalesce(array_length(p_ids, 1), 0)
     or (select count(distinct x) from unnest(p_ids) x) <> coalesce(array_length(p_ids, 1), 0)
     or exists (select 1 from unnest(p_ids) x where x <> all (coalesce(have, '{}'))) then
    raise exception 'The list of items does not match the sheet; reload and try again';
  end if;
  update public.blueprint_annotations t set z_index = (o.ord - 1)::integer
  from unnest(p_ids) with ordinality as o(id, ord)
  where t.id = o.id and t.z_index is distinct from (o.ord - 1)::integer;
  perform public.log_sheet_event(p_blueprint, 'reordered', 'sheet', null, p_blueprint, 'Changed the layer order');
end;
$$;

revoke execute on function public.prepare_annotation(), public.guard_annotation_lock(), public.record_annotation_history()
  from public, anon, authenticated;
revoke execute on function public.reorder_annotations(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_annotations(uuid, uuid[]) to authenticated;

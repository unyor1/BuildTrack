-- 0024: Text formatting for text boxes and notes (font, bold, italic, underline, strike, case, alignment, list style, spacing).
-- One validated jsonb column keeps the table narrow: `format` = {} by default, only text boxes and notes may carry a format, and a
-- locked item cannot have its format changed (same rule as every other content column).

create function public.valid_text_format(f jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(f) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(f) k
      where k not in ('family', 'bold', 'italic', 'underline', 'strike', 'transform', 'align', 'list', 'line_height', 'letter_spacing'))
    and (not (f ? 'family') or (jsonb_typeof(f -> 'family') = 'string' and f ->> 'family' in ('Manrope', 'Poppins', 'Inter', 'Roboto', 'Playfair Display', 'Roboto Mono', 'Georgia', 'Arial')))
    and (not (f ? 'bold') or jsonb_typeof(f -> 'bold') = 'boolean')
    and (not (f ? 'italic') or jsonb_typeof(f -> 'italic') = 'boolean')
    and (not (f ? 'underline') or jsonb_typeof(f -> 'underline') = 'boolean')
    and (not (f ? 'strike') or jsonb_typeof(f -> 'strike') = 'boolean')
    and (not (f ? 'transform') or (jsonb_typeof(f -> 'transform') = 'string' and f ->> 'transform' in ('none', 'uppercase', 'lowercase', 'capitalize')))
    and (not (f ? 'align') or (jsonb_typeof(f -> 'align') = 'string' and f ->> 'align' in ('left', 'center', 'right', 'justify')))
    and (not (f ? 'list') or (jsonb_typeof(f -> 'list') = 'string' and f ->> 'list' in ('none', 'bullet', 'number')))
    and (not (f ? 'line_height') or (jsonb_typeof(f -> 'line_height') = 'number' and (f ->> 'line_height')::numeric between 0.8 and 3))
    and (not (f ? 'letter_spacing') or (jsonb_typeof(f -> 'letter_spacing') = 'number' and (f ->> 'letter_spacing')::numeric between -0.1 and 0.5))
$$;

alter table public.blueprint_annotations add column format jsonb not null default '{}'::jsonb;
alter table public.blueprint_annotations add constraint annotation_format_valid check (public.valid_text_format(format));
alter table public.blueprint_annotations add constraint annotation_format_kind check (format = '{}'::jsonb or kind in ('text', 'note'));

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
       (new.x, new.y, new.w, new.h, new.points, new.text, new.color, new.opacity, new.stroke, new.font_size, new.shape, new.symbol, new.rotation, new.format)
       is distinct from
       (old.x, old.y, old.w, old.h, old.points, old.text, old.color, old.opacity, old.stroke, old.font_size, old.shape, old.symbol, old.rotation, old.format)) then
    raise exception 'This item is locked. Unlock it first.';
  end if;
  return new;
end;
$$;

revoke execute on function public.valid_text_format(jsonb) from public, anon;
grant execute on function public.valid_text_format(jsonb) to authenticated;

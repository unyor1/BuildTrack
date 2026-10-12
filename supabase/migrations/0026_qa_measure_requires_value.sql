-- 0026: a measured item cannot be passed or failed without the measurement.
-- Site practice: a slump, a cover, a pressure test or a flood test is recorded as a number so the record can be audited later
-- (and so the tolerance check in save_inspection_item has something to judge). N/A and pending still need no value.
create or replace function public.save_inspection_item(p_item uuid, p_result text, p_measured numeric default null, p_remarks text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  it public.qa_inspection_items;
  i public.qa_inspections;
  res text := p_result;
  rem text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
  select * into it from public.qa_inspection_items where id = p_item for update;
  if it.id is null then raise exception 'Item not found'; end if;
  select * into i from public.qa_inspections where id = it.inspection_id;
  if not public.can_edit_blueprints(i.project_id) then raise exception 'Only the inspector can record results'; end if;
  if i.status <> 'in_progress' then raise exception 'The inspection is not in progress'; end if;
  if i.inspector_id is distinct from auth.uid() then raise exception 'Only the inspector can record results'; end if;
  if res not in ('pending', 'pass', 'fail', 'na') then raise exception 'Result must be pass, fail, N/A or pending'; end if;
  if it.kind = 'measure' and p_measured is not null and res <> 'na' and res <> 'pending' then
    -- a measurement outside the tolerance is a failure whatever was ticked; inside it is a pass
    if (it.min_value is not null and p_measured < it.min_value) or (it.max_value is not null and p_measured > it.max_value) then res := 'fail';
    elsif it.min_value is not null or it.max_value is not null then res := 'pass';
    end if;
  end if;
  if it.kind = 'check' then p_measured := null; end if;
  if it.kind = 'measure' and res in ('pass', 'fail') and p_measured is null then raise exception 'Enter the measured value'; end if;
  if res = 'fail' and (rem is null or char_length(rem) < 5) then raise exception 'Say what is wrong (at least 5 characters)'; end if;
  if res = 'na' and (rem is null or char_length(rem) < 3) then raise exception 'Say why this item does not apply'; end if;
  update public.qa_inspection_items set result = res, measured_value = p_measured, remarks = rem,
    checked_by = case when res = 'pending' then null else auth.uid() end, checked_at = case when res = 'pending' then null else now() end where id = p_item;
  return res;
end;
$$;

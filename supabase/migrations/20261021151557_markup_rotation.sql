-- Photo markup can be rotated: each mark may carry an optional numeric `rotation` (degrees, -360..360, turned around the
-- mark's own centre). Same rules as 20261019095439 otherwise; marks without `rotation` (all existing rows) stay valid, and any
-- other extra key is still refused. Used by the check constraints on snag_photos, site_issue_photos and qa_photos and by the
-- site issue photo RPCs, so replacing the body updates all of them.
create or replace function public.valid_issue_markup(p_value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; pt jsonb; field text; ids text[] := '{}'; keys integer;
begin
  if p_value is null or jsonb_typeof(p_value)<>'array' then return false; end if;
  if jsonb_array_length(p_value)>150 or octet_length(p_value::text)>262144 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item)<>'object' or not (item ?& array['id','kind','x','y','x2','y2','color','stroke','fontSize','text','points']) then return false; end if;
    select count(*) into keys from jsonb_object_keys(item);
    if not (keys=11 or (keys=12 and item ? 'rotation')) then return false; end if;
    if item ? 'rotation' and (jsonb_typeof(item->'rotation')<>'number' or (item->>'rotation')::numeric not between -360 and 360) then return false; end if;
    if jsonb_typeof(item->'id')<>'string' or (item->>'id') !~ '^[a-zA-Z0-9-]{1,64}$' or item->>'id'=any(ids) then return false; end if;
    ids:=array_append(ids,item->>'id');
    if coalesce(item->>'kind','') not in ('text','line','arrow','rectangle','ellipse','draw') then return false; end if;
    foreach field in array array['x','y','x2','y2'] loop
      if jsonb_typeof(item->field)<>'number' or (item->>field)::numeric not between 0 and 100 then return false; end if;
    end loop;
    if jsonb_typeof(item->'color')<>'string' or (item->>'color') !~ '^#[a-fA-F0-9]{6}$' then return false; end if;
    if jsonb_typeof(item->'stroke')<>'number' or (item->>'stroke')::numeric not between 1 and 12 then return false; end if;
    if jsonb_typeof(item->'fontSize')<>'number' or (item->>'fontSize')::numeric not between 12 and 72 then return false; end if;
    if jsonb_typeof(item->'text')<>'string' or char_length(item->>'text')>300 or (item->>'kind'='text' and btrim(item->>'text')='') then return false; end if;
    if jsonb_typeof(item->'points')<>'array' then return false; end if;
    if jsonb_array_length(item->'points')>500 or (item->>'kind'='draw' and jsonb_array_length(item->'points')<2) then return false; end if;
    for pt in select value from jsonb_array_elements(item->'points') loop
      if jsonb_typeof(pt)<>'object' or not(pt ?& array['x','y']) or (select count(*) from jsonb_object_keys(pt))<>2 then return false; end if;
      foreach field in array array['x','y'] loop
        if jsonb_typeof(pt->field)<>'number' or (pt->>field)::numeric not between 0 and 100 then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function public.valid_issue_markup(jsonb) from public,anon;
grant execute on function public.valid_issue_markup(jsonb) to authenticated;

-- Additional Philippine reference standards and explicit Engineer-defined inspection instructions.
-- Hosted migration version: 20261019093602 (local filename aligned after deployment).
-- Additive only: do not rewrite old citations, completed inspections or existing approval decisions.
-- Sources and applicability notes: docs/audits/2026-10-19-philippine-qa-standards.md

alter table public.qa_template_items
  add column acceptance_criteria text check (char_length(acceptance_criteria) <= 1000),
  add column evidence_requirement text check (char_length(evidence_requirement) <= 1000);
alter table public.qa_inspection_items
  add column acceptance_criteria text check (char_length(acceptance_criteria) <= 1000),
  add column evidence_requirement text check (char_length(evidence_requirement) <= 1000);

-- Preserve the existing catalog (including legacy PNS 49 citations), order, and custom entries.
do $catalog$
declare
  reference_catalog jsonb;
  candidate jsonb;
begin
  select value into reference_catalog from public.system_settings where key='standards' for update;
  if reference_catalog is null or jsonb_typeof(reference_catalog) <> 'array' then
    raise exception 'Standards catalog is missing or invalid; no standards were replaced';
  end if;
  for candidate in select value from jsonb_array_elements('[
    {"code":"PNS 07:2018","title":"Portland cement - Specification"},
    {"code":"PNS ASTM C90:2019 Amd. 1:2019","title":"Loadbearing concrete masonry units"},
    {"code":"PNS ASTM C129:2019 Amd. 1:2019","title":"Nonloadbearing concrete masonry units"},
    {"code":"PNS ASTM C140/C140M:2019","title":"Sampling and testing concrete masonry units and related units"},
    {"code":"PNS 67:2014","title":"Hot-dip metallic-coated steel sheets for roofing - Specification"},
    {"code":"PGBC 2015","title":"Philippine Green Building Code"},
    {"code":"PNS 49:2020","title":"Steel bars for concrete reinforcement - Specification"}
  ]'::jsonb) loop
    if not exists(select 1 from jsonb_array_elements(reference_catalog) s where lower(btrim(s->>'code'))=lower(candidate->>'code')) then
      reference_catalog := reference_catalog || jsonb_build_array(candidate);
    end if;
  end loop;
  if jsonb_array_length(reference_catalog)>30 then
    raise exception 'Adding the references would exceed 30 standards; review the catalog first';
  end if;
  update public.system_settings set value=reference_catalog, updated_at=now(), updated_by=null
    where key='standards' and value is distinct from reference_catalog;
end;
$catalog$;

-- Keep the existing role/project/MFA checks and private stage helpers.
-- Copy instructions together with the criterion when saving, duplicating, requesting, or re-inspecting.
create or replace function public.save_qa_template(p_id uuid, p_project uuid, p_name text, p_trade text, p_description text, p_standards text[], p_items jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t public.qa_templates;
  v_id uuid;
  item jsonb;
  pos integer := 0;
begin
  if p_id is not null then
    select * into t from public.qa_templates where id = p_id;
    if t.id is null then raise exception 'Template not found'; end if;
    p_project := t.project_id;
  end if;
  if p_project is null then
    if not public.is_super_admin() then raise exception 'Only a Super Admin (with MFA) can change the company library'; end if;
  elsif not public.can_edit_blueprints(p_project) then
    raise exception 'Only an engineer of the project can change its checklists';
  end if;
  if t.is_system then raise exception 'The built-in checklists cannot be edited. Duplicate one to make your own'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 60 then raise exception 'A checklist needs between 1 and 60 items'; end if;
  if p_id is null then
    insert into public.qa_templates (project_id, name, trade, description, standards, created_by)
    values (p_project, btrim(p_name), p_trade, nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_standards, '{}'), auth.uid()) returning id into v_id;
  else
    update public.qa_templates set name = btrim(p_name), trade = p_trade, description = nullif(btrim(coalesce(p_description, '')), ''), standards = coalesce(p_standards, '{}'), updated_at = now() where id = p_id;
    v_id := p_id;
    delete from public.qa_template_items where template_id = v_id;
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.qa_template_items (template_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement)
    values (v_id, pos, btrim(item ->> 'text'), coalesce(item ->> 'severity', 'major'), coalesce(item ->> 'kind', 'check'),
            nullif(item ->> 'unit', ''), nullif(item ->> 'min_value', '')::numeric, nullif(item ->> 'max_value', '')::numeric,
            nullif(btrim(coalesce(item ->> 'reference', '')), ''), coalesce((item ->> 'requires_photo')::boolean, false), coalesce((item ->> 'hold_point')::boolean, false),
            nullif(btrim(coalesce(item ->> 'acceptance_criteria', '')), ''), nullif(btrim(coalesce(item ->> 'evidence_requirement', '')), ''));
    pos := pos + 1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.duplicate_qa_template(p_template uuid, p_project uuid, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.qa_templates; v_id uuid;
begin
  select * into t from public.qa_templates where id = p_template;
  if t.id is null or (t.project_id is not null and not public.can_view_project(t.project_id)) then raise exception 'Template not found'; end if;
  if p_project is null then
    if not public.is_super_admin() then raise exception 'Only a Super Admin (with MFA) can add to the company library'; end if;
  elsif not public.can_edit_blueprints(p_project) then
    raise exception 'Only an engineer of the project can add checklists to it';
  end if;
  insert into public.qa_templates (project_id, name, trade, description, standards, created_by)
  values (p_project, coalesce(nullif(btrim(coalesce(p_name, '')), ''), left(t.name || ' (copy)', 120)), t.trade, t.description, t.standards, auth.uid()) returning id into v_id;
  insert into public.qa_template_items (template_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement)
  select v_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement from public.qa_template_items where template_id = p_template;
  return v_id;
end;
$$;

create or replace function public.request_stage_inspection(p_project uuid, p_template uuid, p_title text, p_pin uuid default null, p_location text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t public.qa_templates;
  v_id uuid;
  n integer;
  r record;
begin
  if not public.can_report_on_project(p_project) then raise exception 'You are not allowed to request inspections on this project'; end if;
  select * into t from public.qa_templates where id = p_template and not archived and (project_id is null or project_id = p_project);
  if t.id is null then raise exception 'That checklist is not available for this project'; end if;
  if p_pin is not null and not exists (select 1 from public.pins where id = p_pin and project_id = p_project) then raise exception 'That pin is not part of this project'; end if;
  n := public.next_qa_number(p_project, 'ir');
  insert into public.qa_inspections (project_id, number, template_id, title, trade, pin_id, location, request_note, standards)
  values (p_project, n, t.id, btrim(p_title), t.trade, p_pin, nullif(btrim(coalesce(p_location, '')), ''), nullif(btrim(coalesce(p_note, '')), ''), t.standards)
  returning id into v_id;
  insert into public.qa_inspection_items (inspection_id, project_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement)
  select v_id, p_project, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement from public.qa_template_items where template_id = t.id order by position;
  for r in select pm.user_id from public.project_members pm where pm.project_id = p_project and pm.member_role = 'engineer' and pm.user_id is distinct from auth.uid() loop
    perform public.notify_user(r.user_id, 'qa.requested', 'Inspection requested: ' || left(btrim(p_title), 120), 'IR-' || lpad(n::text, 4, '0') || ' - ' || t.name,
      '/engineer/qa?project=' || p_project || '&inspection=' || v_id, p_project, v_id);
  end loop;
  return v_id;
end;
$$;

create or replace function public.request_stage_reinspection(p_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  i public.qa_inspections;
  v_id uuid;
  n integer;
  r record;
begin
  select * into i from public.qa_inspections where id = p_id;
  if i.id is null or not public.can_report_on_project(i.project_id) then raise exception 'Inspection not found or you are not allowed to request a re-inspection'; end if;
  if i.status not in ('failed', 'conditional') then raise exception 'Only a failed or conditional inspection can be re-inspected'; end if;
  if exists (select 1 from public.qa_inspections where reinspection_of = p_id and status in ('requested', 'in_progress')) then raise exception 'A re-inspection is already open'; end if;
  n := public.next_qa_number(i.project_id, 'ir');
  insert into public.qa_inspections (project_id, number, template_id, title, trade, pin_id, location, request_note, standards, reinspection_of)
  values (i.project_id, n, i.template_id, left('Re-inspection: ' || i.title, 160), i.trade, i.pin_id, i.location, nullif(btrim(coalesce(p_note, '')), ''), i.standards, p_id) returning id into v_id;
  insert into public.qa_inspection_items (inspection_id, project_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement)
  select v_id, i.project_id, row_number() over (order by position) - 1, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point, acceptance_criteria, evidence_requirement
  from public.qa_inspection_items where inspection_id = p_id and result = 'fail' order by position;
  for r in select pm.user_id from public.project_members pm where pm.project_id = i.project_id and pm.member_role = 'engineer' and pm.user_id is distinct from auth.uid() loop
    perform public.notify_user(r.user_id, 'qa.requested', 'Re-inspection requested: ' || left(i.title, 110), 'IR-' || lpad(n::text, 4, '0') || ' (failed items of IR-' || lpad(i.number::text, 4, '0') || ')',
      '/engineer/qa?project=' || i.project_id || '&inspection=' || v_id, i.project_id, v_id);
  end loop;
  return v_id;
end;
$$;

-- No new RPC surface or broad grants. Retain private helpers and existing checked public entrypoints.
revoke all on function public.request_stage_inspection(uuid,uuid,text,uuid,text,text),
  public.request_stage_reinspection(uuid,text) from public,anon,authenticated;
revoke all on function public.save_qa_template(uuid,uuid,text,text,text,text[],jsonb),
  public.duplicate_qa_template(uuid,uuid,text) from public,anon;
grant execute on function public.save_qa_template(uuid,uuid,text,text,text,text[],jsonb),
  public.duplicate_qa_template(uuid,uuid,text) to authenticated;

notify pgrst, 'reload schema';

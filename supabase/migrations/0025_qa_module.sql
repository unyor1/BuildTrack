-- 0025: Quality assurance and defect logging.
--
-- Practice followed (Philippine construction QA/QC, in plain terms):
--   * An Inspection and Test Plan (ITP) turns the drawings, specifications and codes into checklists. Here: `qa_templates`
--     (company library + project copies) with items that carry a severity (critical / major / minor), an optional measurement with
--     tolerance, the standard they come from, whether a photo is required and whether the item is a HOLD POINT (work may not go on
--     until the engineer has passed it).
--   * The contractor's foreman files a Request for Inspection (IR); the project Engineer inspects, ticks pass / fail / N/A per item,
--     records measurements and photo evidence, and signs the result. Score = weighted share of passed items (weights and pass mark
--     come from `system_settings`, copied onto the inspection so later changes never rewrite history). Result: passed, conditional
--     (above the pass mark, no critical or hold-point failure, some minor / major items to fix) or failed.
--   * Every failed item becomes a Non-Conformance Report (NCR) in `qa_defects`: severity, category, standard reference, owner and a
--     due date by severity (critical 3 days, major 7, minor 14). The foreman records root cause, the corrective action and
--     preventive action (CAPA) and sends it for verification (photo evidence for major / critical); the Engineer closes it or sends
--     it back. A failed inspection can be re-inspected on its failed items only.
--   * Everything is written through checked functions; the tables are read-only to the API. Clients see only a summary.
-- Standards named in the seeded templates are references (NSCP 2015, PEC 2017, PD 1096, RA 9514, RA 1378, DOLE D.O. 13, RA 11058,
-- BP 344, PNS 49, ASTM test methods). Clause numbers are deliberately NOT invented: engineers add the exact clause per project.

create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and role in ('engineer', 'foreman', 'admin', 'super_admin'));
$$;

-- ---------------------------------------------------------------- templates (ITP checklists)
create table public.qa_templates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade, -- null = company library
  name text not null check (char_length(btrim(name)) between 3 and 120),
  trade text not null check (trade in ('structural', 'architectural', 'electrical', 'plumbing', 'mechanical', 'fire_protection', 'safety', 'general')),
  description text check (description is null or char_length(description) <= 500),
  standards text[] not null default '{}' check (cardinality(standards) <= 10),
  is_system boolean not null default false,
  archived boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index qa_templates_project_idx on public.qa_templates (project_id);

create table public.qa_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.qa_templates (id) on delete cascade,
  position integer not null check (position >= 0),
  text text not null check (char_length(btrim(text)) between 3 and 300),
  severity text not null default 'major' check (severity in ('critical', 'major', 'minor')),
  kind text not null default 'check' check (kind in ('check', 'measure')),
  unit text check (unit is null or char_length(unit) between 1 and 20),
  min_value numeric,
  max_value numeric,
  reference text check (reference is null or char_length(reference) <= 200),
  requires_photo boolean not null default false,
  hold_point boolean not null default false,
  unique (template_id, position),
  check (kind = 'measure' or (unit is null and min_value is null and max_value is null)),
  check (min_value is null or max_value is null or min_value <= max_value)
);

-- ---------------------------------------------------------------- numbering
create table public.qa_counters (
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('ir', 'ncr')),
  last_number integer not null default 0,
  primary key (project_id, kind)
);
create function public.next_qa_number(p_project uuid, p_kind text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.qa_counters (project_id, kind, last_number) values (p_project, p_kind, 1)
  on conflict (project_id, kind) do update set last_number = public.qa_counters.last_number + 1
  returning last_number into n;
  return n;
end;
$$;

-- ---------------------------------------------------------------- inspections
create table public.qa_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  template_id uuid references public.qa_templates (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  trade text not null check (trade in ('structural', 'architectural', 'electrical', 'plumbing', 'mechanical', 'fire_protection', 'safety', 'general')),
  pin_id uuid references public.pins (id) on delete set null,
  location text check (location is null or char_length(location) <= 200),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'passed', 'conditional', 'failed', 'cancelled')),
  requested_by uuid references auth.users (id) on delete set null default auth.uid(),
  requested_at timestamptz not null default now(),
  request_note text check (request_note is null or char_length(request_note) <= 500),
  inspector_id uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  score numeric(5, 2),
  threshold numeric(5, 2),
  weights jsonb,
  summary text check (summary is null or char_length(summary) <= 1000),
  standards text[] not null default '{}',
  reinspection_of uuid references public.qa_inspections (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
create index qa_inspections_project_idx on public.qa_inspections (project_id, requested_at desc);

create table public.qa_inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.qa_inspections (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null check (position >= 0),
  text text not null,
  severity text not null check (severity in ('critical', 'major', 'minor')),
  kind text not null check (kind in ('check', 'measure')),
  unit text,
  min_value numeric,
  max_value numeric,
  reference text,
  requires_photo boolean not null default false,
  hold_point boolean not null default false,
  result text not null default 'pending' check (result in ('pending', 'pass', 'fail', 'na')),
  measured_value numeric,
  remarks text check (remarks is null or char_length(remarks) <= 500),
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz,
  unique (inspection_id, position)
);
create index qa_items_inspection_idx on public.qa_inspection_items (inspection_id, position);

-- ---------------------------------------------------------------- defects (NCR)
create table public.qa_defects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  inspection_id uuid references public.qa_inspections (id) on delete set null,
  inspection_item_id uuid references public.qa_inspection_items (id) on delete set null,
  pin_id uuid references public.pins (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text check (description is null or char_length(description) <= 2000),
  category text not null default 'workmanship' check (category in ('workmanship', 'material', 'design', 'safety', 'documentation')),
  severity text not null check (severity in ('critical', 'major', 'minor')),
  trade text not null default 'general' check (trade in ('structural', 'architectural', 'electrical', 'plumbing', 'mechanical', 'fire_protection', 'safety', 'general')),
  reference text check (reference is null or char_length(reference) <= 200),
  status text not null default 'open' check (status in ('open', 'in_progress', 'for_verification', 'closed')),
  raised_by uuid references auth.users (id) on delete set null default auth.uid(),
  raised_at timestamptz not null default now(),
  assigned_to uuid references auth.users (id) on delete set null,
  due_date date,
  root_cause text check (root_cause is null or char_length(root_cause) <= 1000),
  corrective_action text check (corrective_action is null or char_length(corrective_action) <= 2000),
  preventive_action text check (preventive_action is null or char_length(preventive_action) <= 1000),
  fixed_at timestamptz,
  fixed_by uuid references auth.users (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null,
  closing_note text check (closing_note is null or char_length(closing_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
create index qa_defects_project_idx on public.qa_defects (project_id, status, severity);

create table public.qa_defect_events (
  id bigint generated always as identity primary key,
  defect_id uuid not null references public.qa_defects (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  kind text not null check (kind in ('raised', 'edited', 'status', 'rejected', 'closed')),
  from_status text,
  to_status text,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index qa_defect_events_idx on public.qa_defect_events (defect_id, id);

-- ---------------------------------------------------------------- evidence photos
create table public.qa_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  inspection_id uuid references public.qa_inspections (id) on delete cascade,
  item_id uuid references public.qa_inspection_items (id) on delete cascade,
  defect_id uuid references public.qa_defects (id) on delete cascade,
  path text not null unique check (char_length(path) between 10 and 300),
  caption text check (caption is null or char_length(caption) <= 200),
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(inspection_id, item_id, defect_id) >= 1)
);
create index qa_photos_item_idx on public.qa_photos (item_id);
create index qa_photos_defect_idx on public.qa_photos (defect_id);
create index qa_photos_inspection_idx on public.qa_photos (inspection_id);

create function public.check_qa_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  i_status text;
  d_status text;
begin
  if tg_op = 'DELETE' then
    select status into i_status from public.qa_inspections where id = coalesce(old.inspection_id, (select inspection_id from public.qa_inspection_items where id = old.item_id));
    select status into d_status from public.qa_defects where id = old.defect_id;
    if i_status in ('passed', 'conditional', 'failed') or d_status = 'closed' then
      raise exception 'Evidence of a completed inspection or a closed defect cannot be removed';
    end if;
    return old;
  end if;
  new.uploaded_by := auth.uid();
  if public.storage_project_id(new.path) is distinct from new.project_id then
    raise exception 'The file must be stored inside the project folder';
  end if;
  if new.item_id is not null then
    select i.status into i_status from public.qa_inspection_items it join public.qa_inspections i on i.id = it.inspection_id where it.id = new.item_id and it.project_id = new.project_id;
    if i_status is distinct from 'in_progress' then raise exception 'Photos can only be added while the inspection is in progress'; end if;
  end if;
  if new.inspection_id is not null then
    select status into i_status from public.qa_inspections where id = new.inspection_id and project_id = new.project_id;
    if i_status is distinct from 'in_progress' then raise exception 'Photos can only be added while the inspection is in progress'; end if;
  end if;
  if new.defect_id is not null then
    select status into d_status from public.qa_defects where id = new.defect_id and project_id = new.project_id;
    if d_status is null or d_status = 'closed' then raise exception 'Photos cannot be added to a closed or unknown defect'; end if;
  end if;
  return new;
end;
$$;
create trigger qa_photos_check before insert or delete on public.qa_photos
  for each row execute function public.check_qa_photo();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qa-evidence', 'qa-evidence', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "qa evidence: view" on storage.objects
  for select to authenticated
  using (bucket_id = 'qa-evidence' and public.storage_project_id(name) is not null and public.can_view_project(public.storage_project_id(name)) and public.is_staff());
create policy "qa evidence: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'qa-evidence' and public.storage_project_id(name) is not null and public.can_report_on_project(public.storage_project_id(name)));
create policy "qa evidence: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'qa-evidence' and (owner = auth.uid() or public.has_permission('blueprints.manage')));

-- ---------------------------------------------------------------- row level security (read only to the API)
alter table public.qa_templates enable row level security;
alter table public.qa_template_items enable row level security;
alter table public.qa_counters enable row level security;
alter table public.qa_inspections enable row level security;
alter table public.qa_inspection_items enable row level security;
alter table public.qa_defects enable row level security;
alter table public.qa_defect_events enable row level security;
alter table public.qa_photos enable row level security;

create policy "staff read templates" on public.qa_templates for select to authenticated
  using (public.is_staff() and (project_id is null or public.can_view_project(project_id)));
create policy "staff read template items" on public.qa_template_items for select to authenticated
  using (public.is_staff() and exists (select 1 from public.qa_templates t where t.id = template_id and (t.project_id is null or public.can_view_project(t.project_id))));
create policy "staff read inspections" on public.qa_inspections for select to authenticated using (public.is_staff() and public.can_view_project(project_id));
create policy "staff read inspection items" on public.qa_inspection_items for select to authenticated using (public.is_staff() and public.can_view_project(project_id));
create policy "staff read defects" on public.qa_defects for select to authenticated using (public.is_staff() and public.can_view_project(project_id));
create policy "staff read defect events" on public.qa_defect_events for select to authenticated using (public.is_staff() and public.can_view_project(project_id));
create policy "staff read evidence" on public.qa_photos for select to authenticated using (public.is_staff() and public.can_view_project(project_id));
create policy "report evidence" on public.qa_photos for insert to authenticated with check (public.can_report_on_project(project_id) and uploaded_by = auth.uid());
create policy "remove own evidence" on public.qa_photos for delete to authenticated using (uploaded_by = auth.uid() or public.has_permission('blueprints.manage'));

revoke all on public.qa_templates, public.qa_template_items, public.qa_counters, public.qa_inspections, public.qa_inspection_items,
  public.qa_defects, public.qa_defect_events, public.qa_photos from anon, authenticated;
grant select on public.qa_templates, public.qa_template_items, public.qa_inspections, public.qa_inspection_items, public.qa_defects, public.qa_defect_events, public.qa_photos to authenticated;
grant insert (project_id, inspection_id, item_id, defect_id, path, caption) on public.qa_photos to authenticated;
grant delete on public.qa_photos to authenticated;

-- ---------------------------------------------------------------- helpers
create function public.qa_weight(p_severity text, p_weights jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select coalesce((p_weights ->> p_severity)::numeric, case p_severity when 'critical' then 5 when 'major' then 3 else 1 end);
$$;
create function public.qa_due_days(p_severity text)
returns integer language sql immutable set search_path = '' as $$
  select case p_severity when 'critical' then 3 when 'major' then 7 else 14 end;
$$;

-- ---------------------------------------------------------------- template save / archive / duplicate
create function public.save_qa_template(p_id uuid, p_project uuid, p_name text, p_trade text, p_description text, p_standards text[], p_items jsonb)
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
    insert into public.qa_template_items (template_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point)
    values (v_id, pos, btrim(item ->> 'text'), coalesce(item ->> 'severity', 'major'), coalesce(item ->> 'kind', 'check'),
            nullif(item ->> 'unit', ''), nullif(item ->> 'min_value', '')::numeric, nullif(item ->> 'max_value', '')::numeric,
            nullif(btrim(coalesce(item ->> 'reference', '')), ''), coalesce((item ->> 'requires_photo')::boolean, false), coalesce((item ->> 'hold_point')::boolean, false));
    pos := pos + 1;
  end loop;
  return v_id;
end;
$$;

create function public.archive_qa_template(p_id uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.qa_templates;
begin
  select * into t from public.qa_templates where id = p_id;
  if t.id is null then raise exception 'Template not found'; end if;
  if t.project_id is null then
    if not public.is_super_admin() then raise exception 'Only a Super Admin (with MFA) can change the company library'; end if;
  elsif not public.can_edit_blueprints(t.project_id) then
    raise exception 'Only an engineer of the project can change its checklists';
  end if;
  update public.qa_templates set archived = p_archived, updated_at = now() where id = p_id;
end;
$$;

create function public.duplicate_qa_template(p_template uuid, p_project uuid, p_name text default null)
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
  insert into public.qa_template_items (template_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point)
  select v_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point from public.qa_template_items where template_id = p_template;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- inspections
create function public.request_inspection(p_project uuid, p_template uuid, p_title text, p_pin uuid default null, p_location text default null, p_note text default null)
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
  insert into public.qa_inspection_items (inspection_id, project_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point)
  select v_id, p_project, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point from public.qa_template_items where template_id = t.id order by position;
  for r in select pm.user_id from public.project_members pm where pm.project_id = p_project and pm.member_role = 'engineer' and pm.user_id is distinct from auth.uid() loop
    perform public.notify_user(r.user_id, 'qa.requested', 'Inspection requested: ' || left(btrim(p_title), 120), 'IR-' || lpad(n::text, 4, '0') || ' - ' || t.name,
      '/engineer/qa?project=' || p_project || '&inspection=' || v_id, p_project, v_id);
  end loop;
  return v_id;
end;
$$;

create function public.start_inspection(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.qa_inspections;
begin
  select * into i from public.qa_inspections where id = p_id for update;
  if i.id is null or not public.can_edit_blueprints(i.project_id) then raise exception 'Inspection not found or you are not allowed to inspect'; end if;
  if i.status <> 'requested' then raise exception 'Only a requested inspection can be started'; end if;
  update public.qa_inspections set status = 'in_progress', inspector_id = auth.uid(), started_at = now(), updated_at = now() where id = p_id;
end;
$$;

create function public.save_inspection_item(p_item uuid, p_result text, p_measured numeric default null, p_remarks text default null)
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
  if res = 'fail' and (rem is null or char_length(rem) < 5) then raise exception 'Say what is wrong (at least 5 characters)'; end if;
  if res = 'na' and (rem is null or char_length(rem) < 3) then raise exception 'Say why this item does not apply'; end if;
  update public.qa_inspection_items set result = res, measured_value = p_measured, remarks = rem,
    checked_by = case when res = 'pending' then null else auth.uid() end, checked_at = case when res = 'pending' then null else now() end where id = p_item;
  return res;
end;
$$;

create function public.complete_inspection(p_id uuid, p_summary text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.qa_inspections;
  w jsonb := coalesce((select value from public.system_settings where key = 'qa.weights'), '{"critical":5,"major":3,"minor":1}'::jsonb);
  th numeric := coalesce((select (value #>> '{}')::numeric from public.system_settings where key = 'qa.acceptance_threshold'), 90);
  pass_w numeric;
  total_w numeric;
  fails integer;
  crit_fail boolean;
  hold_fail boolean;
  res text;
  sc numeric;
  it record;
  v_defect uuid;
  v_number integer;
  v_assignee uuid;
  v_pin public.pins;
  made integer := 0;
  r record;
begin
  select * into i from public.qa_inspections where id = p_id for update;
  if i.id is null or not public.can_edit_blueprints(i.project_id) then raise exception 'Inspection not found or you are not allowed to complete it'; end if;
  if i.status <> 'in_progress' then raise exception 'Only an inspection in progress can be completed'; end if;
  if i.inspector_id is distinct from auth.uid() then raise exception 'Only the inspector who started it can complete it'; end if;
  if exists (select 1 from public.qa_inspection_items where inspection_id = p_id and result = 'pending') then raise exception 'Every item needs a result (pass, fail or N/A)'; end if;
  if exists (select 1 from public.qa_inspection_items x where x.inspection_id = p_id and x.requires_photo and x.result in ('pass', 'fail') and not exists (select 1 from public.qa_photos p where p.item_id = x.id)) then
    raise exception 'Add the required photo for every item marked with a camera';
  end if;
  select coalesce(sum(public.qa_weight(severity, w)) filter (where result = 'pass'), 0), coalesce(sum(public.qa_weight(severity, w)) filter (where result in ('pass', 'fail')), 0),
         count(*) filter (where result = 'fail'), coalesce(bool_or(result = 'fail' and severity = 'critical'), false), coalesce(bool_or(result = 'fail' and hold_point), false)
    into pass_w, total_w, fails, crit_fail, hold_fail from public.qa_inspection_items where inspection_id = p_id;
  if total_w = 0 then raise exception 'Every item is N/A, so nothing was inspected'; end if;
  sc := round(100 * pass_w / total_w, 2);
  res := case when fails = 0 then 'passed' when sc >= th and not crit_fail and not hold_fail then 'conditional' else 'failed' end;
  update public.qa_inspections set status = res, score = sc, threshold = th, weights = w, completed_at = now(), summary = nullif(btrim(coalesce(p_summary, '')), ''), updated_at = now() where id = p_id;

  if i.pin_id is not null then select * into v_pin from public.pins where id = i.pin_id; end if;
  v_assignee := v_pin.assigned_to;
  if v_assignee is null and exists (select 1 from public.project_members where project_id = i.project_id and user_id = i.requested_by and member_role = 'foreman') then v_assignee := i.requested_by; end if;

  for it in select * from public.qa_inspection_items where inspection_id = p_id and result = 'fail' order by position loop
    v_number := public.next_qa_number(i.project_id, 'ncr');
    insert into public.qa_defects (project_id, number, inspection_id, inspection_item_id, pin_id, title, description, category, severity, trade, reference, assigned_to, due_date)
    values (i.project_id, v_number, p_id, it.id, i.pin_id, left(it.text, 160), left(coalesce(it.remarks, ''), 2000), case when i.trade = 'safety' then 'safety' else 'workmanship' end,
            it.severity, i.trade, it.reference, v_assignee, current_date + public.qa_due_days(it.severity)) returning id into v_defect;
    insert into public.qa_defect_events (defect_id, project_id, kind, to_status, note) values (v_defect, i.project_id, 'raised', 'open', 'Raised from inspection IR-' || lpad(i.number::text, 4, '0'));
    made := made + 1;
    if v_assignee is not null and v_assignee is distinct from auth.uid() then
      perform public.notify_user(v_assignee, 'qa.defect', 'NCR-' || lpad(v_number::text, 4, '0') || ' (' || it.severity || '): ' || left(it.text, 100), 'Due ' || to_char(current_date + public.qa_due_days(it.severity), 'Mon DD'),
        '/foreman/issues?project=' || i.project_id || '&defect=' || v_defect, i.project_id, v_defect);
    end if;
  end loop;

  if i.requested_by is not null and i.requested_by is distinct from auth.uid() then
    perform public.notify_user(i.requested_by, 'qa.result', 'Inspection IR-' || lpad(i.number::text, 4, '0') || ' ' || res || ' (' || sc::text || '%)', left(i.title, 120) || case when made > 0 then ' - ' || made || ' NCR(s) raised' else '' end,
      '/foreman/quality-control?project=' || i.project_id || '&inspection=' || p_id, i.project_id, p_id);
  end if;
  return jsonb_build_object('result', res, 'score', sc, 'threshold', th, 'defects', made, 'critical_failed', crit_fail, 'hold_point_failed', hold_fail);
end;
$$;

create function public.request_reinspection(p_id uuid, p_note text default null)
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
  insert into public.qa_inspection_items (inspection_id, project_id, position, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point)
  select v_id, i.project_id, row_number() over (order by position) - 1, text, severity, kind, unit, min_value, max_value, reference, requires_photo, hold_point
  from public.qa_inspection_items where inspection_id = p_id and result = 'fail' order by position;
  for r in select pm.user_id from public.project_members pm where pm.project_id = i.project_id and pm.member_role = 'engineer' and pm.user_id is distinct from auth.uid() loop
    perform public.notify_user(r.user_id, 'qa.requested', 'Re-inspection requested: ' || left(i.title, 110), 'IR-' || lpad(n::text, 4, '0') || ' (failed items of IR-' || lpad(i.number::text, 4, '0') || ')',
      '/engineer/qa?project=' || i.project_id || '&inspection=' || v_id, i.project_id, v_id);
  end loop;
  return v_id;
end;
$$;

create function public.cancel_inspection(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.qa_inspections;
begin
  select * into i from public.qa_inspections where id = p_id for update;
  if i.id is null or not public.can_report_on_project(i.project_id) then raise exception 'Inspection not found or you are not allowed to cancel it'; end if;
  if i.status not in ('requested', 'in_progress') then raise exception 'A completed inspection cannot be cancelled'; end if;
  if not public.can_edit_blueprints(i.project_id) and i.requested_by is distinct from auth.uid() then raise exception 'Only the requester or an engineer can cancel it'; end if;
  if btrim(coalesce(p_reason, '')) = '' or char_length(btrim(p_reason)) < 5 then raise exception 'Give a reason (at least 5 characters)'; end if;
  update public.qa_inspections set status = 'cancelled', summary = left('Cancelled: ' || btrim(p_reason), 1000), completed_at = now(), updated_at = now() where id = p_id;
end;
$$;

-- ---------------------------------------------------------------- defects (NCR)
create function public.raise_defect(p_project uuid, p_title text, p_description text, p_category text, p_severity text, p_trade text, p_reference text default null,
                                    p_pin uuid default null, p_assigned_to uuid default null, p_due date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; n integer;
begin
  if not public.can_report_on_project(p_project) then raise exception 'You are not allowed to raise defects on this project'; end if;
  if p_pin is not null and not exists (select 1 from public.pins where id = p_pin and project_id = p_project) then raise exception 'That pin is not part of this project'; end if;
  if p_assigned_to is not null and not exists (select 1 from public.project_members where project_id = p_project and user_id = p_assigned_to and member_role = 'foreman') then raise exception 'A defect can only be assigned to a foreman of the project'; end if;
  if p_due is not null and p_due < current_date - 1 then raise exception 'The due date is in the past'; end if;
  n := public.next_qa_number(p_project, 'ncr');
  insert into public.qa_defects (project_id, number, pin_id, title, description, category, severity, trade, reference, assigned_to, due_date)
  values (p_project, n, p_pin, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_category, p_severity, coalesce(p_trade, 'general'), nullif(btrim(coalesce(p_reference, '')), ''), p_assigned_to,
          coalesce(p_due, current_date + public.qa_due_days(p_severity))) returning id into v_id;
  insert into public.qa_defect_events (defect_id, project_id, kind, to_status, note) values (v_id, p_project, 'raised', 'open', null);
  if p_assigned_to is not null and p_assigned_to is distinct from auth.uid() then
    perform public.notify_user(p_assigned_to, 'qa.defect', 'NCR-' || lpad(n::text, 4, '0') || ' (' || p_severity || '): ' || left(btrim(p_title), 100), 'Due ' || to_char(coalesce(p_due, current_date + public.qa_due_days(p_severity)), 'Mon DD'),
      '/foreman/issues?project=' || p_project || '&defect=' || v_id, p_project, v_id);
  end if;
  return v_id;
end;
$$;

create function public.edit_defect(p_id uuid, p_title text, p_description text, p_category text, p_severity text, p_reference text, p_assigned_to uuid, p_due date)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.qa_defects;
begin
  select * into d from public.qa_defects where id = p_id for update;
  if d.id is null or not public.can_edit_blueprints(d.project_id) then raise exception 'Defect not found or you are not allowed to edit it'; end if;
  if d.status = 'closed' then raise exception 'A closed defect cannot be edited'; end if;
  if p_assigned_to is not null and not exists (select 1 from public.project_members where project_id = d.project_id and user_id = p_assigned_to and member_role = 'foreman') then raise exception 'A defect can only be assigned to a foreman of the project'; end if;
  update public.qa_defects set title = btrim(p_title), description = nullif(btrim(coalesce(p_description, '')), ''), category = p_category, severity = p_severity,
    reference = nullif(btrim(coalesce(p_reference, '')), ''), assigned_to = p_assigned_to, due_date = p_due, updated_at = now() where id = p_id;
  insert into public.qa_defect_events (defect_id, project_id, kind, note) values (p_id, d.project_id, 'edited', null);
  if p_assigned_to is not null and p_assigned_to is distinct from d.assigned_to and p_assigned_to is distinct from auth.uid() then
    perform public.notify_user(p_assigned_to, 'qa.defect', 'NCR-' || lpad(d.number::text, 4, '0') || ' assigned to you: ' || left(btrim(p_title), 100), 'Due ' || coalesce(to_char(p_due, 'Mon DD'), 'not set'),
      '/foreman/issues?project=' || d.project_id || '&defect=' || p_id, d.project_id, p_id);
  end if;
end;
$$;

-- The foreman's side: work on it, record root cause and the corrective / preventive action, send it for verification.
create function public.update_defect(p_id uuid, p_status text, p_corrective_action text default null, p_root_cause text default null, p_preventive_action text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.qa_defects;
  ca text;
  r record;
begin
  select * into d from public.qa_defects where id = p_id for update;
  if d.id is null or not public.can_report_on_project(d.project_id) then raise exception 'Defect not found or you are not allowed to update it'; end if;
  if d.status = 'closed' then raise exception 'A closed defect cannot be changed'; end if;
  if p_status not in ('open', 'in_progress', 'for_verification') then raise exception 'Status must be open, in progress or for verification'; end if;
  if p_status = 'open' and d.status <> 'open' then raise exception 'A defect cannot go back to open'; end if;
  if p_status = 'for_verification' and d.status = 'open' then raise exception 'Start the work first, then send it for verification'; end if;
  ca := coalesce(nullif(btrim(coalesce(p_corrective_action, '')), ''), d.corrective_action);
  if p_status = 'for_verification' then
    if ca is null or char_length(ca) < 10 then raise exception 'Describe the corrective action taken (at least 10 characters)'; end if;
    if d.severity in ('critical', 'major') and not exists (select 1 from public.qa_photos where defect_id = p_id) then raise exception 'Add a photo of the corrected work (required for major and critical defects)'; end if;
  end if;
  update public.qa_defects set status = p_status, corrective_action = ca,
    root_cause = coalesce(nullif(btrim(coalesce(p_root_cause, '')), ''), root_cause), preventive_action = coalesce(nullif(btrim(coalesce(p_preventive_action, '')), ''), preventive_action),
    fixed_at = case when p_status = 'for_verification' then now() else fixed_at end, fixed_by = case when p_status = 'for_verification' then auth.uid() else fixed_by end, updated_at = now()
  where id = p_id;
  if p_status is distinct from d.status then
    insert into public.qa_defect_events (defect_id, project_id, kind, from_status, to_status, note) values (p_id, d.project_id, 'status', d.status, p_status, nullif(btrim(coalesce(p_note, '')), ''));
    if p_status = 'for_verification' then
      for r in select pm.user_id from public.project_members pm where pm.project_id = d.project_id and pm.member_role = 'engineer' and pm.user_id is distinct from auth.uid() loop
        perform public.notify_user(r.user_id, 'qa.defect_verify', 'Ready to verify: NCR-' || lpad(d.number::text, 4, '0'), left(d.title, 120), '/engineer/qa?project=' || d.project_id || '&tab=defects&defect=' || p_id, d.project_id, p_id);
      end loop;
    end if;
  end if;
end;
$$;

-- The engineer's side: close it (with a note) or send it back.
create function public.verify_defect(p_id uuid, p_close boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.qa_defects;
begin
  select * into d from public.qa_defects where id = p_id for update;
  if d.id is null or not public.can_edit_blueprints(d.project_id) then raise exception 'Defect not found or you are not allowed to verify it'; end if;
  if d.status <> 'for_verification' then raise exception 'Only a defect sent for verification can be closed or sent back'; end if;
  if btrim(coalesce(p_note, '')) = '' or char_length(btrim(p_note)) < 5 then raise exception 'Write a verification note (at least 5 characters)'; end if;
  if p_close then
    update public.qa_defects set status = 'closed', closed_at = now(), closed_by = auth.uid(), closing_note = btrim(p_note), updated_at = now() where id = p_id;
    insert into public.qa_defect_events (defect_id, project_id, kind, from_status, to_status, note) values (p_id, d.project_id, 'closed', d.status, 'closed', btrim(p_note));
  else
    update public.qa_defects set status = 'in_progress', fixed_at = null, fixed_by = null, updated_at = now() where id = p_id;
    insert into public.qa_defect_events (defect_id, project_id, kind, from_status, to_status, note) values (p_id, d.project_id, 'rejected', d.status, 'in_progress', btrim(p_note));
  end if;
  if d.assigned_to is not null and d.assigned_to is distinct from auth.uid() then
    perform public.notify_user(d.assigned_to, case when p_close then 'qa.defect_closed' else 'qa.defect_rejected' end,
      case when p_close then 'Closed: NCR-' else 'Sent back: NCR-' end || lpad(d.number::text, 4, '0'), left(btrim(p_note), 200), '/foreman/issues?project=' || d.project_id || '&defect=' || p_id, d.project_id, p_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------- reminders and summary
create function public.generate_defect_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; n integer := 0; late boolean;
begin
  for r in
    select d.* from public.qa_defects d
    where d.status in ('open', 'in_progress') and d.assigned_to = auth.uid() and d.due_date is not null and d.due_date <= current_date + 2
  loop
    late := r.due_date < current_date;
    if public.notify_user(auth.uid(), case when late then 'qa.defect_overdue' else 'qa.defect_due' end,
      case when late then 'Overdue: NCR-' else 'Due soon: NCR-' end || lpad(r.number::text, 4, '0') || ' ' || left(r.title, 90), 'Due ' || to_char(r.due_date, 'Mon DD'),
      '/foreman/issues?project=' || r.project_id || '&defect=' || r.id, r.project_id, r.id, 'ncr-' || r.id || '-' || to_char(current_date, 'YYYYMMDD')) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

create function public.get_qa_summary(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  staff boolean := public.is_staff();
  out jsonb;
begin
  if not public.can_view_project(p_project) then raise exception 'Project not found'; end if;
  select jsonb_build_object(
    'inspections', jsonb_build_object(
      'total', count(*) filter (where status <> 'cancelled'),
      'requested', count(*) filter (where status = 'requested'),
      'in_progress', count(*) filter (where status = 'in_progress'),
      'passed', count(*) filter (where status = 'passed'),
      'conditional', count(*) filter (where status = 'conditional'),
      'failed', count(*) filter (where status = 'failed'),
      'first_pass_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where status = 'passed') / count(*), 1) end
                          from public.qa_inspections a where a.project_id = p_project and a.reinspection_of is null and a.status in ('passed', 'conditional', 'failed')),
      'average_score', round(avg(score) filter (where status in ('passed', 'conditional', 'failed')), 1)))
  into out from public.qa_inspections where project_id = p_project;
  out := out || (select jsonb_build_object('defects', jsonb_build_object(
      'open', count(*) filter (where status <> 'closed'),
      'critical_open', count(*) filter (where status <> 'closed' and severity = 'critical'),
      'major_open', count(*) filter (where status <> 'closed' and severity = 'major'),
      'minor_open', count(*) filter (where status <> 'closed' and severity = 'minor'),
      'overdue', count(*) filter (where status <> 'closed' and due_date < current_date),
      'for_verification', count(*) filter (where status = 'for_verification'),
      'closed', count(*) filter (where status = 'closed'),
      'average_days_to_close', round(avg(extract(epoch from (closed_at - raised_at)) / 86400) filter (where status = 'closed'), 1)))
    from public.qa_defects where project_id = p_project);
  out := out || jsonb_build_object('items', (select jsonb_build_object(
      'checked', count(*) filter (where i.result in ('pass', 'fail')),
      'failed', count(*) filter (where i.result = 'fail'),
      'defects_per_100_items', case when count(*) filter (where i.result in ('pass', 'fail')) = 0 then null else round(100.0 * count(*) filter (where i.result = 'fail') / count(*) filter (where i.result in ('pass', 'fail')), 1) end)
    from public.qa_inspection_items i join public.qa_inspections a on a.id = i.inspection_id where a.project_id = p_project and a.status in ('passed', 'conditional', 'failed')));
  out := out || jsonb_build_object('by_trade', coalesce((select jsonb_agg(row_to_json(t) order by t.trade) from (
      select a.trade, count(*) filter (where a.status in ('passed', 'conditional', 'failed')) as inspections,
             case when count(*) filter (where a.status in ('passed', 'conditional', 'failed')) = 0 then null else round(100.0 * count(*) filter (where a.status = 'passed') / count(*) filter (where a.status in ('passed', 'conditional', 'failed')), 1) end as pass_rate,
             (select count(*) from public.qa_defects d where d.project_id = p_project and d.trade = a.trade and d.status <> 'closed') as open_defects
      from public.qa_inspections a where a.project_id = p_project and a.status <> 'cancelled' group by a.trade) t), '[]'::jsonb));
  out := out || jsonb_build_object('recent', coalesce((select jsonb_agg(row_to_json(x)) from (
      select a.id, a.number, a.title, a.trade, a.status, a.score, a.completed_at, a.requested_at from public.qa_inspections a
      where a.project_id = p_project and a.status <> 'cancelled' order by coalesce(a.completed_at, a.requested_at) desc limit 8) x), '[]'::jsonb));
  return out || jsonb_build_object('staff', staff);
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.is_staff(), public.next_qa_number(uuid, text), public.check_qa_photo(), public.qa_weight(text, jsonb), public.qa_due_days(text) from public, anon, authenticated;
grant execute on function public.is_staff(), public.qa_weight(text, jsonb), public.qa_due_days(text) to authenticated;
revoke execute on function public.save_qa_template(uuid, uuid, text, text, text, text[], jsonb), public.archive_qa_template(uuid, boolean), public.duplicate_qa_template(uuid, uuid, text),
  public.request_inspection(uuid, uuid, text, uuid, text, text), public.start_inspection(uuid), public.save_inspection_item(uuid, text, numeric, text), public.complete_inspection(uuid, text),
  public.request_reinspection(uuid, text), public.cancel_inspection(uuid, text), public.raise_defect(uuid, text, text, text, text, text, text, uuid, uuid, date),
  public.edit_defect(uuid, text, text, text, text, text, uuid, date), public.update_defect(uuid, text, text, text, text, text), public.verify_defect(uuid, boolean, text),
  public.generate_defect_reminders(), public.get_qa_summary(uuid) from public, anon;
grant execute on function public.save_qa_template(uuid, uuid, text, text, text, text[], jsonb), public.archive_qa_template(uuid, boolean), public.duplicate_qa_template(uuid, uuid, text),
  public.request_inspection(uuid, uuid, text, uuid, text, text), public.start_inspection(uuid), public.save_inspection_item(uuid, text, numeric, text), public.complete_inspection(uuid, text),
  public.request_reinspection(uuid, text), public.cancel_inspection(uuid, text), public.raise_defect(uuid, text, text, text, text, text, text, uuid, uuid, date),
  public.edit_defect(uuid, text, text, text, text, text, uuid, date), public.update_defect(uuid, text, text, text, text, text), public.verify_defect(uuid, boolean, text),
  public.generate_defect_reminders(), public.get_qa_summary(uuid) to authenticated;

-- ---------------------------------------------------------------- built-in checklists (company library) and the standards list
create function public.qa_seed_template(p_name text, p_trade text, p_description text, p_standards text[], p_items jsonb)
returns void language plpgsql as $$
declare v_id uuid; item jsonb; pos integer := 0;
begin
  insert into public.qa_templates (project_id, name, trade, description, standards, is_system) values (null, p_name, p_trade, p_description, p_standards, true) returning id into v_id;
  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.qa_template_items (template_id, position, text, severity, kind, unit, reference, requires_photo, hold_point)
    values (v_id, pos, item ->> 't', coalesce(item ->> 's', 'major'), coalesce(item ->> 'k', 'check'), item ->> 'u', item ->> 'r', coalesce((item ->> 'p')::boolean, false), coalesce((item ->> 'h')::boolean, false));
    pos := pos + 1;
  end loop;
end;
$$;

select public.qa_seed_template('Pre-pour inspection: structural concrete', 'structural', 'Hold-point inspection before concrete is placed in footings, columns, beams and slabs.', array['NSCP 2015', 'PD 1096', 'DOLE D.O. 13'], '[
 {"t":"Formwork dimensions, alignment and levels match the approved structural drawings","s":"major","r":"NSCP 2015: structural concrete (formwork)","p":true},
 {"t":"Formwork is tight, clean and braced; shores and supports are adequate","s":"major","r":"NSCP 2015: structural concrete (formwork)"},
 {"t":"Shoring and falsework inspected and cleared by the competent person before loading","s":"critical","r":"DOLE D.O. 13: construction safety","h":true},
 {"t":"Reinforcing bars: size, grade, number and spacing match the structural drawings","s":"critical","r":"NSCP 2015: structural concrete (reinforcement)","p":true,"h":true},
 {"t":"Concrete cover to the reinforcement as shown on the drawings","s":"major","k":"measure","u":"mm","r":"NSCP 2015: structural concrete (cover)","p":true},
 {"t":"Lap splice lengths and anchorage as shown on the drawings","s":"major","r":"NSCP 2015: structural concrete (reinforcement)"},
 {"t":"Reinforcement is clean: free of loose rust, oil, mud and form oil","s":"minor"},
 {"t":"Spacers or chairs hold the reinforcement at the specified cover","s":"minor"},
 {"t":"Embedded items, sleeves, conduits and inserts are placed and coordinated with the other trades","s":"major"},
 {"t":"Approved mix design, delivery ticket and truck arrival time checked","s":"major","r":"NSCP 2015: structural concrete (materials)"},
 {"t":"Slump of the delivered concrete","s":"major","k":"measure","u":"mm","r":"ASTM C143 (slump test)"},
 {"t":"Test cylinders cast and labelled for the 28-day strength test","s":"major","r":"ASTM C31 / C39"},
 {"t":"Pour sequence, vibrators, curing materials and weather protection are ready","s":"minor"}]'::jsonb);

select public.qa_seed_template('Reinforcing steel: material receiving', 'structural', 'Checks when reinforcing bars arrive on site, before they are used.', array['PNS 49', 'NSCP 2015'], '[
 {"t":"Mill certificates and the delivery receipt match the purchase order","s":"critical","r":"PNS 49: steel bars for concrete reinforcement","p":true},
 {"t":"Bar markings show the ordered diameter and grade","s":"critical","r":"PNS 49: steel bars for concrete reinforcement","p":true},
 {"t":"Samples for tensile and bend tests taken per lot and sent to an accredited laboratory","s":"major","r":"PNS 49: steel bars for concrete reinforcement","h":true},
 {"t":"Bars are straight, with no excessive rust, pitting or damage","s":"minor"},
 {"t":"Bar bending dimensions agree with the bar schedule","s":"major"},
 {"t":"Bars stored off the ground, covered and tagged by size and lot","s":"minor"}]'::jsonb);

select public.qa_seed_template('Footing and foundation excavation', 'structural', 'Hold-point inspection of the excavation before blinding and reinforcement.', array['NSCP 2015', 'PD 1096', 'DOLE D.O. 13'], '[
 {"t":"Excavation depth reaches the design level","s":"major","k":"measure","u":"m","r":"NSCP 2015: foundations","p":true},
 {"t":"Bearing stratum confirmed by the engineer: soil type matches the design assumption","s":"critical","r":"NSCP 2015: foundations","h":true,"p":true},
 {"t":"Bottom of the excavation is level, clean and free of loose soil and water","s":"major"},
 {"t":"Groundwater is controlled and dewatering is working","s":"major"},
 {"t":"Excavation sides are stable (sloped or shored); barricades and warning signs are in place","s":"critical","r":"DOLE D.O. 13: construction safety","p":true},
 {"t":"Lean concrete / blinding placed to the specified thickness","s":"minor"},
 {"t":"Underground utilities identified and protected","s":"major"}]'::jsonb);

select public.qa_seed_template('Concrete masonry (CHB) wall', 'architectural', 'Wall units, reinforcement, grouting and workmanship.', array['NSCP 2015', 'PD 1096'], '[
 {"t":"CHB size, strength grade and delivery tickets match the specification","s":"major"},
 {"t":"Wall layout and openings match the architectural drawings","s":"major","p":true},
 {"t":"Wall is plumb and straight","s":"major","k":"measure","u":"mm/m"},
 {"t":"Vertical and horizontal reinforcement: size and spacing per the structural drawings","s":"critical","p":true},
 {"t":"Mortar joints are full and of uniform thickness; units laid in running bond","s":"minor"},
 {"t":"Cells grouted where required; dowels to columns and slabs are in place","s":"major"},
 {"t":"Wall tied to the adjacent structure; lintels placed at openings","s":"major"},
 {"t":"Fresh masonry cured and protected","s":"minor"}]'::jsonb);

select public.qa_seed_template('Electrical rough-in', 'electrical', 'Conduits, boxes, conductors, grounding and tests before walls and ceilings are closed.', array['PEC 2017', 'PD 1096'], '[
 {"t":"Conduit type, size and routing match the approved electrical drawings","s":"major"},
 {"t":"Conduits supported; boxes secured at the designed locations and heights","s":"minor"},
 {"t":"Conductor size, insulation and colour coding per the approved plan","s":"critical"},
 {"t":"Grounding and bonding conductors installed and continuous","s":"critical","r":"PEC 2017: grounding and bonding","h":true,"p":true},
 {"t":"Insulation resistance test done and recorded","s":"major","k":"measure","u":"MOhm","h":true},
 {"t":"Panelboards and circuit breakers match the schedule; circuits are labelled","s":"major"},
 {"t":"Joints and splices made only in accessible boxes","s":"major"},
 {"t":"Penetrations through fire-rated elements are sealed","s":"major","p":true}]'::jsonb);

select public.qa_seed_template('Plumbing and sanitary', 'plumbing', 'Pipes, slopes, vents, pressure test and fixtures.', array['RA 1378', 'PD 1096'], '[
 {"t":"Pipe material, size and fittings per the approved plumbing plan","s":"major","r":"Revised National Plumbing Code of the Philippines (RA 1378)"},
 {"t":"Drain lines have the designed slope; vent connections are as designed","s":"major","r":"Revised National Plumbing Code of the Philippines (RA 1378)"},
 {"t":"Pressure test held for the specified time","s":"major","k":"measure","u":"kPa","h":true,"p":true},
 {"t":"Pipe supports and hangers at the right spacing; no sagging","s":"minor"},
 {"t":"Sleeves, floor drains and cleanouts are in place and accessible","s":"major"},
 {"t":"Penetrations through slabs and fire-rated walls are sealed","s":"major"},
 {"t":"Fixtures installed level and secure; tested for leaks","s":"minor"},
 {"t":"Water supply flushed and disinfected where required","s":"minor"}]'::jsonb);

select public.qa_seed_template('Fire protection and life safety', 'fire_protection', 'Sprinklers, alarms, exits and fire stopping.', array['RA 9514', 'PD 1096'], '[
 {"t":"Sprinkler and standpipe piping installed per the approved fire protection plan","s":"critical","r":"RA 9514: Fire Code of the Philippines"},
 {"t":"Hydrostatic test of the fire lines performed and recorded","s":"critical","r":"RA 9514: Fire Code of the Philippines","h":true,"p":true},
 {"t":"Exit signs, emergency lights and exit doors per the approved plan","s":"critical","r":"RA 9514: Fire Code of the Philippines"},
 {"t":"Fire extinguishers of the right type installed at the designed locations","s":"major"},
 {"t":"Fire alarm devices installed, wired and tested","s":"critical","r":"RA 9514: Fire Code of the Philippines"},
 {"t":"Fire stopping at every penetration through rated walls and floors","s":"major","p":true},
 {"t":"Fire exits and stairs are unobstructed","s":"critical"}]'::jsonb);

select public.qa_seed_template('Waterproofing (roof, toilets, tanks)', 'architectural', 'Substrate, membrane, flood test and protection.', array['PD 1096'], '[
 {"t":"Substrate is clean, dry and sound, with fillets at the corners","s":"major"},
 {"t":"Primer and membrane applied to the specified coats and thickness","s":"major","k":"measure","u":"mm"},
 {"t":"Membrane turned up at walls and around penetrations to the specified height","s":"major","p":true},
 {"t":"Flood test for the specified duration shows no leaks","s":"critical","k":"measure","u":"h","h":true,"p":true},
 {"t":"Protection screed or board placed before other trades walk on the membrane","s":"minor"},
 {"t":"Drains and outlets are unobstructed and at the designed levels","s":"major"}]'::jsonb);

select public.qa_seed_template('Architectural finishes (tiles, paint, doors)', 'architectural', 'Surface preparation, tiling, painting, doors and accessibility.', array['PD 1096', 'BP 344'], '[
 {"t":"Surfaces prepared and approved before finishing (plaster, putty)","s":"minor"},
 {"t":"Tile layout, alignment and joint width as drawn; no hollow tiles (tap test)","s":"major","p":true},
 {"t":"Level difference between adjacent tiles","s":"minor","k":"measure","u":"mm"},
 {"t":"Paint: specified product and number of coats; even colour, no runs","s":"minor"},
 {"t":"Doors and windows operate smoothly; hardware complete","s":"minor"},
 {"t":"Accessibility features as drawn (ramps, door clear widths, handrails)","s":"major","r":"BP 344: Accessibility Law"},
 {"t":"Sealants and caulking complete and neat","s":"minor"},
 {"t":"Final cleaning done; protective covers removed","s":"minor"}]'::jsonb);

select public.qa_seed_template('Site safety walk', 'safety', 'Daily or weekly walk-through of construction safety conditions.', array['DOLE D.O. 13', 'RA 11058'], '[
 {"t":"Workers wear the required PPE (hard hat, safety shoes, vest, gloves, eye protection)","s":"major","r":"DOLE D.O. 13: construction safety"},
 {"t":"Scaffolds on a firm base, fully planked, with guardrails and access; tagged by the competent person","s":"critical","r":"DOLE D.O. 13: construction safety","p":true},
 {"t":"Floor openings, edges and shafts are covered or guarded","s":"critical","r":"DOLE D.O. 13: construction safety","p":true},
 {"t":"Work at height: full-body harness anchored where required","s":"critical","r":"RA 11058: Occupational Safety and Health Standards Act"},
 {"t":"Temporary electrical: GFCI, no exposed wires, panels covered and labelled","s":"major"},
 {"t":"Housekeeping: walkways clear, materials stacked safely, waste removed","s":"minor"},
 {"t":"Fire extinguishers and first-aid kit available; emergency contacts posted","s":"major"},
 {"t":"Safety signs and barricades in place; toolbox meeting held today","s":"minor"},
 {"t":"Excavations, trenches and lifting equipment inspected and certified","s":"critical"}]'::jsonb);

drop function public.qa_seed_template(text, text, text, text[], jsonb);

-- Standards the company works to (editable in Admin > System settings); only filled when the list is still empty.
update public.system_settings
set value = '[{"code":"NSCP 2015","title":"National Structural Code of the Philippines, 7th Edition"},{"code":"PD 1096","title":"National Building Code of the Philippines and its Implementing Rules"},{"code":"PEC 2017","title":"Philippine Electrical Code"},{"code":"RA 1378","title":"National Plumbing Code of the Philippines (Plumbing Law)"},{"code":"RA 9514","title":"Fire Code of the Philippines"},{"code":"DOLE D.O. 13","title":"Guidelines Governing Occupational Safety and Health in the Construction Industry"},{"code":"RA 11058","title":"Occupational Safety and Health Standards Act"},{"code":"BP 344","title":"Accessibility Law"},{"code":"PNS 49","title":"Steel Bars for Concrete Reinforcement"}]'::jsonb,
    updated_at = now()
where key = 'standards' and value = '[]'::jsonb;

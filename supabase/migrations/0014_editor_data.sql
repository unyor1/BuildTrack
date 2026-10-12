-- BuildTrack 0014: data for the workspace editor (toolbar tools, sheet sorter, inspector checklist).
--   blueprint_annotations : Notes / callouts and highlighted Shapes drawn on a sheet (rect / ellipse)
--   pin_checklist_items   : a checklist tied to one pin (Engineer builds it, Foremen tick items off)
--   blueprints.scale_width_m : real-world width (metres) of the full sheet, set by calibrating the Measuring Tape
--   blueprint_revisions.thumb_path : small preview for the left sheet strip
--   pin_events kind 'checklist' : ticking an item shows in the pin timeline
-- Access follows the pins: everyone on the project can see; Engineers (assigned) and admins with blueprints.manage edit;
-- a Foreman may only tick / untick checklist items. Requires 0001-0013. Applied through the BUILDTRACK_MIGRATIONS connector.

alter table public.blueprints
  add column scale_width_m numeric(12, 3) check (scale_width_m is null or (scale_width_m > 0 and scale_width_m <= 100000));

alter table public.blueprint_revisions add column thumb_path text;

-- Revisions: a thumbnail path must also live inside the project folder.
create or replace function public.prepare_blueprint_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bp public.blueprints;
begin
  select * into bp from public.blueprints where id = new.blueprint_id;
  if bp.id is null then
    raise exception 'Blueprint not found';
  end if;
  new.project_id := bp.project_id;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  new.revision := coalesce((select max(revision) from public.blueprint_revisions where blueprint_id = new.blueprint_id), 0) + 1;
  if split_part(new.file_path, '/', 1) <> bp.project_id::text
     or split_part(new.preview_path, '/', 1) <> bp.project_id::text
     or (new.thumb_path is not null and split_part(new.thumb_path, '/', 1) <> bp.project_id::text) then
    raise exception 'Files must be stored inside the project folder';
  end if;
  return new;
end;
$$;

-- ---- Annotations (notes and shapes) ----
create table public.blueprint_annotations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  blueprint_id uuid not null references public.blueprints (id) on delete cascade,
  kind text not null check (kind in ('note', 'shape')),
  shape text check (shape in ('rect', 'ellipse')),
  x numeric(7, 4) not null check (x between 0 and 100),
  y numeric(7, 4) not null check (y between 0 and 100),
  w numeric(7, 4) check (w is null or (w > 0 and w <= 100)),
  h numeric(7, 4) check (h is null or (h > 0 and h <= 100)),
  text text check (text is null or char_length(text) <= 500),
  color text not null default 'orange' check (color in ('magenta', 'orange', 'blue', 'green', 'red', 'gray')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'shape' or (shape is null and w is null and h is null)),
  check (kind = 'note' or (shape is not null and w is not null and h is not null and x + w <= 100.0001 and y + h <= 100.0001)),
  check (kind = 'shape' or char_length(btrim(coalesce(text, ''))) > 0)
);
create index blueprint_annotations_blueprint_idx on public.blueprint_annotations (blueprint_id);

create or replace function public.prepare_annotation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bp public.blueprints;
begin
  if tg_op = 'INSERT' then
    select * into bp from public.blueprints where id = new.blueprint_id;
    if bp.id is null then
      raise exception 'Blueprint not found';
    end if;
    new.project_id := bp.project_id;
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    if new.blueprint_id <> old.blueprint_id or new.project_id <> old.project_id or new.kind <> old.kind then
      raise exception 'An annotation cannot change plan or type';
    end if;
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
create trigger blueprint_annotations_prepare before insert or update on public.blueprint_annotations
  for each row execute function public.prepare_annotation();
create trigger blueprint_annotations_audit after insert or update or delete on public.blueprint_annotations
  for each row execute function public.log_row_change();

-- ---- Pin checklist ----
create table public.pin_checklist_items (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null default 0,
  text text not null check (char_length(btrim(text)) between 1 and 200),
  done boolean not null default false,
  done_by uuid references auth.users (id) on delete set null,
  done_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pin_checklist_pin_idx on public.pin_checklist_items (pin_id, position);

alter table public.pin_events drop constraint pin_events_kind_check;
alter table public.pin_events add constraint pin_events_kind_check
  check (kind in ('created', 'moved', 'edited', 'status', 'comment', 'photo', 'checklist'));

create or replace function public.prepare_checklist_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pn public.pins;
begin
  if tg_op = 'INSERT' then
    select * into pn from public.pins where id = new.pin_id;
    if pn.id is null then
      raise exception 'Pin not found';
    end if;
    new.project_id := pn.project_id;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.position := coalesce((select max(position) + 1 from public.pin_checklist_items where pin_id = new.pin_id), 0);
    new.done := false;
    new.done_by := null;
    new.done_at := null;
  else
    -- Foremen (and anyone who cannot edit plans) may only tick / untick.
    if not public.can_edit_blueprints(old.project_id)
       and (new.text <> old.text or new.pin_id <> old.pin_id or new.position <> old.position) then
      raise exception 'Only an Engineer can change the checklist items; you can tick them off';
    end if;
    new.pin_id := old.pin_id;
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    if new.done is distinct from old.done then
      new.done_by := case when new.done then auth.uid() end;
      new.done_at := case when new.done then now() end;
    else
      new.done_by := old.done_by;
      new.done_at := old.done_at;
    end if;
  end if;
  return new;
end;
$$;
create trigger pin_checklist_prepare before insert or update on public.pin_checklist_items
  for each row execute function public.prepare_checklist_item();

create or replace function public.record_checklist_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.done is distinct from old.done then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, note)
    values (new.pin_id, new.project_id, auth.uid(), 'checklist', (case when new.done then 'Done: ' else 'Reopened: ' end) || left(new.text, 150));
  end if;
  return new;
end;
$$;
create trigger pin_checklist_event after update on public.pin_checklist_items
  for each row execute function public.record_checklist_event();

revoke execute on function public.prepare_annotation(), public.prepare_checklist_item(), public.record_checklist_event()
  from public, anon, authenticated;

-- ---- Row Level Security ----
alter table public.blueprint_annotations enable row level security;
alter table public.pin_checklist_items enable row level security;

create policy "view annotations" on public.blueprint_annotations
  for select to authenticated using (public.can_view_project(project_id));
create policy "add annotations" on public.blueprint_annotations
  for insert to authenticated with check (public.can_edit_blueprints(project_id));
create policy "edit annotations" on public.blueprint_annotations
  for update to authenticated
  using (public.can_edit_blueprints(project_id)) with check (public.can_edit_blueprints(project_id));
create policy "delete annotations" on public.blueprint_annotations
  for delete to authenticated using (public.can_edit_blueprints(project_id));

create policy "view checklist" on public.pin_checklist_items
  for select to authenticated using (public.can_view_project(project_id));
create policy "add checklist items" on public.pin_checklist_items
  for insert to authenticated with check (public.can_edit_blueprints(project_id));
create policy "tick or edit checklist items" on public.pin_checklist_items
  for update to authenticated
  using (public.can_report_on_project(project_id)) with check (public.can_report_on_project(project_id));
create policy "delete checklist items" on public.pin_checklist_items
  for delete to authenticated using (public.can_edit_blueprints(project_id));

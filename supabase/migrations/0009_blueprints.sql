-- BuildTrack 0009: blueprints (plans) with revisions, and private file storage.
-- A blueprint belongs to a project and has numbered revisions (a new upload = a new revision, old ones are kept).
-- Each revision stores the ORIGINAL file (PDF / PNG / JPEG / WebP, exported from CAD) and a PNG PREVIEW rendered
-- in the browser, which is what the pin editor displays (works offline later, no CAD/PDF engine needed to view).
-- Access (same rules as projects):
--   view   : admins with projects.manage or blueprints.manage, and everyone assigned to the project
--   upload : Engineers assigned to the project, and admins with blueprints.manage (both need to be active; admins need MFA)
--   delete : admins with blueprints.manage only; revisions are immutable (no update, no direct delete)
-- Requires 0001-0008. Applied through the BUILDTRACK_MIGRATIONS connector.

create function public.can_view_project(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('projects.manage')
      or public.has_permission('blueprints.manage')
      or public.is_project_member(pid);
$$;

create function public.can_edit_blueprints(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('blueprints.manage')
      or (public.is_active() and exists (
            select 1 from public.project_members
            where project_id = pid and user_id = auth.uid() and member_role = 'engineer'));
$$;

-- project id from a storage path "<project uuid>/..." (null when the first folder is not a uuid)
create function public.storage_project_id(object_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end;
$$;

revoke execute on function public.can_view_project(uuid), public.can_edit_blueprints(uuid), public.storage_project_id(text) from public, anon;
grant execute on function public.can_view_project(uuid), public.can_edit_blueprints(uuid), public.storage_project_id(text) to authenticated;

create table public.blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  level text check (level is null or char_length(level) <= 40),
  discipline text check (discipline is null or discipline in ('civil_structural', 'architectural', 'mep')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index blueprints_project_idx on public.blueprints (project_id);

create table public.blueprint_revisions (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.blueprints (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  revision integer not null check (revision >= 1),
  file_path text not null,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  preview_path text not null,
  preview_width integer not null check (preview_width between 1 and 20000),
  preview_height integer not null check (preview_height between 1 and 20000),
  notes text check (notes is null or char_length(notes) <= 500),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (blueprint_id, revision)
);
create index blueprint_revisions_blueprint_idx on public.blueprint_revisions (blueprint_id, revision desc);
create index blueprint_revisions_project_idx on public.blueprint_revisions (project_id);

create trigger blueprints_touch before update on public.blueprints
  for each row execute function public.touch_updated_at();

create or replace function public.prepare_blueprint()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;
create trigger blueprints_prepare before insert on public.blueprints
  for each row execute function public.prepare_blueprint();

-- Revision number, project and uploader are decided by the database; file paths must live inside the project's folder.
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
  if split_part(new.file_path, '/', 1) <> bp.project_id::text or split_part(new.preview_path, '/', 1) <> bp.project_id::text then
    raise exception 'Files must be stored inside the project folder';
  end if;
  return new;
end;
$$;
create trigger blueprint_revisions_prepare before insert on public.blueprint_revisions
  for each row execute function public.prepare_blueprint_revision();

-- Revisions are history: never edited.
create or replace function public.block_row_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows cannot be edited', tg_table_name;
end;
$$;
create trigger blueprint_revisions_immutable before update on public.blueprint_revisions
  for each row execute function public.block_row_update();

create or replace function public.log_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_id, action, details)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), jsonb_build_object('row', v_row));
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger blueprints_audit after insert or update or delete on public.blueprints
  for each row execute function public.log_row_change();
create trigger blueprint_revisions_audit after insert on public.blueprint_revisions
  for each row execute function public.log_row_change();

revoke execute on function public.prepare_blueprint(), public.prepare_blueprint_revision(),
  public.block_row_update(), public.log_row_change() from public, anon, authenticated;

alter table public.blueprints enable row level security;
alter table public.blueprint_revisions enable row level security;

create policy "view blueprints" on public.blueprints
  for select to authenticated using (public.can_view_project(project_id));
create policy "add blueprints" on public.blueprints
  for insert to authenticated with check (public.can_edit_blueprints(project_id));
create policy "edit blueprints" on public.blueprints
  for update to authenticated
  using (public.can_edit_blueprints(project_id)) with check (public.can_edit_blueprints(project_id));
create policy "delete blueprints" on public.blueprints
  for delete to authenticated using (public.has_permission('blueprints.manage'));

create policy "view revisions" on public.blueprint_revisions
  for select to authenticated using (public.can_view_project(project_id));
create policy "add revisions" on public.blueprint_revisions
  for insert to authenticated with check (public.can_edit_blueprints(project_id));

-- ---- Private storage bucket for blueprint files ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blueprints', 'blueprints', false, 26214400,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "blueprint files: view" on storage.objects
  for select to authenticated
  using (bucket_id = 'blueprints' and public.storage_project_id(name) is not null
         and public.can_view_project(public.storage_project_id(name)));
create policy "blueprint files: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blueprints' and public.storage_project_id(name) is not null
              and public.can_edit_blueprints(public.storage_project_id(name)));
create policy "blueprint files: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blueprints' and public.has_permission('blueprints.manage'));

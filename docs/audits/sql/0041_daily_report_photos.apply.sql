-- OWNER ONLY: paste this entire file in the BuildTrack Supabase SQL Editor.
-- Requires 0001-0040 already applied. NOT applied by the coding agent.
-- SHA-256 of supabase/migrations/0041_daily_report_photos.sql: 22518834cb45e34b1f47f2c569ceec113d447457d9c8c87203576f7159d4919d
-- Run once. A duplicate migration/object error must be investigated, not bypassed.
BEGIN;

-- 0041: draft-only daily report evidence. Requires 0001-0040. Do not apply automatically.
create table public.daily_report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.daily_reports(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null unique,
  caption text check (caption is null or char_length(caption) <= 1000),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  taken_at timestamptz,
  lat numeric(9,6) check (lat between -90 and 90),
  lng numeric(9,6) check (lng between -180 and 180),
  accuracy_m integer check (accuracy_m between 0 and 100000),
  distance_m integer,
  stamp_flag text check (stamp_flag in ('at_site','away_from_site','no_site_set','no_location','clock_ahead','old_photo')),
  constraint daily_report_photos_position_both check ((lat is null) = (lng is null))
);
create index daily_report_photos_report_idx on public.daily_report_photos(report_id);
create index daily_report_photos_project_idx on public.daily_report_photos(project_id, created_at desc, id);
create index daily_report_photos_uploader_idx on public.daily_report_photos(uploaded_by, created_at);

create function public.prepare_daily_report_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.daily_reports;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      select * into r from public.daily_reports where id = old.report_id for update;
      if r.status = 'submitted' then
        raise exception 'Photos of a submitted report cannot be removed. Ask an engineer to reopen it';
      end if;
    end if;
    return old;
  end if;
  -- Serialize uploads with each other AND with submit/reopen, so the limit cannot be raced.
  select * into r from public.daily_reports where id = new.report_id for update;
  if r.id is null or r.author_id is distinct from auth.uid() then
    raise exception 'Only the report author can add photos';
  end if;
  if r.status <> 'draft' then raise exception 'Photos can only be added to a draft report'; end if;
  if (select count(*) from public.daily_report_photos where report_id = r.id) >= 10 then
    raise exception 'A report can have at most 10 photos';
  end if;
  if new.path !~ ('^' || r.project_id::text || '/' || r.id::text || '/[^/]+$')
     or split_part(new.path, '/', 3) in ('.', '..') then
    raise exception 'The photo must use the project/report/file folder';
  end if;
  new.project_id := r.project_id;
  new.uploaded_by := auth.uid();
  return new;
end;
$$;
create trigger daily_report_photos_prepare before insert or delete on public.daily_report_photos
  for each row execute function public.prepare_daily_report_photo();
create trigger daily_report_photos_stamp before insert on public.daily_report_photos
  for each row execute function public.stamp_evidence_photo();
create trigger daily_report_photos_audit after insert or update or delete on public.daily_report_photos
  for each row execute function public.log_row_change();
revoke execute on function public.prepare_daily_report_photo() from public, anon, authenticated;

alter table public.daily_report_photos enable row level security;
create policy "read daily photos" on public.daily_report_photos for select to authenticated
  using (project_id in (select public.viewable_project_ids())
    and exists (select 1 from public.daily_reports r where r.id = report_id));
create policy "add daily photos" on public.daily_report_photos for insert to authenticated
  with check (public.can_report_on_project(project_id));
create policy "delete own daily photos" on public.daily_report_photos for delete to authenticated
  using (uploaded_by = (select auth.uid()));
revoke all on public.daily_report_photos from anon, authenticated;
grant select, delete on public.daily_report_photos to authenticated;
grant insert (report_id, project_id, path, caption, taken_at, lat, lng, accuracy_m)
  on public.daily_report_photos to authenticated;

-- Definer helper sees even rows hidden by RLS: hidden evidence is not an unused file.
create function public.daily_photo_in_use(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.daily_report_photos where path = p_path);
$$;
revoke execute on function public.daily_photo_in_use(text) from public, anon;
grant execute on function public.daily_photo_in_use(text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('daily-photos', 'daily-photos', false, 8388608, array['image/jpeg','image/png','image/webp']);
create policy "daily photos: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'daily-photos' and exists (
    select 1 from public.daily_reports r
    where r.author_id = (select auth.uid()) and r.status = 'draft'
      and public.can_report_on_project(r.project_id)
      and name ~ ('^' || r.project_id::text || '/' || r.id::text || '/[^/]+$')
      and split_part(name, '/', 3) not in ('.', '..')));
create policy "daily photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'daily-photos' and (owner = (select auth.uid()) or exists (
    select 1 from public.daily_report_photos p where p.path = name)));
create policy "daily photos: delete unused" on storage.objects for delete to authenticated
  using (bucket_id = 'daily-photos' and owner = (select auth.uid()) and not public.daily_photo_in_use(name));

alter publication supabase_realtime add table public.daily_report_photos, public.pin_checklist_items;

-- Compatible with projects tracked by the CLI or scripts/db-migrate.mjs.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text, checksum text,
  applied_at timestamptz not null default now(), baselined boolean not null default false
);
alter table supabase_migrations.schema_migrations add column if not exists checksum text;
insert into supabase_migrations.schema_migrations (version, name, checksum)
values ('0041', 'daily_report_photos', '22518834cb45e34b1f47f2c569ceec113d447457d9c8c87203576f7159d4919d');

COMMIT;
NOTIFY pgrst, 'reload schema';


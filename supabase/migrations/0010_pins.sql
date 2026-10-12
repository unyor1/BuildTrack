-- BuildTrack 0010: pins on blueprints (the core feature), their timeline, and photos.
-- A pin marks a spot on a blueprint (x, y in percent of the plan image, so it stays accurate at any zoom) and tracks
-- site progress / quality: status, description, category, discipline, who is responsible, due date.
-- Access:
--   view pins + photos : everyone assigned to the project (incl. Clients, read-only), and admins with projects/blueprints.manage
--   create / edit / move / delete pins, set Verified or Issue : Engineers assigned to the project, admins with blueprints.manage
--   Foremen (assigned to the project) : cannot edit pins directly; they report progress through report_pin_progress()
--       (In progress / For review only), and can comment and add photos
--   timeline (events + comments) : visible to engineers, foremen, admins; hidden from Clients; events are immutable
--   Verified pins can only be deleted by admins with blueprints.manage
-- Requires 0001-0009. Applied through the BUILDTRACK_MIGRATIONS connector.

create type public.pin_status as enum ('not_started', 'in_progress', 'for_review', 'issue', 'verified');
create type public.pin_category as enum ('progress', 'quality', 'safety', 'note');

create function public.is_project_client(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.project_members
                 where project_id = pid and user_id = auth.uid() and member_role = 'client');
$$;

-- Engineers, Foremen of the project, and admins with blueprints.manage may comment and add photos.
create function public.can_report_on_project(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('blueprints.manage')
      or (public.is_active() and exists (
            select 1 from public.project_members
            where project_id = pid and user_id = auth.uid() and member_role in ('engineer', 'foreman')));
$$;

revoke execute on function public.is_project_client(uuid), public.can_report_on_project(uuid) from public, anon;
grant execute on function public.is_project_client(uuid), public.can_report_on_project(uuid) to authenticated;

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  blueprint_id uuid not null references public.blueprints (id) on delete cascade,
  revision_id uuid references public.blueprint_revisions (id) on delete set null,
  x numeric(7, 4) not null check (x between 0 and 100),
  y numeric(7, 4) not null check (y between 0 and 100),
  title text not null check (char_length(title) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  category public.pin_category not null default 'progress',
  discipline text check (discipline is null or discipline in ('civil_structural', 'architectural', 'mep')),
  status public.pin_status not null default 'not_started',
  assigned_to uuid references public.profiles (id) on delete set null,
  due_date date,
  created_by uuid references auth.users (id) on delete set null,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pins_blueprint_idx on public.pins (blueprint_id);
create index pins_project_status_idx on public.pins (project_id, status);
create index pins_assigned_idx on public.pins (assigned_to);

create table public.pin_events (
  id bigint generated always as identity primary key,
  pin_id uuid not null references public.pins (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('created', 'moved', 'edited', 'status', 'comment', 'photo')),
  from_status public.pin_status,
  to_status public.pin_status,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  check (kind <> 'comment' or char_length(btrim(coalesce(note, ''))) > 0)
);
create index pin_events_pin_idx on public.pin_events (pin_id, id);

create table public.pin_photos (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pin_photos_pin_idx on public.pin_photos (pin_id);

-- ---- Triggers ----
create or replace function public.prepare_pin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  bp public.blueprints;
  f public.profiles;
begin
  if tg_op = 'INSERT' then
    select * into bp from public.blueprints where id = new.blueprint_id;
    if bp.id is null then
      raise exception 'Blueprint not found';
    end if;
    new.project_id := bp.project_id;
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.revision_id is not null and not exists (
         select 1 from public.blueprint_revisions where id = new.revision_id and blueprint_id = new.blueprint_id) then
      raise exception 'The revision does not belong to this blueprint';
    end if;
    if new.status = 'verified' then
      new.verified_by := auth.uid();
      new.verified_at := now();
    end if;
  else
    if new.project_id <> old.project_id or new.blueprint_id <> old.blueprint_id then
      raise exception 'A pin cannot be moved to another plan';
    end if;
    new.created_by := old.created_by;
    if new.status is distinct from old.status then
      if new.status = 'verified' then
        new.verified_by := auth.uid();
        new.verified_at := now();
      elsif old.status = 'verified' then
        new.verified_by := null;
        new.verified_at := null;
      end if;
    else
      new.verified_by := old.verified_by;
      new.verified_at := old.verified_at;
    end if;
    new.updated_at := now();
  end if;

  if new.assigned_to is not null and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to) then
    select * into f from public.profiles where id = new.assigned_to;
    if f.id is null or f.status <> 'active' or f.role is distinct from 'foreman' or not exists (
         select 1 from public.project_members where project_id = new.project_id and user_id = new.assigned_to) then
      raise exception 'A pin can only be assigned to an active Foreman on this project';
    end if;
  end if;
  return new;
end;
$$;
create trigger pins_prepare before insert or update on public.pins
  for each row execute function public.prepare_pin();

create or replace function public.record_pin_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, to_status, note)
    values (new.id, new.project_id, auth.uid(), 'created', new.status, new.title);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, from_status, to_status)
    values (new.id, new.project_id, auth.uid(), 'status', old.status, new.status);
  end if;
  if new.x is distinct from old.x or new.y is distinct from old.y then
    insert into public.pin_events (pin_id, project_id, actor_id, kind)
    values (new.id, new.project_id, auth.uid(), 'moved');
  end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.category is distinct from old.category or new.discipline is distinct from old.discipline
     or new.assigned_to is distinct from old.assigned_to or new.due_date is distinct from old.due_date then
    insert into public.pin_events (pin_id, project_id, actor_id, kind)
    values (new.id, new.project_id, auth.uid(), 'edited');
  end if;
  return new;
end;
$$;
create trigger pins_events after insert or update on public.pins
  for each row execute function public.record_pin_events();

-- Events written by users (comments): the database sets who and which project, and the pin must exist.
create or replace function public.prepare_pin_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pn public.pins;
begin
  select * into pn from public.pins where id = new.pin_id;
  if pn.id is null then
    raise exception 'Pin not found';
  end if;
  new.project_id := pn.project_id;
  new.actor_id := coalesce(auth.uid(), new.actor_id);
  return new;
end;
$$;
create trigger pin_events_prepare before insert on public.pin_events
  for each row execute function public.prepare_pin_event();
create trigger pin_events_immutable before update on public.pin_events
  for each row execute function public.block_row_update();

create or replace function public.prepare_pin_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pn public.pins;
begin
  select * into pn from public.pins where id = new.pin_id;
  if pn.id is null then
    raise exception 'Pin not found';
  end if;
  new.project_id := pn.project_id;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  if split_part(new.path, '/', 1) <> pn.project_id::text then
    raise exception 'Photos must be stored inside the project folder';
  end if;
  return new;
end;
$$;
create trigger pin_photos_prepare before insert on public.pin_photos
  for each row execute function public.prepare_pin_photo();

create or replace function public.record_photo_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pin_events (pin_id, project_id, actor_id, kind, note)
  values (new.pin_id, new.project_id, auth.uid(), 'photo', new.caption);
  return new;
end;
$$;
create trigger pin_photos_event after insert on public.pin_photos
  for each row execute function public.record_photo_event();

create trigger pins_audit after insert or update or delete on public.pins
  for each row execute function public.log_row_change();

revoke execute on function public.prepare_pin(), public.record_pin_events(), public.prepare_pin_event(),
  public.prepare_pin_photo(), public.record_photo_event() from public, anon, authenticated;

-- Foremen cannot edit pins; they report progress, limited to In progress / For review.
create or replace function public.report_pin_progress(p_pin uuid, p_status public.pin_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pn public.pins;
begin
  select * into pn from public.pins where id = p_pin;
  if pn.id is null then
    raise exception 'Pin not found';
  end if;
  if not (public.is_active() and exists (
        select 1 from public.project_members
        where project_id = pn.project_id and user_id = auth.uid() and member_role = 'foreman')) then
    raise exception 'Only a Foreman assigned to this project can report progress';
  end if;
  if p_status not in ('in_progress', 'for_review') then
    raise exception 'Foremen can only report In progress or For review';
  end if;
  if pn.status = 'verified' then
    raise exception 'A verified pin can only be changed by an Engineer';
  end if;
  if pn.assigned_to is not null and pn.assigned_to <> auth.uid() then
    raise exception 'This pin is assigned to another Foreman';
  end if;
  update public.pins set status = p_status where id = p_pin;
  if p_note is not null and char_length(btrim(p_note)) > 0 then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, note)
    values (p_pin, pn.project_id, auth.uid(), 'comment', left(btrim(p_note), 2000));
  end if;
end;
$$;
revoke execute on function public.report_pin_progress(uuid, public.pin_status, text) from public, anon;
grant execute on function public.report_pin_progress(uuid, public.pin_status, text) to authenticated;

-- ---- Row Level Security ----
alter table public.pins enable row level security;
alter table public.pin_events enable row level security;
alter table public.pin_photos enable row level security;

create policy "view pins" on public.pins
  for select to authenticated using (public.can_view_project(project_id));
create policy "add pins" on public.pins
  for insert to authenticated with check (public.can_edit_blueprints(project_id));
create policy "edit pins" on public.pins
  for update to authenticated
  using (public.can_edit_blueprints(project_id)) with check (public.can_edit_blueprints(project_id));
create policy "delete pins" on public.pins
  for delete to authenticated
  using (public.can_edit_blueprints(project_id) and (status <> 'verified' or public.has_permission('blueprints.manage')));

create policy "view timeline" on public.pin_events
  for select to authenticated
  using (public.can_view_project(project_id) and not public.is_project_client(project_id));
create policy "add comments" on public.pin_events
  for insert to authenticated
  with check (kind = 'comment' and public.can_report_on_project(project_id));

create policy "view photos" on public.pin_photos
  for select to authenticated using (public.can_view_project(project_id));
create policy "add photos" on public.pin_photos
  for insert to authenticated with check (public.can_report_on_project(project_id));
create policy "delete photos" on public.pin_photos
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.has_permission('blueprints.manage'));

-- ---- Private bucket for pin photos ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pin-photos', 'pin-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "pin photos: view" on storage.objects
  for select to authenticated
  using (bucket_id = 'pin-photos' and public.storage_project_id(name) is not null
         and public.can_view_project(public.storage_project_id(name)));
create policy "pin photos: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pin-photos' and public.storage_project_id(name) is not null
              and public.can_report_on_project(public.storage_project_id(name)));
create policy "pin photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pin-photos' and (owner = auth.uid() or public.has_permission('blueprints.manage')));

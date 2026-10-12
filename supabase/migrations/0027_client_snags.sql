-- 0027: Client defect reports ("snags").
-- A Client reports something wrong (title, where, how urgent, up to 4 photos). The project engineer triages it: ACCEPT (it becomes a
-- numbered NCR for the foreman, via raise_defect) or DECLINE (with a reason the client can read). When the NCR is closed the client's
-- report becomes "resolved" and the client is told. The client only ever sees their own reports and a plain "fix stage"; the QA tables
-- stay staff-only. Writes go through functions; the tables are read-only to the API (photos can be added by the author while pending).

alter table public.qa_counters drop constraint qa_counters_kind_check;
alter table public.qa_counters add constraint qa_counters_kind_check check (kind in ('ir', 'ncr', 'snag'));

create table public.client_snags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 2000),
  location text check (location is null or char_length(location) <= 200),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'urgent')),
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined', 'resolved', 'withdrawn')),
  response text check (response is null or char_length(response) <= 1000),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  defect_id uuid references public.qa_defects (id) on delete set null,
  fix_stage text check (fix_stage is null or fix_stage in ('open', 'in_progress', 'for_verification', 'closed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
create index client_snags_project_idx on public.client_snags (project_id, created_at desc);
create index client_snags_author_idx on public.client_snags (author_id, created_at desc);
create index client_snags_defect_idx on public.client_snags (defect_id);

create table public.snag_photos (
  id uuid primary key default gen_random_uuid(),
  snag_id uuid not null references public.client_snags (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null unique check (char_length(path) between 10 and 300),
  uploaded_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index snag_photos_snag_idx on public.snag_photos (snag_id);

create function public.check_snag_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.client_snags;
begin
  if tg_op = 'DELETE' then
    select * into s from public.client_snags where id = old.snag_id;
    if s.id is not null and s.status <> 'submitted' then raise exception 'Photos cannot be removed once the report has been looked at'; end if;
    return old;
  end if;
  select * into s from public.client_snags where id = new.snag_id;
  if s.id is null or s.author_id is distinct from auth.uid() then raise exception 'You can only add photos to your own reports'; end if;
  if s.status <> 'submitted' then raise exception 'Photos can only be added while the report is waiting for the engineer'; end if;
  if s.project_id is distinct from new.project_id or public.storage_project_id(new.path) is distinct from new.project_id or split_part(new.path, '/', 2) <> s.id::text then
    raise exception 'The file must be stored in the report''s own folder';
  end if;
  if (select count(*) from public.snag_photos where snag_id = new.snag_id) >= 4 then raise exception 'At most 4 photos per report'; end if;
  new.uploaded_by := auth.uid();
  return new;
end;
$$;
create trigger snag_photos_check before insert or delete on public.snag_photos for each row execute function public.check_snag_photo();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('snag-photos', 'snag-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "snag photos: view" on storage.objects for select to authenticated
  using (bucket_id = 'snag-photos' and public.storage_project_id(name) is not null and (
    (public.is_staff() and public.can_view_project(public.storage_project_id(name)))
    or exists (select 1 from public.client_snags s where s.id::text = split_part(name, '/', 2) and s.author_id = auth.uid())));
create policy "snag photos: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'snag-photos' and public.storage_project_id(name) is not null
    and exists (select 1 from public.client_snags s where s.id::text = split_part(name, '/', 2) and s.author_id = auth.uid() and s.project_id = public.storage_project_id(name) and s.status = 'submitted'));
create policy "snag photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'snag-photos' and owner = auth.uid());

alter table public.client_snags enable row level security;
alter table public.snag_photos enable row level security;
create policy "read own or staff snags" on public.client_snags for select to authenticated
  using ((author_id = auth.uid() and public.is_active()) or (public.is_staff() and public.can_view_project(project_id)));
create policy "read snag photos" on public.snag_photos for select to authenticated
  using (exists (select 1 from public.client_snags s where s.id = snag_id and ((s.author_id = auth.uid() and public.is_active()) or (public.is_staff() and public.can_view_project(s.project_id)))));
create policy "author adds snag photos" on public.snag_photos for insert to authenticated with check (uploaded_by = auth.uid());
create policy "author removes snag photos" on public.snag_photos for delete to authenticated using (uploaded_by = auth.uid());

revoke all on public.client_snags, public.snag_photos from anon, authenticated;
grant select on public.client_snags, public.snag_photos to authenticated;
grant insert (snag_id, project_id, path) on public.snag_photos to authenticated;
grant delete on public.snag_photos to authenticated;

-- ---------------------------------------------------------------- the client sends a report
create function public.submit_snag(p_project uuid, p_title text, p_description text, p_location text, p_urgency text default 'normal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; n integer; r record;
begin
  if not (public.is_active() and public.is_project_client(p_project)) then raise exception 'Only the client of this project can send reports'; end if;
  if (select count(*) from public.client_snags where author_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then raise exception 'You have reached the limit of 10 reports a day'; end if;
  if (select count(*) from public.client_snags where author_id = auth.uid() and project_id = p_project and status = 'submitted') >= 5 then raise exception 'You already have 5 reports waiting for the engineer'; end if;
  n := public.next_qa_number(p_project, 'snag');
  insert into public.client_snags (project_id, number, title, description, location, urgency)
  values (p_project, n, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_location, '')), ''), coalesce(p_urgency, 'normal')) returning id into v_id;
  for r in select user_id from public.project_members where project_id = p_project and member_role = 'engineer' loop
    perform public.notify_user(r.user_id, 'snag.new', 'New report from the client: ' || left(btrim(p_title), 100), coalesce(nullif(btrim(coalesce(p_location, '')), ''), 'No location given') || ' - ' || coalesce(p_urgency, 'normal') || ' urgency',
      '/engineer/qa?project=' || p_project || '&tab=snags&snag=' || v_id, p_project, v_id);
  end loop;
  return v_id;
end;
$$;

create function public.withdraw_snag(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.client_snags;
begin
  select * into s from public.client_snags where id = p_id for update;
  if s.id is null or s.author_id is distinct from auth.uid() then raise exception 'Report not found'; end if;
  if s.status <> 'submitted' then raise exception 'Only a report that is still waiting can be withdrawn'; end if;
  update public.client_snags set status = 'withdrawn', updated_at = now() where id = p_id;
end;
$$;

-- ---------------------------------------------------------------- the engineer decides
create function public.decide_snag(p_id uuid, p_accept boolean, p_note text default null, p_severity text default 'major', p_category text default 'workmanship',
                                   p_trade text default 'general', p_assigned_to uuid default null, p_due date default null, p_reference text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.client_snags; v_def uuid; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into s from public.client_snags where id = p_id for update;
  if s.id is null or not public.can_edit_blueprints(s.project_id) then raise exception 'Report not found or you are not allowed to decide on it'; end if;
  if s.status <> 'submitted' then raise exception 'This report has already been decided'; end if;
  if p_accept then
    v_def := public.raise_defect(s.project_id, s.title,
      left('Reported by the client (SR-' || lpad(s.number::text, 4, '0') || ')' || coalesce(' at ' || s.location, '') || coalesce(E'\n' || s.description, ''), 2000),
      p_category, p_severity, p_trade, p_reference, null, p_assigned_to, p_due);
    update public.client_snags set status = 'accepted', response = note, decided_by = auth.uid(), decided_at = now(), defect_id = v_def, fix_stage = 'open', updated_at = now() where id = p_id;
    perform public.notify_user(s.author_id, 'snag.accepted', 'Your report was accepted: ' || left(s.title, 100), coalesce(note, 'The team will fix it and check the repair. You will be told when it is done.'),
      '/client/ticket?project=' || s.project_id || '&snag=' || p_id, s.project_id, p_id);
    return v_def;
  end if;
  if note is null or char_length(note) < 5 then raise exception 'Tell the client why (at least 5 characters)'; end if;
  update public.client_snags set status = 'declined', response = note, decided_by = auth.uid(), decided_at = now(), updated_at = now() where id = p_id;
  perform public.notify_user(s.author_id, 'snag.declined', 'Your report was reviewed: ' || left(s.title, 100), left(note, 300), '/client/ticket?project=' || s.project_id || '&snag=' || p_id, s.project_id, p_id);
  return null;
end;
$$;

-- Keep the client's report in step with its NCR; tell the client when the repair is verified and closed.
create function public.sync_snag_with_defect()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s public.client_snags;
begin
  select * into s from public.client_snags where defect_id = new.id;
  if s.id is null then return new; end if;
  update public.client_snags set fix_stage = new.status,
    status = case when new.status = 'closed' then 'resolved' else status end,
    resolved_at = case when new.status = 'closed' then now() else resolved_at end, updated_at = now() where id = s.id;
  if new.status = 'closed' then
    perform public.notify_user(s.author_id, 'snag.resolved', 'Fixed and checked: ' || left(s.title, 100), 'The engineer has verified the repair.', '/client/ticket?project=' || s.project_id || '&snag=' || s.id, s.project_id, s.id);
  end if;
  return new;
end;
$$;
create trigger qa_defects_sync_snag after update of status on public.qa_defects
  for each row when (old.status is distinct from new.status) execute function public.sync_snag_with_defect();

revoke execute on function public.check_snag_photo(), public.sync_snag_with_defect() from public, anon, authenticated;
revoke execute on function public.submit_snag(uuid, text, text, text, text), public.withdraw_snag(uuid), public.decide_snag(uuid, boolean, text, text, text, text, uuid, date, text) from public, anon;
grant execute on function public.submit_snag(uuid, text, text, text, text), public.withdraw_snag(uuid), public.decide_snag(uuid, boolean, text, text, text, text, uuid, date, text) to authenticated;

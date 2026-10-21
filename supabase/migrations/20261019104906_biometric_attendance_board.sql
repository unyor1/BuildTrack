-- Applied version aligned to hosted migration history. Worker identities are not website accounts.
-- Never store fingerprint images/templates here.
create table public.attendance_workers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  worker_code text not null check (char_length(btrim(worker_code)) between 1 and 80),
  biometric_uid text not null check (char_length(btrim(biometric_uid)) between 1 and 80),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 160),
  trade text not null default '' check (char_length(trade) <= 100),
  photo_path text check (photo_path is null or (photo_path like project_id::text || '/' || id::text || '/%' and char_length(photo_path) <= 300)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id,id), unique(project_id,worker_code), unique(project_id,biometric_uid)
);
create table public.biometric_attendance_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  worker_id uuid not null,
  direction text not null check (direction in ('in','out')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  device_id text not null check (char_length(btrim(device_id)) between 1 and 100),
  external_event_id text not null check (char_length(btrim(external_event_id)) between 1 and 160),
  foreign key(project_id,worker_id) references public.attendance_workers(project_id,id),
  unique(project_id,device_id,external_event_id)
);
create index attendance_recent on public.biometric_attendance_events(project_id,occurred_at desc,received_at desc,id);
create index attendance_worker_recent on public.biometric_attendance_events(worker_id,occurred_at desc);
alter table public.attendance_workers enable row level security;
alter table public.biometric_attendance_events enable row level security;
revoke all on public.attendance_workers,public.biometric_attendance_events from public,anon,authenticated,service_role;
grant select on public.attendance_workers,public.biometric_attendance_events to authenticated,service_role;
grant insert on public.attendance_workers to authenticated;
grant update(worker_code,biometric_uid,full_name,trade,photo_path,active) on public.attendance_workers to authenticated;
grant insert on public.biometric_attendance_events to service_role;
create policy "project staff read workers" on public.attendance_workers for select to authenticated
  using ((select public.is_staff()) and public.can_view_project(project_id));
create policy "biometric managers add workers" on public.attendance_workers for insert to authenticated
  with check ((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id));
create policy "biometric managers edit workers" on public.attendance_workers for update to authenticated
  using ((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id))
  with check ((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id));
create policy "project staff read attendance" on public.biometric_attendance_events for select to authenticated
  using ((select public.is_staff()) and public.can_view_project(project_id));
create trigger attendance_worker_audit after insert or update on public.attendance_workers
  for each row execute function public.log_row_change();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('worker-photos','worker-photos',false,2097152,array['image/jpeg','image/png','image/webp']);
create policy "project staff read worker photos" on storage.objects for select to authenticated
  using (bucket_id='worker-photos' and (select public.is_staff()) and public.can_view_project(public.storage_project_id(name)));
create policy "biometric managers upload worker photos" on storage.objects for insert to authenticated
  with check (bucket_id='worker-photos' and (select public.has_permission('biometrics.manage'))
    and exists(select 1 from public.attendance_workers w where w.project_id=public.storage_project_id(name)
      and w.id::text=split_part(name,'/',2) and public.can_view_project(w.project_id)));

-- Trusted server/device bridge only. Web clients cannot fabricate a successful biometric scan.
-- Explicit IN/OUT and a stable source event ID are required; retries do not toggle attendance.
create function public.record_biometric_attendance(p_project uuid,p_biometric_uid text,p_direction text,p_occurred_at timestamptz,p_device text,p_event text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare w public.attendance_workers; previous public.biometric_attendance_events; event_id uuid;
begin
  if p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'A valid device scan timestamp is required (not in the future)'; end if;
  if p_direction is null or p_direction not in ('in','out') or p_device is null or char_length(btrim(p_device)) not between 1 and 100
    or p_event is null or char_length(btrim(p_event)) not between 1 and 160 then raise exception 'Direction, device and unique event ID are required'; end if;
  select * into w from public.attendance_workers where project_id=p_project and biometric_uid=btrim(p_biometric_uid);
  if not found then raise exception 'Worker biometric ID is not linked to this project'; end if;
  select * into previous from public.biometric_attendance_events where project_id=p_project and device_id=btrim(p_device) and external_event_id=btrim(p_event);
  if found then
    if (previous.worker_id,previous.direction,previous.occurred_at) is distinct from (w.id,p_direction,p_occurred_at) then
      raise exception 'Source event ID already exists with different scan details'; end if;
    return previous.id;
  end if;
  if not w.active then raise exception 'Worker is inactive'; end if;
  insert into public.biometric_attendance_events(project_id,worker_id,direction,occurred_at,device_id,external_event_id)
    values(p_project,w.id,p_direction,p_occurred_at,btrim(p_device),btrim(p_event))
    on conflict(project_id,device_id,external_event_id) do nothing returning id into event_id;
  if event_id is null then
    select * into previous from public.biometric_attendance_events where project_id=p_project and device_id=btrim(p_device) and external_event_id=btrim(p_event);
    if (previous.worker_id,previous.direction,previous.occurred_at) is distinct from (w.id,p_direction,p_occurred_at) then
      raise exception 'Source event ID already exists with different scan details'; end if;
    event_id:=previous.id;
  end if;
  return event_id;
end; $$;
revoke all on function public.record_biometric_attendance(uuid,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_biometric_attendance(uuid,text,text,timestamptz,text,text) to service_role;

-- Server-side aggregation avoids truncating today's totals to the recent-records page.
create function public.attendance_day_summary(p_project uuid,p_day date)
returns jsonb language sql stable security invoker set search_path='' as $$
  with events as (
    select * from public.biometric_attendance_events where project_id=p_project
      and occurred_at >= (p_day::timestamp at time zone 'Asia/Manila')
      and occurred_at < ((p_day+1)::timestamp at time zone 'Asia/Manila')
  ), latest as (
    select distinct on(worker_id) direction from events order by worker_id,occurred_at desc,received_at desc,id desc
  ) select jsonb_build_object('scans',(select count(*) from events),'workers',(select count(*) from latest),
      'clocked_in',(select count(*) from latest where direction='in'),'clocked_out',(select count(*) from latest where direction='out'));
$$;
revoke all on function public.attendance_day_summary(uuid,date) from public,anon;
grant execute on function public.attendance_day_summary(uuid,date) to authenticated;
alter publication supabase_realtime add table public.attendance_workers,public.biometric_attendance_events;
notify pgrst,'reload schema';

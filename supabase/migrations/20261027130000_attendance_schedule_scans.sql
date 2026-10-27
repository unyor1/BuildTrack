-- Accurate biometric attendance: an Admin-set schedule per project, and the database (not a switch on the scanner)
-- decides IN or OUT. Repeat scans inside the project's window and scans older than the worker's last one are logged
-- as ignored instead of becoming attendance rows, so a worker can never be clocked in twice by scanning twice.

-- 1. Schedule per project (one row). Day shifts only: time out is later than time in on the same Manila day.
create table public.attendance_schedules (
  project_id uuid primary key references public.projects(id),
  time_in time(0) not null,
  time_out time(0) not null,
  grace_minutes integer not null default 15 check (grace_minutes between 0 and 120),
  repeat_guard_minutes integer not null default 15 check (repeat_guard_minutes between 1 and 120),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  check (time_out > time_in)
);
alter table public.attendance_schedules enable row level security;
revoke all on public.attendance_schedules from public,anon,authenticated,service_role;
grant select on public.attendance_schedules to authenticated,service_role;
create policy "project staff read attendance schedule" on public.attendance_schedules for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));
create trigger attendance_schedule_audit after insert or update on public.attendance_schedules
  for each row execute function public.log_row_change();

create function public.set_attendance_schedule(p_project uuid,p_time_in time,p_time_out time,p_grace integer,p_repeat integer)
returns public.attendance_schedules language plpgsql security definer set search_path='' as $$
declare s public.attendance_schedules;
begin
  if not public.has_permission('biometrics.manage') then raise exception 'Admin biometric permission and MFA required'; end if;
  if p_project is null or not public.can_view_project(p_project) then raise exception 'Project not accessible'; end if;
  if p_time_in is null or p_time_out is null or date_trunc('minute',p_time_out::interval)<=date_trunc('minute',p_time_in::interval) then
    raise exception 'Time out must be later than time in on the same day'; end if;
  if p_grace is null or p_grace not between 0 and 120 then raise exception 'Grace period must be 0 to 120 minutes'; end if;
  if p_repeat is null or p_repeat not between 1 and 120 then raise exception 'Repeat-scan window must be 1 to 120 minutes'; end if;
  insert into public.attendance_schedules(project_id,time_in,time_out,grace_minutes,repeat_guard_minutes,updated_by,updated_at)
    values(p_project,date_trunc('minute',p_time_in::interval)::time,date_trunc('minute',p_time_out::interval)::time,p_grace,p_repeat,auth.uid(),clock_timestamp())
    on conflict(project_id) do update set time_in=excluded.time_in,time_out=excluded.time_out,grace_minutes=excluded.grace_minutes,
      repeat_guard_minutes=excluded.repeat_guard_minutes,updated_by=excluded.updated_by,updated_at=excluded.updated_at
    returning * into s;
  return s;
end; $$;
revoke all on function public.set_attendance_schedule(uuid,time,time,integer,integer) from public,anon,service_role;
grant execute on function public.set_attendance_schedule(uuid,time,time,integer,integer) to authenticated;

-- 2. How each recorded scan compares with the schedule. Older rows stay null (recorded before schedules existed).
alter table public.biometric_attendance_events
  add column schedule_flag text check (schedule_flag in ('on_time','late','early_out','returned','no_schedule')),
  add column minutes_off integer check (minutes_off between 1 and 1440);

-- 3. Scans that were received but did not become attendance (kept for audit and device retries).
create table public.attendance_ignored_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  worker_id uuid not null,
  device_id text not null check (char_length(btrim(device_id)) between 1 and 100),
  external_event_id text not null check (char_length(btrim(external_event_id)) between 1 and 160),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  reason text not null check (reason in ('repeat','out_of_order')),
  kept_event_id uuid not null references public.biometric_attendance_events(id),
  foreign key(project_id,worker_id) references public.attendance_workers(project_id,id),
  unique(project_id,device_id,external_event_id)
);
create index attendance_ignored_recent on public.attendance_ignored_scans(project_id,occurred_at desc);
create index attendance_ignored_worker on public.attendance_ignored_scans(worker_id,occurred_at desc);
create index attendance_ignored_kept on public.attendance_ignored_scans(kept_event_id);
create index attendance_ignored_rate on public.attendance_ignored_scans(device_id,received_at desc);
alter table public.attendance_ignored_scans enable row level security;
revoke all on public.attendance_ignored_scans from public,anon,authenticated,service_role;
grant select on public.attendance_ignored_scans to authenticated,service_role;
grant insert on public.attendance_ignored_scans to service_role;
create policy "project staff read ignored scans" on public.attendance_ignored_scans for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));

-- 4. The decision. Service role only (called by the device receiver after it authenticates the device).
--    Per worker and Manila day: first accepted scan = IN, then OUT, IN, OUT ... A scan less than the project's
--    repeat window after the worker's last accepted scan, or older than it, is ignored. A retry of the same source
--    event always gets the same answer and never a second row.
create function public.record_biometric_scan(p_project uuid,p_biometric_uid text,p_occurred_at timestamptz,p_device text,p_event text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  w public.attendance_workers; s public.attendance_schedules; previous public.biometric_attendance_events;
  skipped public.attendance_ignored_scans; latest_event public.biometric_attendance_events; kept public.biometric_attendance_events;
  has_last boolean; local_ts timestamp; day_start timestamptz; scan_min integer; next_direction text; flag text; minutes integer;
  new_id uuid; ignore_reason text;
begin
  if p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'A valid device scan timestamp is required (not in the future)'; end if;
  if p_device is null or char_length(btrim(p_device)) not between 1 and 100 or p_event is null or char_length(btrim(p_event)) not between 1 and 160 then
    raise exception 'Direction, device and unique event ID are required'; end if;
  -- Locking the worker serializes scans from several devices, so two scans can never both become the next IN.
  select * into w from public.attendance_workers where project_id=p_project and biometric_uid=btrim(p_biometric_uid) for update;
  if not found then raise exception 'Worker biometric ID is not linked to this project'; end if;

  select * into previous from public.biometric_attendance_events where project_id=p_project and device_id=btrim(p_device) and external_event_id=btrim(p_event);
  if found then
    if (previous.worker_id,previous.occurred_at) is distinct from (w.id,p_occurred_at) then
      raise exception 'Source event ID already exists with different scan details'; end if;
    return jsonb_build_object('event_id',previous.id,'status','recorded','direction',previous.direction,'occurred_at',previous.occurred_at,
      'schedule_flag',previous.schedule_flag,'minutes_off',previous.minutes_off);
  end if;
  select * into skipped from public.attendance_ignored_scans where project_id=p_project and device_id=btrim(p_device) and external_event_id=btrim(p_event);
  if found then
    if (skipped.worker_id,skipped.occurred_at) is distinct from (w.id,p_occurred_at) then
      raise exception 'Source event ID already exists with different scan details'; end if;
    select * into kept from public.biometric_attendance_events where id=skipped.kept_event_id;
    return jsonb_build_object('event_id',kept.id,'status',skipped.reason,'direction',kept.direction,'occurred_at',kept.occurred_at,
      'schedule_flag',kept.schedule_flag,'minutes_off',kept.minutes_off);
  end if;
  if not w.active then raise exception 'Worker is inactive'; end if;

  local_ts:=p_occurred_at at time zone 'Asia/Manila';
  day_start:=date_trunc('day',local_ts) at time zone 'Asia/Manila';
  select * into s from public.attendance_schedules where project_id=p_project;
  select * into latest_event from public.biometric_attendance_events
    where project_id=p_project and worker_id=w.id and occurred_at>=day_start and occurred_at<day_start+interval '1 day'
    order by occurred_at desc,received_at desc,id desc limit 1;
  has_last:=found;
  if has_last then
    ignore_reason:=case when p_occurred_at<latest_event.occurred_at then 'out_of_order'
      when p_occurred_at-latest_event.occurred_at<make_interval(mins=>coalesce(s.repeat_guard_minutes,15)) then 'repeat' end;
    if ignore_reason is not null then
      insert into public.attendance_ignored_scans(project_id,worker_id,device_id,external_event_id,occurred_at,reason,kept_event_id)
        values(p_project,w.id,btrim(p_device),btrim(p_event),p_occurred_at,ignore_reason,latest_event.id);
      return jsonb_build_object('event_id',latest_event.id,'status',ignore_reason,'direction',latest_event.direction,'occurred_at',latest_event.occurred_at,
        'schedule_flag',latest_event.schedule_flag,'minutes_off',latest_event.minutes_off);
    end if;
  end if;

  next_direction:=case when has_last and latest_event.direction='in' then 'out' else 'in' end;
  scan_min:=extract(hour from local_ts)::integer*60+extract(minute from local_ts)::integer;
  if s.project_id is null then flag:='no_schedule';
  elsif next_direction='in' and exists(select 1 from public.biometric_attendance_events e where e.project_id=p_project and e.worker_id=w.id
      and e.direction='in' and e.occurred_at>=day_start and e.occurred_at<day_start+interval '1 day') then flag:='returned';
  elsif next_direction='in' then
    -- Late counts from the scheduled time in; the grace period only decides whether it is late at all.
    if scan_min>extract(epoch from s.time_in)::integer/60+s.grace_minutes then
      flag:='late'; minutes:=scan_min-extract(epoch from s.time_in)::integer/60;
    else flag:='on_time'; end if;
  elsif scan_min<extract(epoch from s.time_out)::integer/60 then
    flag:='early_out'; minutes:=extract(epoch from s.time_out)::integer/60-scan_min;
  else flag:='on_time'; end if;

  insert into public.biometric_attendance_events(project_id,worker_id,direction,occurred_at,device_id,external_event_id,schedule_flag,minutes_off)
    values(p_project,w.id,next_direction,p_occurred_at,btrim(p_device),btrim(p_event),flag,minutes)
    on conflict(project_id,device_id,external_event_id) do nothing returning id into new_id;
  if new_id is null then raise exception 'Source event ID already exists with different scan details'; end if;
  return jsonb_build_object('event_id',new_id,'status','recorded','direction',next_direction,'occurred_at',p_occurred_at,
    'schedule_flag',flag,'minutes_off',minutes);
end; $$;
revoke all on function public.record_biometric_scan(uuid,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_biometric_scan(uuid,text,timestamptz,text,text) to service_role;

-- Old entry point (deployed receiver and firmware send in/out from a switch). The switch value is no longer trusted:
-- same decision as above, returning the attendance row the scan ended up on.
create or replace function public.record_biometric_attendance(p_project uuid,p_biometric_uid text,p_direction text,p_occurred_at timestamptz,p_device text,p_event text)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
  if p_direction is null or p_direction not in ('in','out','auto') then raise exception 'Direction, device and unique event ID are required'; end if;
  return (public.record_biometric_scan(p_project,p_biometric_uid,p_occurred_at,p_device,p_event)->>'event_id')::uuid;
end; $$;

-- 5. New device entry point: returns the decision so the scanner can show "Time IN", "Time OUT" or "Already recorded".
create function public.ingest_biometric_scan(p_device uuid,p_token_hash text,p_biometric_uid text,p_occurred_at timestamptz,p_event text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.attendance_devices; result jsonb;
begin
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or p_token_hash is null or d.token_sha256<>p_token_hash then
    raise exception 'Invalid or revoked device credential' using errcode='28000'; end if;
  if exists(select 1 from public.attendance_workers w where w.project_id=d.project_id and w.biometric_uid=btrim(p_biometric_uid)
    and w.enrolled_device_id is not null and w.enrolled_device_id<>d.id) then raise exception 'Fingerprint registered on another device'; end if;
  -- Ignored scans count toward the rate limit too, so repeated scanning cannot flood the database.
  if not exists(select 1 from public.biometric_attendance_events where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and not exists(select 1 from public.attendance_ignored_scans where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and (select count(*) from (
      select 1 from public.biometric_attendance_events where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute'
      union all select 1 from public.attendance_ignored_scans where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute'
      limit 120) recent)>=120 then
    raise exception 'Device scan rate limit exceeded' using errcode='P0429'; end if;
  result:=public.record_biometric_scan(d.project_id,p_biometric_uid,p_occurred_at,d.id::text,p_event);
  update public.attendance_devices set last_seen_at=clock_timestamp() where id=d.id;
  return result;
end; $$;
revoke all on function public.ingest_biometric_scan(uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ingest_biometric_scan(uuid,text,text,timestamptz,text) to service_role;

-- Old device entry point (deployed receiver): same body as 20261020090300, but ignored scans now count toward the
-- rate limit as well; otherwise repeat scans through it would never reach the limit.
create or replace function public.ingest_biometric_device_event(p_device uuid,p_token_hash text,p_biometric_uid text,p_direction text,p_occurred_at timestamptz,p_event text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare d public.attendance_devices; event_id uuid;
begin
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or p_token_hash is null or d.token_sha256<>p_token_hash then
    raise exception 'Invalid or revoked device credential' using errcode='28000'; end if;
  if exists(select 1 from public.attendance_workers w where w.project_id=d.project_id and w.biometric_uid=btrim(p_biometric_uid)
    and w.enrolled_device_id is not null and w.enrolled_device_id<>d.id) then raise exception 'Fingerprint registered on another device'; end if;
  if not exists(select 1 from public.biometric_attendance_events where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and not exists(select 1 from public.attendance_ignored_scans where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and (select count(*) from (
      select 1 from public.biometric_attendance_events where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute'
      union all select 1 from public.attendance_ignored_scans where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute'
      limit 120) recent)>=120 then
    raise exception 'Device scan rate limit exceeded' using errcode='P0429'; end if;
  event_id:=public.record_biometric_attendance(d.project_id,p_biometric_uid,p_direction,p_occurred_at,d.id::text,p_event);
  update public.attendance_devices set last_seen_at=clock_timestamp() where id=d.id;
  return event_id;
end; $$;

-- 6. Day summary also counts late arrivals and ignored scans (existing keys unchanged).
create or replace function public.attendance_day_summary(p_project uuid,p_day date)
returns jsonb language sql stable security invoker set search_path='' as $$
  with events as (
    select * from public.biometric_attendance_events where project_id=p_project
      and occurred_at >= (p_day::timestamp at time zone 'Asia/Manila')
      and occurred_at < ((p_day+1)::timestamp at time zone 'Asia/Manila')
  ), latest as (
    select distinct on(worker_id) direction from events order by worker_id,occurred_at desc,received_at desc,id desc
  ) select jsonb_build_object('scans',(select count(*) from events),'workers',(select count(*) from latest),
      'clocked_in',(select count(*) from latest where direction='in'),'clocked_out',(select count(*) from latest where direction='out'),
      'late',(select count(*) from events where schedule_flag='late'),
      'ignored',(select count(*) from public.attendance_ignored_scans i where i.project_id=p_project
        and i.occurred_at >= (p_day::timestamp at time zone 'Asia/Manila') and i.occurred_at < ((p_day+1)::timestamp at time zone 'Asia/Manila')));
$$;
notify pgrst,'reload schema';

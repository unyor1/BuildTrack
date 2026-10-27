-- Scan messages on the site attendance screen. A scan that cannot count (finger not registered on the scanner, scanner
-- slot not linked to a worker of this project, worker inactive, finger registered on another scanner) is logged here
-- instead of raising an error. Before, those errors made the scanner keep the scan pending and stop scanning.
-- The screen also hears live about recorded and repeat scans (realtime publication).
create table public.attendance_unregistered_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  device_id text not null check (char_length(btrim(device_id)) between 1 and 100),
  external_event_id text not null check (char_length(btrim(external_event_id)) between 1 and 160),
  reason text not null check (reason in ('no_match','not_linked','inactive','other_device')),
  sensor_slot text check (sensor_slot is null or char_length(sensor_slot) between 1 and 80),
  worker_id uuid,
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  foreign key(project_id,worker_id) references public.attendance_workers(project_id,id),
  unique(project_id,device_id,external_event_id)
);
create index attendance_unregistered_recent on public.attendance_unregistered_scans(project_id,received_at desc);
create index attendance_unregistered_rate on public.attendance_unregistered_scans(device_id,received_at desc);
create index attendance_unregistered_worker on public.attendance_unregistered_scans(worker_id) where worker_id is not null;
alter table public.attendance_unregistered_scans enable row level security;
revoke all on public.attendance_unregistered_scans from public,anon,authenticated,service_role;
grant select on public.attendance_unregistered_scans to authenticated,service_role;
grant insert on public.attendance_unregistered_scans to service_role;
create policy "project staff read unregistered scans" on public.attendance_unregistered_scans for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));

-- One device answer for a scan that cannot count. A retry of the same source event gets the same answer.
create function public.log_unregistered_scan(p_project uuid,p_device text,p_event text,p_reason text,p_slot text,p_worker uuid,p_occurred_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare u public.attendance_unregistered_scans;
begin
  insert into public.attendance_unregistered_scans(project_id,device_id,external_event_id,reason,sensor_slot,worker_id,occurred_at)
    values(p_project,btrim(p_device),btrim(p_event),p_reason,nullif(btrim(coalesce(p_slot,'')),''),p_worker,p_occurred_at)
    on conflict(project_id,device_id,external_event_id) do nothing returning * into u;
  if u.id is null then
    select * into u from public.attendance_unregistered_scans where project_id=p_project and device_id=btrim(p_device) and external_event_id=btrim(p_event);
    if u.occurred_at is distinct from p_occurred_at then raise exception 'Source event ID already exists with different scan details'; end if;
  end if;
  return jsonb_build_object('event_id',null,'status','unregistered','reason',u.reason,'occurred_at',u.occurred_at);
end; $$;
revoke all on function public.log_unregistered_scan(uuid,text,text,text,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.log_unregistered_scan(uuid,text,text,text,text,uuid,timestamptz) to service_role;

-- Same entry point as 20261027130000; unknown / inactive / other-scanner fingers are now answered, not refused.
create or replace function public.ingest_biometric_scan(p_device uuid,p_token_hash text,p_biometric_uid text,p_occurred_at timestamptz,p_event text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.attendance_devices; w public.attendance_workers; seen public.attendance_unregistered_scans;
begin
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or p_token_hash is null or d.token_sha256<>p_token_hash then
    raise exception 'Invalid or revoked device credential' using errcode='28000'; end if;
  if p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'A valid device scan timestamp is required (not in the future)'; end if;
  if p_event is null or char_length(btrim(p_event)) not between 1 and 160 then raise exception 'Direction, device and unique event ID are required'; end if;
  -- Every kind of received scan counts toward the rate limit, so repeated scanning cannot flood the database.
  if not exists(select 1 from public.biometric_attendance_events where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and not exists(select 1 from public.attendance_ignored_scans where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and not exists(select 1 from public.attendance_unregistered_scans where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and (select count(*) from (
      select 1 from public.biometric_attendance_events where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute'
      union all select 1 from public.attendance_ignored_scans where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute'
      union all select 1 from public.attendance_unregistered_scans where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute'
      limit 120) recent)>=120 then
    raise exception 'Device scan rate limit exceeded' using errcode='P0429'; end if;
  update public.attendance_devices set last_seen_at=clock_timestamp() where id=d.id;
  -- A retried source event always gets its first answer.
  if exists(select 1 from public.biometric_attendance_events where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    or exists(select 1 from public.attendance_ignored_scans where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event)) then
    return public.record_biometric_scan(d.project_id,p_biometric_uid,p_occurred_at,d.id::text,p_event);
  end if;
  select * into seen from public.attendance_unregistered_scans where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event);
  if found then return public.log_unregistered_scan(d.project_id,d.id::text,p_event,seen.reason,seen.sensor_slot,seen.worker_id,p_occurred_at); end if;

  select * into w from public.attendance_workers where project_id=d.project_id and biometric_uid=btrim(p_biometric_uid);
  if not found then return public.log_unregistered_scan(d.project_id,d.id::text,p_event,'not_linked',p_biometric_uid,null,p_occurred_at); end if;
  if w.enrolled_device_id is not null and w.enrolled_device_id<>d.id then
    return public.log_unregistered_scan(d.project_id,d.id::text,p_event,'other_device',p_biometric_uid,w.id,p_occurred_at); end if;
  if not w.active then return public.log_unregistered_scan(d.project_id,d.id::text,p_event,'inactive',p_biometric_uid,w.id,p_occurred_at); end if;
  return public.record_biometric_scan(d.project_id,p_biometric_uid,p_occurred_at,d.id::text,p_event);
end; $$;

-- The scanner found no matching finger at all. Device-authenticated; at most 30 reports per device per minute.
create function public.report_unregistered_scan(p_device uuid,p_token_hash text,p_occurred_at timestamptz,p_event text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.attendance_devices; result jsonb;
begin
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or p_token_hash is null or d.token_sha256<>p_token_hash then
    raise exception 'Invalid or revoked device credential' using errcode='28000'; end if;
  if p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' then
    raise exception 'A valid device scan timestamp is required (not in the future)'; end if;
  if p_event is null or char_length(btrim(p_event)) not between 1 and 160 then raise exception 'Direction, device and unique event ID are required'; end if;
  if not exists(select 1 from public.attendance_unregistered_scans where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and (select count(*) from (select 1 from public.attendance_unregistered_scans where device_id=d.id::text and reason='no_match'
      and received_at>clock_timestamp()-interval '1 minute' limit 30) recent)>=30 then
    raise exception 'Device scan rate limit exceeded' using errcode='P0429'; end if;
  result:=public.log_unregistered_scan(d.project_id,d.id::text,p_event,'no_match',null,null,p_occurred_at);
  update public.attendance_devices set last_seen_at=clock_timestamp() where id=d.id;
  return result;
end; $$;
revoke all on function public.report_unregistered_scan(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.report_unregistered_scan(uuid,text,timestamptz,text) to service_role;

-- Live pop-ups: the attendance screen listens for new repeat and unregistered scans (RLS still applies).
alter publication supabase_realtime add table public.attendance_ignored_scans,public.attendance_unregistered_scans;
notify pgrst,'reload schema';

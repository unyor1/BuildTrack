-- Applied filename aligned with hosted migration history.
-- Device credentials are project-scoped random tokens. Only their SHA-256 digest is stored.
create table public.attendance_devices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  label text not null check(char_length(btrim(label)) between 2 and 100),
  token_sha256 text not null check(token_sha256 ~ '^[a-f0-9]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index attendance_devices_project on public.attendance_devices(project_id);
create index attendance_device_rate on public.biometric_attendance_events(device_id,received_at desc);
alter table public.attendance_devices enable row level security;
revoke all on public.attendance_devices from public,anon,authenticated,service_role;
grant select(id,project_id,label,active,created_at,last_seen_at) on public.attendance_devices to authenticated;
grant insert(id,project_id,label,token_sha256) on public.attendance_devices to authenticated;
grant update(active,token_sha256) on public.attendance_devices to authenticated;
grant select,update on public.attendance_devices to service_role;
create policy "biometric managers read devices" on public.attendance_devices for select to authenticated
  using((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id));
create policy "biometric managers register devices" on public.attendance_devices for insert to authenticated
  with check((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id));
create policy "biometric managers rotate or revoke devices" on public.attendance_devices for update to authenticated
  using((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id))
  with check((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id));
-- No generic row-change trigger here: it would copy credential digests into the project audit data.

create function public.ingest_biometric_device_event(p_device uuid,p_token_hash text,p_biometric_uid text,p_direction text,p_occurred_at timestamptz,p_event text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare d public.attendance_devices; event_id uuid;
begin
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or p_token_hash is null or d.token_sha256<>p_token_hash then
    raise exception 'Invalid or revoked device credential' using errcode='28000'; end if;
  -- Locking the device serializes rate checks and concurrent retries. Never trust a supplied project ID.
  if not exists(select 1 from public.biometric_attendance_events where project_id=d.project_id and device_id=d.id::text and external_event_id=btrim(p_event))
    and (select count(*) from (select 1 from public.biometric_attendance_events where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute' limit 120) recent)>=120 then
    raise exception 'Device scan rate limit exceeded' using errcode='P0429'; end if;
  event_id:=public.record_biometric_attendance(d.project_id,p_biometric_uid,p_direction,p_occurred_at,d.id::text,p_event);
  update public.attendance_devices set last_seen_at=clock_timestamp() where id=d.id;
  return event_id;
end; $$;
revoke all on function public.ingest_biometric_device_event(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ingest_biometric_device_event(uuid,text,text,text,timestamptz,text) to service_role;
notify pgrst,'reload schema';

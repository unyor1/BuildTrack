-- Preserve existing profiles/mappings. New workers remain unmapped until the device confirms enrollment.
alter table public.attendance_workers
  alter column biometric_uid drop not null,
  add column first_name text not null default '' check(char_length(first_name)<=70),
  add column last_name text not null default '' check(char_length(last_name)<=70),
  add column middle_initial text not null default '' check(char_length(middle_initial)<=2),
  add column contact_number text not null default '' check(char_length(contact_number)<=32),
  add column email text not null default '' check(char_length(email)<=254 and (email='' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  add column enrolled_device_id uuid references public.attendance_devices(id),
  add column fingerprint_enrolled_at timestamptz;
grant update(first_name,last_name,middle_initial,contact_number,email) on public.attendance_workers to authenticated;
grant update(biometric_uid,enrolled_device_id,fingerprint_enrolled_at) on public.attendance_workers to service_role;

create table public.worker_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  worker_id uuid not null,
  device_id uuid not null references public.attendance_devices(id),
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null default 'queued' check(status in ('queued','capturing','completed','failed','cancelled')),
  slot integer check(slot between 1 and 65535),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
  finished_at timestamptz,
  error_message text not null default '' check(char_length(error_message)<=160),
  foreign key(project_id,worker_id) references public.attendance_workers(project_id,id)
);
create unique index enrollment_one_device on public.worker_enrollment_requests(device_id) where status in ('queued','capturing');
create unique index enrollment_one_worker on public.worker_enrollment_requests(worker_id) where status in ('queued','capturing');
-- Slots are never recycled automatically: a failed/interrupted job may have stored a template on hardware.
create unique index enrollment_reserved_slot on public.worker_enrollment_requests(project_id,slot) where slot is not null;
create index enrollment_worker_history on public.worker_enrollment_requests(worker_id,created_at desc);
create index enrollment_requester on public.worker_enrollment_requests(requested_by);
alter table public.worker_enrollment_requests enable row level security;
revoke all on public.worker_enrollment_requests from public,anon,authenticated,service_role;
grant select on public.worker_enrollment_requests to authenticated;
grant select,update on public.worker_enrollment_requests to service_role;
create policy "Admin reads enrollment requests" on public.worker_enrollment_requests for select to authenticated
  using ((select public.has_permission('biometrics.manage')) and public.can_view_project(project_id));

-- Intentional narrow definer boundary: web clients can read jobs, but cannot assign slots or forge success.
create function public.request_worker_enrollment(p_worker uuid,p_device uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.attendance_workers; d public.attendance_devices; job_id uuid;
begin
  if not public.has_permission('biometrics.manage') then raise exception 'Admin biometric permission and MFA required'; end if;
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or not public.can_view_project(d.project_id) then raise exception 'Choose an active device in this project'; end if;
  perform pg_advisory_xact_lock(hashtextextended('worker-enrollment:'||d.project_id::text,0));
  select * into w from public.attendance_workers where id=p_worker for update;
  if not found or w.project_id<>d.project_id or not w.active then raise exception 'Choose an active worker in the device project'; end if;
  if w.biometric_uid is not null then raise exception 'Worker already has a registered fingerprint'; end if;
  update public.worker_enrollment_requests set status='failed',finished_at=clock_timestamp(),error_message='Enrollment timed out. Retry with the worker present.'
    where project_id=d.project_id and status in ('queued','capturing') and expires_at<clock_timestamp();
  if exists(select 1 from public.worker_enrollment_requests where (device_id=d.id or worker_id=w.id) and status in ('queued','capturing')) then
    raise exception 'An enrollment is already pending for this device or worker'; end if;
  insert into public.worker_enrollment_requests(project_id,worker_id,device_id,requested_by)
    values(w.project_id,w.id,d.id,auth.uid()) returning id into job_id;
  return job_id;
end; $$;
revoke all on function public.request_worker_enrollment(uuid,uuid) from public,anon,service_role;
grant execute on function public.request_worker_enrollment(uuid,uuid) to authenticated;

create function public.cancel_worker_enrollment(p_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare j public.worker_enrollment_requests;
begin
  if not public.has_permission('biometrics.manage') then raise exception 'Admin biometric permission and MFA required'; end if;
  select * into j from public.worker_enrollment_requests where id=p_request;
  if not found or not public.can_view_project(j.project_id) then raise exception 'Enrollment not accessible'; end if;
  perform 1 from public.attendance_devices where id=j.device_id for update;
  perform pg_advisory_xact_lock(hashtextextended('worker-enrollment:'||j.project_id::text,0));
  update public.worker_enrollment_requests set status='cancelled',finished_at=clock_timestamp(),error_message='Cancelled by Admin'
    where id=j.id and status in ('queued','capturing');
end; $$;
revoke all on function public.cancel_worker_enrollment(uuid) from public,anon,service_role;
grant execute on function public.cancel_worker_enrollment(uuid) to authenticated;

-- Service-role only. Every call authenticates the project-scoped device; no browser can confirm a fingerprint.
create function public.process_worker_enrollment(p_device uuid,p_token_hash text,p_action text,p_capacity integer default null,p_request uuid default null,p_error text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.attendance_devices; j public.worker_enrollment_requests; w public.attendance_workers; chosen integer;
begin
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or p_token_hash is null or d.token_sha256<>p_token_hash then
    raise exception 'Invalid or revoked device credential' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('worker-enrollment:'||d.project_id::text,0));
  if p_action is null or p_action not in ('poll','completed','failed') then raise exception 'Invalid enrollment action'; end if;
  update public.attendance_devices set last_seen_at=clock_timestamp() where id=d.id;
  if p_action='poll' then
    if p_capacity is null or p_capacity not between 1 and 65535 then raise exception 'Valid sensor capacity required'; end if;
    update public.worker_enrollment_requests set status='failed',finished_at=clock_timestamp(),error_message='Enrollment timed out. Retry with the worker present.'
      where device_id=d.id and status in ('queued','capturing') and expires_at<clock_timestamp();
    select * into j from public.worker_enrollment_requests where device_id=d.id and status in ('queued','capturing') order by created_at limit 1 for update;
    if not found then return jsonb_build_object('job',null); end if;
  else
    select * into j from public.worker_enrollment_requests where id=p_request and device_id=d.id for update;
    if not found then raise exception 'Enrollment does not belong to this device'; end if;
    if j.status='completed' and p_action='completed' then return jsonb_build_object('acknowledged',true); end if;
    if j.status='failed' and p_action='failed' then return jsonb_build_object('acknowledged',true); end if;
    if j.status<>'capturing' then return jsonb_build_object('acknowledged',true,'discarded',true); end if;
  end if;
  select * into w from public.attendance_workers where id=j.worker_id for update;
  if not w.active or not exists(select 1 from public.profiles p where p.id=j.requested_by and p.status='active'
    and (p.role='super_admin' or (p.role='admin' and exists(select 1 from public.admin_permissions a where a.user_id=p.id and a.permission='biometrics.manage')))) then
    update public.worker_enrollment_requests set status='failed',finished_at=clock_timestamp(),error_message='Worker inactive or Admin authorization withdrawn' where id=j.id;
    return case when p_action='poll' then jsonb_build_object('job',null) else jsonb_build_object('acknowledged',true,'discarded',true) end;
  end if;
  if p_action='poll' then
    if j.status='queued' then
      select n into chosen from generate_series(1,p_capacity) n
        where not exists(select 1 from public.worker_enrollment_requests r where r.project_id=d.project_id and r.slot=n)
        and not exists(select 1 from public.attendance_workers x where x.project_id=d.project_id
          and case when x.biometric_uid ~ '^[0-9]{1,5}$' then x.biometric_uid::integer=n else false end)
        order by n limit 1;
      if chosen is null then
        update public.worker_enrollment_requests set status='failed',finished_at=clock_timestamp(),error_message='No unused fingerprint slots. Admin must check sensor capacity.' where id=j.id;
        return jsonb_build_object('job',null);
      end if;
      update public.worker_enrollment_requests set slot=chosen,status='capturing',expires_at=clock_timestamp()+interval '2 minutes' where id=j.id returning * into j;
    end if;
    return jsonb_build_object('job',jsonb_build_object('id',j.id,'slot',j.slot,'worker_name',w.full_name,'expires_at',j.expires_at));
  end if;
  if j.expires_at<clock_timestamp() then
    update public.worker_enrollment_requests set status='failed',finished_at=clock_timestamp(),error_message='Enrollment confirmation expired. Retry.' where id=j.id;
    return jsonb_build_object('acknowledged',true,'discarded',true);
  end if;
  if p_action='failed' then
    update public.worker_enrollment_requests set status='failed',finished_at=clock_timestamp(),error_message=left(coalesce(nullif(btrim(p_error),''),'Sensor enrollment failed. Retry.'),160) where id=j.id;
  else
    if w.biometric_uid is not null then raise exception 'Worker is already linked'; end if;
    update public.attendance_workers set biometric_uid=j.slot::text,enrolled_device_id=d.id,fingerprint_enrolled_at=clock_timestamp() where id=w.id;
    update public.worker_enrollment_requests set status='completed',finished_at=clock_timestamp(),error_message='' where id=j.id;
  end if;
  return jsonb_build_object('acknowledged',true);
end; $$;
revoke all on function public.process_worker_enrollment(uuid,text,text,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.process_worker_enrollment(uuid,text,text,integer,uuid,text) to service_role;
-- Invoker processing needs only authorization lookups, not profile/permission writes.
grant select on public.profiles,public.admin_permissions to service_role;

-- Match a newly enrolled worker only on the physical device that holds their template.
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
    and (select count(*) from (select 1 from public.biometric_attendance_events where device_id=d.id::text and received_at>clock_timestamp()-interval '1 minute' limit 120) recent)>=120 then
    raise exception 'Device scan rate limit exceeded' using errcode='P0429'; end if;
  event_id:=public.record_biometric_attendance(d.project_id,p_biometric_uid,p_direction,p_occurred_at,d.id::text,p_event);
  update public.attendance_devices set last_seen_at=clock_timestamp() where id=d.id;
  return event_id;
end; $$;
notify pgrst,'reload schema';

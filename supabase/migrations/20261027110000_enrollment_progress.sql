-- Live fingerprint registration steps. The ESP32 reports which capture step it is on, so the Admin screen can guide
-- the worker (first scan, lift, second scan, saving, confirmation scan). Only an authenticated device can report a step;
-- a step never links a worker. Linking still happens only on 'completed', after the device's confirmation scan.
alter table public.worker_enrollment_requests
  add column stage text not null default '' check (stage in ('','place_first','lift','place_second','storing','confirm')),
  add column stage_at timestamptz;

-- Same contract plus action 'progress' (p_stage). The extra parameter has a default, so the deployed receiver and
-- existing six-argument calls keep working.
drop function public.process_worker_enrollment(uuid,text,text,integer,uuid,text);
create function public.process_worker_enrollment(p_device uuid,p_token_hash text,p_action text,p_capacity integer default null,p_request uuid default null,p_error text default '',p_stage text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.attendance_devices; j public.worker_enrollment_requests; w public.attendance_workers; chosen integer;
begin
  select * into d from public.attendance_devices where id=p_device for update;
  if not found or not d.active or p_token_hash is null or d.token_sha256<>p_token_hash then
    raise exception 'Invalid or revoked device credential' using errcode='28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('worker-enrollment:'||d.project_id::text,0));
  if p_action is null or p_action not in ('poll','progress','completed','failed') then raise exception 'Invalid enrollment action'; end if;
  if p_action='progress' and (p_stage is null or p_stage not in ('place_first','lift','place_second','storing','confirm')) then
    raise exception 'Invalid enrollment stage'; end if;
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
    -- A cancelled / expired / finished job tells the device to stop (and to remove a template it just stored).
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
      update public.worker_enrollment_requests set slot=chosen,status='capturing',stage='',stage_at=clock_timestamp(),expires_at=clock_timestamp()+interval '2 minutes' where id=j.id returning * into j;
    end if;
    return jsonb_build_object('job',jsonb_build_object('id',j.id,'slot',j.slot,'worker_name',w.full_name,'expires_at',j.expires_at));
  end if;
  if j.expires_at<clock_timestamp() then
    update public.worker_enrollment_requests set status='failed',finished_at=clock_timestamp(),error_message='Enrollment confirmation expired. Retry.' where id=j.id;
    return jsonb_build_object('acknowledged',true,'discarded',true);
  end if;
  if p_action='progress' then
    -- A device that is actively capturing keeps the job alive for 90 s per step, never beyond 10 minutes after the request.
    update public.worker_enrollment_requests set stage=p_stage,stage_at=clock_timestamp(),
      expires_at=greatest(expires_at,least(clock_timestamp()+interval '90 seconds',created_at+interval '10 minutes'))
      where id=j.id;
    return jsonb_build_object('acknowledged',true);
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
revoke all on function public.process_worker_enrollment(uuid,text,text,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.process_worker_enrollment(uuid,text,text,integer,uuid,text,text) to service_role;
notify pgrst,'reload schema';

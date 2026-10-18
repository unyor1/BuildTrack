-- Validation only: wrap in BEGIN / ROLLBACK. The block also ends with RAISE 'SMOKE_OK', so the statement aborts and nothing commits
-- even without the wrapper. Any other error message is a failure. Synthetic pin, criteria and evidence on a real project; never real work.
do $$
declare pid uuid; engineer uuid; foreman uuid; sheet uuid; pin uuid; floor uuid; wall uuid; template uuid;
  first_ir uuid; pkg_ir uuid; qi record; draft uuid; ncr uuid; wall_ir uuid; wall_ncr uuid; retry uuid;
begin
  select e.project_id,e.user_id,f.user_id into pid,engineer,foreman
    from public.project_members e join public.project_members f on f.project_id=e.project_id
    join public.profiles pe on pe.id=e.user_id join public.profiles pf on pf.id=f.user_id
    where e.member_role='engineer' and f.member_role='foreman' and pe.role='engineer' and pf.role='foreman'
      and pe.status='active' and pf.status='active' order by e.project_id limit 1;
  if pid is null then raise exception 'Smoke needs active project Engineer and Foreman'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  insert into public.blueprints(project_id,title) values(pid,'Rollback-only correction package smoke') returning id into sheet;
  insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values(pid,sheet,10,10,'Rollback-only package smoke',foreman) returning id into pin;
  insert into public.pin_checklist_items(project_id,pin_id,text) values(pid,pin,'Synthetic FLOOR') returning id into floor;
  insert into public.pin_checklist_items(project_id,pin_id,text) values(pid,pin,'Synthetic WALL') returning id into wall;
  template:=public.save_qa_template(null,pid,'Rollback-only package criteria','general',null,'{}',
    '[{"text":"Synthetic level observation","severity":"major"}]'::jsonb);
  perform public.approve_pin_qa_checklist(pin,template);

  -- FLOOR: first request fails and raises a linked NCR.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at)
    select pid,pin,floor,pid||'/'||pin||'/rollback-floor.jpg',site_lat,site_lng,now() from public.projects where id=pid;
  update public.pin_checklist_items set done=true where id=floor;
  first_ir:=public.submit_checklist_qa(pin,array[floor]);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(first_ir);
  for qi in select id from public.qa_inspection_items where inspection_id=first_ir loop
    perform public.save_inspection_item(qi.id,'fail',null,'Synthetic observation out of tolerance'); end loop;
  perform public.complete_inspection(first_ir,'Rollback-only synthetic result');
  select id into ncr from public.qa_defects where inspection_id=first_ir;
  if ncr is null or (select review_status from public.pin_checklist_items where id=floor)<>'returned' then raise exception 'Smoke: failure did not return FLOOR with an NCR'; end if;

  -- One correction package answers the QA return and the NCR together.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  draft:=public.begin_checklist_resubmission(floor);
  perform public.save_checklist_attempt(draft,'Synthetic correction: re-levelled and checked');
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,qa_attempt_id,path,lat,lng,taken_at)
    select pid,pin,floor,draft,pid||'/'||pin||'/rollback-floor-fix.jpg',site_lat,site_lng,now() from public.projects where id=pid;
  pkg_ir:=public.submit_correction_package(array[floor],array[ncr],'Synthetic root cause',null);
  if (select reinspection_of from public.qa_inspections where id=pkg_ir)<>first_ir then raise exception 'Smoke: re-inspection not linked'; end if;
  if not exists(select 1 from public.qa_defects where id=ncr and status='for_verification' and correction_attempt_id=draft
    and corrective_action='Synthetic correction: re-levelled and checked') then raise exception 'Smoke: NCR not answered by the package'; end if;

  -- Engineer: inspect, then acceptance waits for the linked NCR, then close it, then accept -> Completed (WALL has no request yet,
  -- so the work must NOT complete; it completes after WALL is accepted too).
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(pkg_ir);
  for qi in select id from public.qa_inspection_items where inspection_id=pkg_ir loop perform public.save_inspection_item(qi.id,'pass',null,null); end loop;
  perform public.complete_inspection(pkg_ir,'Rollback-only synthetic result');
  begin
    perform public.review_checklist_item(floor,true);
    raise exception 'Smoke: accepted with an open linked NCR';
  exception when others then if sqlerrm not like '%linked to this work item%' then raise; end if; end;
  perform public.verify_defect(ncr,true,'Rollback-only independently checked');
  perform public.review_checklist_item(floor,true);
  if (select review_status from public.pin_checklist_items where id=floor)<>'verified' then raise exception 'Smoke: FLOOR not accepted'; end if;

  -- WALL: fails, package, passes, NCR correction sent back -> WALL returned; second package; close; accept -> Completed.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at)
    select pid,pin,wall,pid||'/'||pin||'/rollback-wall.jpg',site_lat,site_lng,now() from public.projects where id=pid;
  update public.pin_checklist_items set done=true where id=wall;
  wall_ir:=public.submit_checklist_qa(pin,array[wall]);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(wall_ir);
  for qi in select id from public.qa_inspection_items where inspection_id=wall_ir loop
    perform public.save_inspection_item(qi.id,'fail',null,'Synthetic finish out of tolerance'); end loop;
  perform public.complete_inspection(wall_ir,'Rollback-only synthetic result');
  select id into wall_ncr from public.qa_defects where inspection_id=wall_ir;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  draft:=public.begin_checklist_resubmission(wall);
  perform public.save_checklist_attempt(draft,'Synthetic correction: repainted two coats');
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,qa_attempt_id,path,lat,lng,taken_at)
    select pid,pin,wall,draft,pid||'/'||pin||'/rollback-wall-fix.jpg',site_lat,site_lng,now() from public.projects where id=pid;
  retry:=public.submit_correction_package(array[wall],array[wall_ncr]);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(retry);
  for qi in select id from public.qa_inspection_items where inspection_id=retry loop perform public.save_inspection_item(qi.id,'pass',null,null); end loop;
  perform public.complete_inspection(retry,'Rollback-only synthetic result');
  perform public.verify_defect(wall_ncr,false,'Rollback-only: still patchy');
  if (select review_status from public.pin_checklist_items where id=wall)<>'returned' then raise exception 'Smoke: send-back did not return WALL'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  draft:=public.begin_checklist_resubmission(wall);
  perform public.save_checklist_attempt(draft,'Synthetic correction: third coat and sanding');
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,qa_attempt_id,path,lat,lng,taken_at)
    select pid,pin,wall,draft,pid||'/'||pin||'/rollback-wall-fix-2.jpg',site_lat,site_lng,now() from public.projects where id=pid;
  retry:=public.submit_correction_package(array[wall],array[wall_ncr]);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(retry);
  for qi in select id from public.qa_inspection_items where inspection_id=retry loop perform public.save_inspection_item(qi.id,'pass',null,null); end loop;
  perform public.complete_inspection(retry,'Rollback-only synthetic result');
  perform public.verify_defect(wall_ncr,true,'Rollback-only independently checked');
  if (select status from public.pins where id=pin)='verified' then raise exception 'Smoke: completed before WALL was accepted'; end if;
  perform public.review_checklist_item(wall,true);
  if (select status from public.pins where id=pin)<>'verified' then raise exception 'Smoke: work not Completed'; end if;
  perform set_config('request.jwt.claims','{}',true);
  raise exception 'SMOKE_OK: package, linked NCR gate, send-back routing and completion verified (aborting so nothing commits)';
end; $$;

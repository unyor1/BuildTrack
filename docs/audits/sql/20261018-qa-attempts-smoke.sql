-- Validation only: caller MUST wrap this file in BEGIN / ROLLBACK. Never commit synthetic evidence.
do $$
declare pid uuid; engineer uuid; foreman uuid; sheet uuid; pin uuid; step uuid; template uuid;
  first_ir uuid; next_ir uuid; parent_ir uuid; qi uuid; draft uuid; original jsonb; correction uuid; ncr uuid; iteration integer;
begin
  select e.project_id,e.user_id,f.user_id into pid,engineer,foreman
    from public.project_members e join public.project_members f on f.project_id=e.project_id
    join public.profiles pe on pe.id=e.user_id join public.profiles pf on pf.id=f.user_id
    where e.member_role='engineer' and f.member_role='foreman' and pe.role='engineer' and pf.role='foreman'
      and pe.status='active' and pf.status='active' order by e.project_id limit 1;
  if pid is null then raise exception 'Smoke needs active project Engineer and Foreman'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  insert into public.blueprints(project_id,title) values(pid,'Rollback-only QA attempts smoke') returning id into sheet;
  insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values(pid,sheet,10,10,'Rollback-only QA attempts smoke',foreman) returning id into pin;
  insert into public.pin_checklist_items(project_id,pin_id,text) values(pid,pin,'Synthetic test step') returning id into step;
  template:=public.save_qa_template(null,pid,'Rollback-only QA attempt criteria','general',null,'{}',
    '[{"text":"Synthetic observation only","severity":"minor"}]'::jsonb);
  perform public.approve_pin_qa_checklist(pin,template);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at)
    select pid,pin,step,pid||'/'||pin||'/rollback-original.jpg',site_lat,site_lng,now() from public.projects where id=pid;
  update public.pin_checklist_items set done=true,remark='Original synthetic remarks' where id=step;
  first_ir:=public.submit_checklist_qa(pin,array[step]);
  select to_jsonb(s) into original from public.pin_qa_submissions s where inspection_id=first_ir;
  parent_ir:=first_ir;
  for iteration in 1..3 loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
    perform public.start_inspection(parent_ir);
    select id into qi from public.qa_inspection_items where inspection_id=parent_ir;
    perform public.save_inspection_item(qi,case when iteration=3 then 'pass' else 'fail' end,null,
      case when iteration=3 then null else 'Synthetic correction required' end);
    perform public.complete_inspection(parent_ir,'Rollback-only synthetic result');
    if not public.pin_qa_template_approved(pin) then raise exception 'Smoke: inspected criteria not recognized'; end if;
    if iteration=3 then exit; end if;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
    draft:=public.begin_checklist_resubmission(step);
    if public.begin_checklist_resubmission(step)<>draft then raise exception 'Smoke: draft not idempotent'; end if;
    perform public.save_checklist_attempt(draft,'Synthetic correction remarks '||iteration);
    begin
      perform public.submit_checklist_qa(pin,array[step]);
      raise exception 'Smoke: old photos counted as fresh correction evidence';
    exception when others then if sqlerrm not like '%new eligible photos%' then raise; end if; end;
    insert into public.pin_photos(project_id,pin_id,checklist_item_id,qa_attempt_id,path,lat,lng,taken_at)
      select pid,pin,step,draft,pid||'/'||pin||'/rollback-correction-'||iteration||'.jpg',site_lat,site_lng,now()
        from public.projects where id=pid returning id into correction;
    next_ir:=public.submit_checklist_qa(pin,array[step]);
    if (select reinspection_of from public.qa_inspections where id=next_ir)<>parent_ir then raise exception 'Smoke: parent lost'; end if;
    if not exists(select 1 from public.pin_qa_submissions where inspection_id=next_ir
      and jsonb_array_length(photos_snapshot)=1 and photos_snapshot->0->>'id'=correction::text
      and checklist_snapshot->0->>'remark'='Synthetic correction remarks '||iteration) then raise exception 'Smoke: correction snapshot mixed'; end if;
    begin
      perform public.submit_checklist_qa(pin,array[step]);
      raise exception 'Smoke: duplicate request accepted';
    exception when others then if sqlerrm not like '%already pending%' then raise; end if; end;
    parent_ir:=next_ir;
  end loop;
  for ncr in select id from public.qa_defects where pin_id=pin loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
    perform public.update_defect(ncr,'in_progress');
    perform public.update_defect(ncr,'for_verification','Rollback-only synthetic corrective action');
    perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
    perform public.verify_defect(ncr,true,'Rollback-only independently checked');
  end loop;
  perform public.review_checklist_item(step,true);
  if (select status from public.pins where id=pin)<>'verified' then raise exception 'Smoke: work not Completed'; end if;
  if (select to_jsonb(s) from public.pin_qa_submissions s where inspection_id=first_ir)<>original then raise exception 'Smoke: original request changed'; end if;
  if (select count(*) from public.qa_work_attempts where pin_id=pin)<>2 then raise exception 'Smoke: correction holder count wrong'; end if;
  if (select count(*) from public.qa_inspection_events where inspection_id in (select id from public.qa_inspections where pin_id=pin) and kind='requested')<>3 then raise exception 'Smoke: request timeline missing'; end if;
  perform set_config('request.jwt.claims','{}',true);
end; $$;

-- Synthetic validation only. Caller must wrap this file in BEGIN / ROLLBACK.
do $$
declare pid uuid; engineer uuid; foreman uuid; sheet uuid; pin_a uuid; pin_b uuid; template uuid;
  current_ir uuid; other_ir uuid; next_ir uuid; step uuid; qi uuid;
begin
  select e.project_id,e.user_id,f.user_id into pid,engineer,foreman
    from public.project_members e join public.project_members f on f.project_id=e.project_id
    join public.profiles pe on pe.id=e.user_id join public.profiles pf on pf.id=f.user_id
    where e.member_role='engineer' and f.member_role='foreman' and pe.status='active' and pf.status='active'
      and pe.role='engineer' and pf.role='foreman' order by e.project_id limit 1;
  if pid is null then raise exception 'Smoke requires active project Engineer and Foreman'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  insert into public.blueprints(project_id,title) values(pid,'Rollback-only pending-pin smoke') returning id into sheet;
  insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values(pid,sheet,10,10,'Rollback-only pending work A',foreman) returning id into pin_a;
  insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values(pid,sheet,20,20,'Rollback-only independent work B',foreman) returning id into pin_b;
  insert into public.pin_checklist_items(project_id,pin_id,text) values(pid,pin_a,'Synthetic pending test step') returning id into step;
  template:=public.save_qa_template(null,pid,'Rollback-only pending criteria','general',null,'{}','[{"text":"Synthetic observation only","severity":"minor"}]'::jsonb);
  perform public.approve_pin_qa_checklist(pin_a,template);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at)
    select pid,pin_a,step,pid||'/'||pin_a||'/rollback-pending.jpg',site_lat,site_lng,now() from public.projects where id=pid;
  update public.pin_checklist_items set done=true where id=step;
  current_ir:=public.request_inspection(pid,template,'Rollback-only stage A',pin_a);
  if public.pin_qa_submission_problem(pin_a) not like '%already pending%' then raise exception 'Smoke: missing exact pending blocker'; end if;
  begin perform public.request_inspection(pid,template,'Duplicate stage',pin_a); raise exception 'Smoke: duplicate stage succeeded';
    exception when others then if sqlerrm not like '%already pending%' then raise; end if; end;
  begin perform public.submit_pin_qa(pin_a); raise exception 'Smoke: legacy duplicate succeeded';
    exception when others then if sqlerrm not like '%already pending%' then raise; end if; end;
  begin perform public.submit_checklist_qa(pin_a,array[step]); raise exception 'Smoke: item duplicate succeeded';
    exception when others then if sqlerrm not like '%already pending%' then raise; end if; end;
  if public.pin_qa_submission_problem(pin_b) is not null then raise exception 'Smoke: unrelated work blocked'; end if;
  other_ir:=public.request_inspection(pid,template,'Rollback-only independent stage B',pin_b);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(current_ir);
  if public.pin_qa_submission_problem(pin_a) not like '%already pending%' then raise exception 'Smoke: in-progress blocker missing'; end if;
  perform public.cancel_inspection(current_ir,'Rollback-only test cancellation');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  next_ir:=public.submit_checklist_qa(pin_a,array[step]);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(next_ir);
  select id into qi from public.qa_inspection_items where inspection_id=next_ir;
  perform public.save_inspection_item(qi,'pass');
  perform public.complete_inspection(next_ir,'Rollback-only passed observation');
  if public.pin_qa_submission_problem(pin_a) not like '%pending Engineer item verification%' then raise exception 'Smoke: acceptance blocker missing'; end if;
  perform public.review_checklist_item(step,true);
  if (select status from public.pins where id=pin_a)<>'verified' then raise exception 'Smoke: work did not complete'; end if;
  if (select count(*) from public.qa_inspections where pin_id=pin_b and status='requested')<>1 then raise exception 'Smoke: independent request lost'; end if;
  perform set_config('request.jwt.claims','{}',true);
end; $$;

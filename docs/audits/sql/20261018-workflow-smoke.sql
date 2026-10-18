-- Run only inside an explicit transaction that ends in ROLLBACK.
-- Synthetic observations are for validation only; never commit these records.
do $$
declare pid uuid; engineer uuid; foreman uuid; sheet uuid; pin uuid; step uuid; template uuid; ir uuid; item uuid; report uuid; day date;
begin
  select e.project_id,e.user_id,f.user_id into pid,engineer,foreman
    from public.project_members e join public.project_members f on f.project_id=e.project_id
    join public.profiles pe on pe.id=e.user_id join public.profiles pf on pf.id=f.user_id
    where e.member_role='engineer' and f.member_role='foreman' and pe.role='engineer' and pf.role='foreman'
      and pe.status='active' and pf.status='active' order by e.project_id limit 1;
  if pid is null then raise exception 'Smoke check needs an existing active Engineer and Foreman on one project'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  insert into public.blueprints(project_id,title) values(pid,'Rollback-only workflow smoke') returning id into sheet;
  insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values(pid,sheet,10,10,'Rollback-only test work',foreman) returning id into pin;
  insert into public.pin_checklist_items(project_id,pin_id,text) values(pid,pin,'Synthetic test work step') returning id into step;
  template:=public.save_qa_template(null,pid,'Rollback-only synthetic criteria','general',null,'{}',
    '[{"text":"Synthetic observation; not a construction requirement","severity":"minor"}]'::jsonb);
  perform public.approve_pin_qa_checklist(pin,template);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  insert into public.pin_photos(project_id,pin_id,checklist_item_id,path) values(pid,pin,step,pid||'/'||pin||'/rollback-only.jpg');
  update public.pin_checklist_items set done=true where id=step;
  ir:=public.submit_checklist_qa(pin,array[step]);
  begin
    perform public.submit_checklist_qa(pin,array[step]);
    raise exception 'Smoke: duplicate submission succeeded';
  exception when others then
    if sqlerrm not like '%already pending%' then raise; end if;
  end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.start_inspection(ir);
  select id into item from public.qa_inspection_items where inspection_id=ir;
  perform public.save_inspection_item(item,'pass');
  perform public.complete_inspection(ir,'Rollback-only synthetic QA result');
  if (select status from public.pins where id=pin)<>'for_review' then raise exception 'Smoke: item verification must still be pending'; end if;
  perform public.review_checklist_item(step,true);
  if (select status from public.pins where id=pin)<>'verified' then raise exception 'Smoke: work did not complete'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  select d::date into day from generate_series(0,13) n cross join lateral
    (select (now() at time zone 'Asia/Manila')::date-n as d) dates
    where not exists(select 1 from public.daily_reports where project_id=pid and author_id=foreman and report_date=d) limit 1;
  if day is null then raise exception 'Smoke: no unused daily-report date available'; end if;
  insert into public.daily_reports(project_id,report_date,work_done,status) values(pid,day,'Rollback-only daily report','submitted') returning id into report;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.review_daily_report(report,false,'Rollback-only correction request');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',foreman,'role','authenticated','aal','aal2')::text,true);
  update public.daily_reports set work_done='Rollback-only corrected daily report',status='submitted' where id=report;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',engineer,'role','authenticated','aal','aal2')::text,true);
  perform public.review_daily_report(report,true,'Rollback-only report review');
  if (select count(*) from public.daily_report_revisions where report_id=report)<>4 then raise exception 'Smoke: revision history incomplete'; end if;
  perform set_config('request.jwt.claims','{}',true);
end; $$;

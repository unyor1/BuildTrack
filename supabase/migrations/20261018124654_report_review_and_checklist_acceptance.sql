-- Report review, immutable revisions, per-work-item QA, inspection SLAs and evidence eligibility.
-- Existing verified pins keep their historical status. The UI calls that aggregate state Completed.
alter table public.pin_checklist_items
  add column review_status text not null default 'not_submitted' check (review_status in ('not_submitted','for_review','verified','returned')),
  add column review_inspection_id uuid references public.qa_inspections(id),
  add column verified_by uuid references auth.users(id) on delete set null,
  add column verified_at timestamptz;
alter table public.pin_qa_submissions add column item_ids uuid[];
alter table public.pins add column qa_approved_by uuid references auth.users(id) on delete set null, add column qa_approved_at timestamptz;
create index checklist_waiting_review on public.pin_checklist_items(pin_id) where review_status='for_review';
alter table public.qa_inspections
  add column target_at timestamptz not null default (now() + interval '1 day'),
  add column escalation_owner uuid references auth.users(id) on delete set null;
create index qa_inspection_deadlines on public.qa_inspections(project_id,target_at) where status in ('requested','in_progress');

-- All request paths serialize on the same pin, including stage and reinspection requests.
create function public.guard_one_open_inspection() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.pin_id is not null and new.status in ('requested','in_progress') then
    perform 1 from public.pins where id=new.pin_id for update;
    if exists(select 1 from public.qa_inspections where pin_id=new.pin_id and id<>new.id and status in ('requested','in_progress')) then
      raise exception 'An inspection is already pending or in progress for this work. Finish it before submitting another QA request';
    end if;
    if exists(select 1 from public.pin_checklist_items where pin_id=new.pin_id and review_status='for_review' and review_inspection_id is distinct from new.id) then
      raise exception 'Checklist QA is already pending Engineer item verification. Finish it before submitting another request'; end if;
  elsif new.pin_id is null and new.status in ('requested','in_progress') then
    perform 1 from public.projects where id=new.project_id for update;
    if exists(select 1 from public.qa_inspections where project_id=new.project_id and pin_id is null and id<>new.id
      and template_id=new.template_id and lower(btrim(title))=lower(btrim(new.title)) and coalesce(location,'')=coalesce(new.location,'')
      and status in ('requested','in_progress')) then raise exception 'An inspection is already pending or in progress for this location and checklist'; end if;
  end if;
  if tg_op='INSERT' and new.escalation_owner is null then
    select user_id into new.escalation_owner from public.project_members
      where project_id=new.project_id and member_role='engineer' order by user_id limit 1;
  end if;
  return new;
end; $$;
create trigger a_one_open_inspection before insert or update of status,pin_id on public.qa_inspections
for each row execute function public.guard_one_open_inspection();

-- Existing selections are retained; future template changes require the project Engineer.
create or replace function public.guard_work_qa_config() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.qa_approved_by,new.qa_approved_at) is distinct from (old.qa_approved_by,old.qa_approved_at) then
    if not public.can_edit_blueprints(new.project_id) then raise exception 'Only the project Engineer approves the QA checklist'; end if;
    new.qa_approved_by:=auth.uid(); new.qa_approved_at:=now();
  end if;
  if (tg_op='INSERT' and new.qa_template_id is not null) or (tg_op='UPDATE' and new.qa_template_id is distinct from old.qa_template_id) then
    if not public.can_edit_blueprints(new.project_id) then raise exception 'Only the project Engineer approves the QA checklist'; end if;
    new.qa_approved_by:=case when new.qa_template_id is not null then auth.uid() end;
    new.qa_approved_at:=case when new.qa_template_id is not null then now() end;
    if new.qa_template_id is not null and not exists(select 1 from public.qa_templates t where t.id=new.qa_template_id and not t.archived
      and (t.project_id is null or t.project_id=new.project_id) and exists(select 1 from public.qa_template_items where template_id=t.id)) then
      raise exception 'Select an available QA checklist with inspection items for this project';
    end if;
    if tg_op='UPDATE' and (old.status='verified' or exists(select 1 from public.qa_inspections where pin_id=old.id and status in ('requested','in_progress'))
       or exists(select 1 from public.pin_checklist_items where pin_id=old.id and review_status='verified')) then
      raise exception 'Reopen reviewed work before changing its approved QA checklist';
    end if;
  end if;
  if tg_op='UPDATE' and exists(select 1 from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
      where s.pin_id=old.id and i.status in ('requested','in_progress')) then
    if new.status<>'for_review' or (to_jsonb(new)-array['status','updated_at','verified_by','verified_at','due_date','severity','locked'])
      is distinct from (to_jsonb(old)-array['status','updated_at','verified_by','verified_at','due_date','severity','locked']) then
      raise exception 'Awaiting Engineer inspection: complete or cancel the inspection before changing this work';
    end if;
  end if;
  if tg_op='UPDATE' and old.status='for_review' and new.status not in ('for_review','verified') and exists(
    select 1 from public.pin_checklist_items where pin_id=old.id and review_status='for_review') then
    raise exception 'Verify or return each submitted checklist item before reopening this work'; end if;
  if tg_op='UPDATE' and old.status='verified' and new.status='verified' and
      (to_jsonb(new)-array['updated_at','due_date','severity','locked']) is distinct from (to_jsonb(old)-array['updated_at','due_date','severity','locked']) then
    raise exception 'The Engineer must reopen completed work before changing it';
  end if;
  return new;
end; $$;
create function public.approve_pin_qa_checklist(p_pin uuid,p_template uuid) returns void
language plpgsql security definer set search_path='' as $$
declare pn public.pins;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_edit_blueprints(pn.project_id) then raise exception 'Only the project Engineer approves the QA checklist'; end if;
  if p_template is null then raise exception 'Select an available QA checklist with inspection items'; end if;
  update public.pins set qa_template_id=p_template,qa_approved_by=auth.uid(),qa_approved_at=now() where id=p_pin;
end; $$;
create or replace function public.select_pin_qa_checklist(p_pin uuid,p_template uuid) returns void
language plpgsql security definer set search_path='' as $$
declare pn public.pins;
begin
  select * into pn from public.pins where id=p_pin for update;
  if not public.can_work_on_pin(p_pin) then raise exception 'Only the assigned active Foreman selects the QA checklist'; end if;
  if pn.status in ('for_review','verified') or exists(select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress')) then
    raise exception 'Finish the current review before changing the QA checklist'; end if;
  if p_template is null or not exists(select 1 from public.qa_templates t where t.id=p_template and not t.archived
      and (t.project_id is null or t.project_id=pn.project_id) and exists(select 1 from public.qa_template_items where template_id=t.id)) then
    raise exception 'Select an available QA checklist with inspection items for this project'; end if;
  if p_template is distinct from pn.qa_template_id then raise exception 'Ask the project Engineer to approve this QA checklist first'; end if;
end; $$;

-- Server flags are authoritative. Rejected photos remain in history but cannot count as evidence.
create function public.photo_eligible(p_flag text) returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_flag not in ('away_from_site','clock_ahead','old_photo'),true);
$$;
create function public.evidence_image_allowed(p_bucket text,p_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and role='engineer') then return true; end if;
  if p_bucket='pin-photos' then return not exists(select 1 from public.pin_photos where path=p_path and not public.photo_eligible(stamp_flag)); end if;
  if p_bucket='qa-evidence' then return not exists(select 1 from public.qa_photos where path=p_path and not public.photo_eligible(stamp_flag)); end if;
  if p_bucket='daily-photos' then return not exists(select 1 from public.daily_report_photos where path=p_path and not public.photo_eligible(stamp_flag)); end if;
  return true;
end; $$;
create policy "engineers cannot open rejected evidence" on storage.objects as restrictive for select to authenticated
using (public.evidence_image_allowed(bucket_id,name));

alter function public.submit_pin_qa(uuid,text) rename to legacy_submit_pin_qa;
revoke all on function public.legacy_submit_pin_qa(uuid,text) from public,anon,authenticated;
create function public.submit_pin_qa(p_pin uuid,p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.pins where id=p_pin for update;
  if not public.can_work_on_pin(p_pin) then raise exception 'Only the active Foreman assigned to this work may submit it'; end if;
  if not exists(select 1 from public.pins where id=p_pin and qa_approved_by is not null) then
    raise exception 'Select an available QA checklist with inspection items before submitting; project Engineer approval is required'; end if;
  if exists(select 1 from public.pin_checklist_items c where c.pin_id=p_pin and c.done and not exists(
    select 1 from public.pin_photos ph where ph.checklist_item_id=c.id and public.photo_eligible(ph.stamp_flag))) then
    raise exception 'Every completed checklist item requires photo evidence that passes site and time checks'; end if;
  return public.legacy_submit_pin_qa(p_pin,p_note);
end; $$;
revoke all on function public.submit_pin_qa(uuid,text) from public,anon;
grant execute on function public.submit_pin_qa(uuid,text) to authenticated;

-- Column-level grants prevent clients from setting review fields. Only these checked RPCs update them.
revoke update on public.pin_checklist_items from authenticated;
grant update(text,position,done,remark) on public.pin_checklist_items to authenticated;
revoke insert on public.pin_checklist_items from authenticated;
grant insert(pin_id,project_id,text,position,done) on public.pin_checklist_items to authenticated;
create or replace function public.guard_work_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare pid uuid; pn public.pins; review_only boolean := false;
begin
  pid:=case when tg_op='DELETE' then old.pin_id else new.pin_id end;
  select * into pn from public.pins where id=pid for update;
  if tg_op='UPDATE' and tg_table_name='pin_checklist_items' then
    review_only := (to_jsonb(new)-array['review_status','review_inspection_id','verified_by','verified_at']) =
                   (to_jsonb(old)-array['review_status','review_inspection_id','verified_by','verified_at']);
    if not review_only and old.review_status='verified' then raise exception 'Reopen the checklist item before changing verified evidence'; end if;
    if not review_only and (new.done is distinct from old.done or new.text is distinct from old.text or new.remark is distinct from old.remark) then
      new.review_status:='not_submitted'; new.review_inspection_id:=null; new.verified_at:=null; new.verified_by:=null;
    end if;
  end if;
  if auth.uid() is not null and pn.status in ('for_review','verified') and not review_only then raise exception 'Awaiting Engineer inspection or verified: checklist and evidence are locked'; end if;
  if tg_op='UPDATE' and new.pin_id is distinct from old.pin_id then raise exception 'Evidence cannot move between work items'; end if;
  if tg_op='DELETE' and tg_table_name='pin_checklist_items' and exists(select 1 from public.pin_qa_submissions s,
      jsonb_array_elements(s.checklist_snapshot) c where s.pin_id=pid and c->>'id'=old.id::text) then raise exception 'Submitted checklist history cannot be deleted'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create function public.submit_checklist_qa(p_pin uuid,p_items uuid[],p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; ir uuid; previous uuid; selected uuid[];
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_work_on_pin(p_pin) then raise exception 'Only the active Foreman assigned to this work may submit it'; end if;
  if pn.status='verified' then raise exception 'Completed work must be reopened by the Engineer'; end if;
  if pn.status='for_review' or exists(select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress'))
     or exists(select 1 from public.pin_checklist_items where pin_id=p_pin and review_status='for_review') then
    raise exception 'An inspection is already pending or in progress. Finish it before submitting another QA request'; end if;
  if pn.qa_approved_by is null or not exists(select 1 from public.qa_templates t where t.id=pn.qa_template_id and not t.archived
      and (t.project_id is null or t.project_id=pn.project_id) and exists(select 1 from public.qa_template_items where template_id=t.id)) then
    raise exception 'The Engineer must approve an available QA checklist first'; end if;
  select array_agg(distinct id) into selected from public.pin_checklist_items where pin_id=p_pin and id=any(p_items);
  if coalesce(cardinality(selected),0)=0 or cardinality(selected)<>(select count(distinct x) from unnest(p_items) x) then
    raise exception 'Select checklist items belonging to this work'; end if;
  if exists(select 1 from public.pin_checklist_items where id=any(selected) and (not done or review_status in ('verified','for_review'))) then
    raise exception 'Only completed, unverified items can be submitted for review'; end if;
  if exists(select 1 from public.pin_checklist_items c where c.id=any(selected) and not exists(
      select 1 from public.pin_photos ph where ph.checklist_item_id=c.id and public.photo_eligible(ph.stamp_flag))) then
    raise exception 'Every submitted item requires eligible photo evidence; away-from-site or invalid-time photos do not count'; end if;
  select s.inspection_id into previous from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
    where s.pin_id=p_pin and s.item_ids && selected order by i.number desc limit 1;
  ir:=public.request_inspection(pn.project_id,pn.qa_template_id,left(pn.title,160),p_pin,null,left(coalesce(p_note,'Checklist item review'),2000));
  update public.qa_inspections set reinspection_of=previous where id=ir;
  insert into public.pin_qa_submissions(project_id,pin_id,inspection_id,template_id,submitted_by,checklist_snapshot,photos_snapshot,work_snapshot,all_complete,item_ids)
    select pn.project_id,p_pin,ir,pn.qa_template_id,auth.uid(),
      (select jsonb_agg(to_jsonb(c) order by c.id) from public.pin_checklist_items c where id=any(selected)),
      coalesce((select jsonb_agg(to_jsonb(ph) order by ph.id) from public.pin_photos ph where ph.checklist_item_id=any(selected)),'[]'::jsonb),
      public.pin_qa_work(p_pin),not exists(select 1 from public.pin_checklist_items where pin_id=p_pin and not done),selected;
  update public.pin_checklist_items set review_status='for_review',review_inspection_id=ir where id=any(selected);
  update public.pins set status='for_review' where id=p_pin;
  insert into public.pin_events(pin_id,project_id,kind,note) values(p_pin,pn.project_id,'comment',cardinality(selected)||' checklist item(s) submitted for QA review.');
  return ir;
end; $$;

-- Preserve the legacy completion gate for historical submissions; item submissions use per-item acceptance.
alter function public.pin_qa_verification_problem(uuid) rename to legacy_pin_qa_verification_problem;
revoke all on function public.legacy_pin_qa_verification_problem(uuid) from public,anon,authenticated;
create function public.pin_qa_verification_problem(p_pin uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_staff() or not exists(select 1 from public.pins where id=p_pin and public.can_view_project(project_id)) then return 'Access denied'; end if;
  if not exists(select 1 from public.pin_qa_submissions where pin_id=p_pin and item_ids is not null) then
    return public.legacy_pin_qa_verification_problem(p_pin); end if;
  if exists(select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress')) then return 'An inspection of this pin is still open'; end if;
  if exists(select 1 from public.qa_defects where pin_id=p_pin and status<>'closed') then return 'This pin still has open defects (NCRs)'; end if;
  if not exists(select 1 from public.pin_checklist_items where pin_id=p_pin) or exists(select 1 from public.pin_checklist_items where pin_id=p_pin and (not done or review_status<>'verified')) then
    return 'Every checklist item must pass inspection and be verified by the Engineer before work is completed'; end if;
  if exists(with recursive resolved as (
    select id,reinspection_of from public.qa_inspections where pin_id=p_pin and status='passed'
    union select i.id,i.reinspection_of from public.qa_inspections i join resolved r on i.id=r.reinspection_of
  ) select 1 from public.qa_inspections i where i.pin_id=p_pin and i.status in ('failed','conditional') and not exists(select 1 from resolved r where r.id=i.id)) then
    return 'A required inspection failed or is conditional; a linked re-inspection must pass'; end if;
  return null;
end; $$;
create or replace function public.finish_work_qa() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.pin_qa_submissions;
begin
  if new.status=old.status or new.status not in ('passed','failed','conditional','cancelled') then return new; end if;
  select * into s from public.pin_qa_submissions where inspection_id=new.id;
  if s.id is null then return new; end if;
  if s.item_ids is not null then
    if new.status<>'passed' then update public.pin_checklist_items set review_status='returned' where review_inspection_id=new.id; end if;
    if new.status<>'passed' then update public.pins set status='in_progress' where id=s.pin_id; end if;
  elsif new.status<>'passed' or not s.all_complete then
    update public.pins set status='in_progress' where id=s.pin_id and status='for_review';
  end if;
  insert into public.pin_events(pin_id,project_id,kind,note) values(s.pin_id,s.project_id,'comment',case when new.status='passed' then 'Inspection passed. ' else 'Sent back: inspection '||new.status||'. ' end||
    case when new.status='passed' then 'Engineer verifies the submitted checklist items next.' else coalesce(new.summary,'Correct the work and resubmit.') end);
  return new;
end; $$;

create function public.reset_changed_work_reviews() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.title,new.description,new.assigned_to,new.blueprint_id,new.revision_id,new.qa_template_id,new.x,new.y,new.category,new.discipline)
      is distinct from (old.title,old.description,old.assigned_to,old.blueprint_id,old.revision_id,old.qa_template_id,old.x,old.y,old.category,old.discipline)
    or (old.status='verified' and new.status<>'verified' and not exists(select 1 from public.pin_checklist_items where pin_id=new.id and review_status='returned')) then
    update public.pin_checklist_items set review_status='returned',verified_by=null,verified_at=null
      where pin_id=new.id and review_status in ('verified','for_review');
  end if;
  return new;
end; $$;
create trigger z_reset_changed_work_reviews after update on public.pins for each row execute function public.reset_changed_work_reviews();
revoke all on function public.reset_changed_work_reviews() from public,anon,authenticated;

create function public.review_checklist_item(p_item uuid,p_accept boolean,p_reason text default null) returns void
language plpgsql security definer set search_path='' as $$
declare c public.pin_checklist_items; pn public.pins; s public.pin_qa_submissions; original jsonb;
begin
  select * into c from public.pin_checklist_items where id=p_item;
  select * into pn from public.pins where id=c.pin_id for update;
  select * into c from public.pin_checklist_items where id=p_item for update;
  if c.id is null or not public.can_edit_blueprints(c.project_id) then raise exception 'Only the project Engineer verifies checklist items'; end if;
  if exists(select 1 from public.qa_inspections where pin_id=c.pin_id and status in ('requested','in_progress')) then raise exception 'Finish the pending QA inspection first'; end if;
  if c.review_status='verified' and p_accept then raise exception 'This checklist item is already verified'; end if;
  if p_accept then
    if not c.done or c.review_status<>'for_review' or not exists(select 1 from public.qa_inspections where id=c.review_inspection_id and status='passed') then
      raise exception 'This item must be submitted and pass QA before Engineer verification'; end if;
    if exists(select 1 from public.qa_defects where pin_id=c.pin_id and status<>'closed') then raise exception 'Close the open NCRs first'; end if;
    select * into s from public.pin_qa_submissions where inspection_id=c.review_inspection_id;
    select x into original from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text;
    if original is null or (original-array['review_status','review_inspection_id','verified_by','verified_at']) is distinct from
      (to_jsonb(c)-array['review_status','review_inspection_id','verified_by','verified_at']) or s.work_snapshot<>public.pin_qa_work(c.pin_id) then
      raise exception 'Work changed after inspection; submit again'; end if;
    if not exists(select 1 from public.pin_photos where checklist_item_id=c.id and public.photo_eligible(stamp_flag)) then raise exception 'Eligible photo evidence is required'; end if;
    update public.pin_checklist_items set review_status='verified',verified_by=auth.uid(),verified_at=now() where id=c.id;
  else
    if char_length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Provide a correction reason (at least 5 characters)'; end if;
    update public.pin_checklist_items set review_status='returned',verified_by=null,verified_at=null where id=c.id;
    if pn.status='verified' then update public.pins set status='in_progress' where id=pn.id; end if;
  end if;
  insert into public.pin_events(pin_id,project_id,kind,note) values(c.pin_id,c.project_id,'comment',left(c.text||case when p_accept then ': item verified by Engineer.' else ': returned. '||p_reason end,2000));
  if p_accept and public.pin_qa_verification_problem(c.pin_id) is null then update public.pins set status='verified' where id=c.pin_id;
  elsif not exists(select 1 from public.pin_checklist_items where pin_id=c.pin_id and review_status='for_review') then
    update public.pins set status='in_progress' where id=c.pin_id and status='for_review'; end if;
  perform public.notify_user(pn.assigned_to,'qa.item_review',case when p_accept then 'Checklist item verified' else 'Checklist correction required' end,
    left(c.text||coalesce(': '||p_reason,''),500),'/foreman/daily-work?project='||c.project_id,c.project_id,c.id);
end; $$;

create or replace function public.trg_notify_pin() returns trigger
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); r record; who text:=coalesce(public.display_name(me),'Someone'); accepted_partial boolean;
begin
  if new.status is distinct from old.status then
    if new.status in ('for_review','issue') then
      for r in select user_id from public.project_members where project_id=new.project_id and member_role='engineer' and user_id is distinct from me loop
        perform public.notify_user(r.user_id,case when new.status='issue' then 'pin.issue' else 'pin.review' end,
          case when new.status='issue' then 'Issue reported: ' else 'Ready for review: ' end||new.title,who,'/engineer/verification?project='||new.project_id,new.project_id,new.id);
      end loop;
    elsif new.status='verified' then
      if new.assigned_to is not null and new.assigned_to is distinct from me then
        perform public.notify_user(new.assigned_to,'pin.verified','Completed: '||new.title,'Accepted by '||who,'/foreman/dashboard?project='||new.project_id,new.project_id,new.id); end if;
      for r in select user_id from public.project_members where project_id=new.project_id and member_role='client' loop
        perform public.notify_user(r.user_id,'pin.milestone','Milestone completed: '||new.title,null,'/client/overview?project='||new.project_id,new.project_id,new.id); end loop;
    elsif old.status='for_review' and new.status in ('in_progress','not_started') and new.assigned_to is not null and new.assigned_to is distinct from me then
      accepted_partial:=exists(select 1 from public.pin_checklist_items c join public.qa_inspections i on i.id=c.review_inspection_id
        where c.pin_id=new.id and c.review_status='verified' and c.verified_by=me and i.status='passed' and c.verified_at=now());
      perform public.notify_user(new.assigned_to,case when accepted_partial then 'pin.resumed' else 'pin.returned' end,
        case when accepted_partial then 'Item accepted; continue work: ' else 'Sent back: ' end||new.title,
        case when accepted_partial then 'Complete the remaining checklist items.' else who||' asked for more work' end,
        '/foreman/dashboard?project='||new.project_id,new.project_id,new.id);
    end if;
  end if;
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to and new.assigned_to is distinct from me then
    perform public.notify_user(new.assigned_to,'pin.assigned','Assigned to you: '||new.title,new.due_date::text,'/foreman/dashboard?project='||new.project_id,new.project_id,new.id); end if;
  return new;
end; $$;

-- A failed site/time check may not satisfy camera-required inspection items.
create function public.guard_inspection_evidence_eligibility() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status in ('passed','conditional','failed') and old.status not in ('passed','conditional','failed') and exists(
    select 1 from public.qa_inspection_items x where x.inspection_id=new.id and x.requires_photo and x.result in ('pass','fail')
      and not exists(select 1 from public.qa_photos p where p.item_id=x.id and public.photo_eligible(p.stamp_flag))) then
    raise exception 'Each required photo must pass the site and time checks; rejected photos cannot satisfy QA'; end if;
  return new;
end; $$;
create trigger qa_eligible_evidence before update of status on public.qa_inspections for each row execute function public.guard_inspection_evidence_eligibility();

create function public.set_inspection_schedule(p_id uuid,p_target timestamptz,p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.qa_inspections;
begin
  select * into i from public.qa_inspections where id=p_id for update;
  if not public.can_edit_blueprints(i.project_id) or i.status not in ('requested','in_progress') then raise exception 'Only the project Engineer schedules open inspections'; end if;
  if p_target is null or p_owner is null or not exists(select 1 from public.project_members m join public.profiles p on p.id=m.user_id
    where m.project_id=i.project_id and m.user_id=p_owner and m.member_role='engineer' and p.status='active' and p.role='engineer') then raise exception 'Choose a target time and an active project Engineer'; end if;
  update public.qa_inspections set target_at=p_target,escalation_owner=p_owner where id=p_id;
end; $$;
create function public.generate_inspection_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare i record; n integer:=0;
begin
  if not public.is_active() then return 0; end if;
  for i in select * from public.qa_inspections where escalation_owner=auth.uid() and public.can_view_project(project_id)
    and status in ('requested','in_progress') and target_at<now() loop
    perform public.notify_user(auth.uid(),'qa.overdue','Overdue inspection: '||left(i.title,100),'Inspection target time has passed.',
      '/engineer/qa?project='||i.project_id||'&inspection='||i.id,i.project_id,i.id,'qa-overdue-'||i.id||'-'||(now() at time zone 'Asia/Manila')::date);
    n:=n+1;
  end loop;
  return n;
end; $$;

-- Daily reports keep draft/submitted transport states; review_state gives the Engineer review cycle.
alter table public.daily_reports
  add column review_state text not null default 'pending' check(review_state in ('pending','reviewed','returned')),
  add column review_note text,
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column reviewed_at timestamptz,
  add column revision integer not null default 0,
  add column linked_work jsonb not null default '[]'::jsonb;
grant insert(linked_work),update(linked_work) on public.daily_reports to authenticated;
create policy "staff follow returned reports" on public.daily_reports for select to authenticated
using(public.is_staff() and public.can_view_project(project_id) and revision>0 and review_state='returned');
create table public.daily_report_revisions(
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  report_id uuid not null references public.daily_reports(id) on delete cascade, revision integer not null,
  event text not null, actor_id uuid references auth.users(id) on delete set null,
  snapshot jsonb not null, photos_snapshot jsonb not null, created_at timestamptz not null default now()
);
create index daily_report_history on public.daily_report_revisions(report_id,created_at,id);
create index daily_report_history_project on public.daily_report_revisions(project_id,id);
alter table public.daily_report_revisions enable row level security;
revoke all on public.daily_report_revisions from anon,authenticated;
grant select on public.daily_report_revisions to authenticated;
create policy "staff and author read report history" on public.daily_report_revisions for select to authenticated using(
  public.can_view_project(project_id) and (public.is_staff() or exists(select 1 from public.daily_reports r where r.id=report_id and r.author_id=auth.uid())));

create or replace function public.prepare_daily_report() returns trigger
language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'Asia/Manila')::date; link jsonb; engineer_review boolean:=false;
begin
  if tg_op='INSERT' then
    new.author_id:=auth.uid();
    if new.report_date>today then raise exception 'A report cannot be dated in the future'; end if;
    if new.report_date<today-13 then raise exception 'Reports can only be written for the last 14 days'; end if;
    new.revision:=0; new.review_state:='pending'; new.reviewed_by:=null; new.reviewed_at:=null; new.review_note:=null;
  else
    if new.project_id<>old.project_id or new.report_date<>old.report_date or new.author_id<>old.author_id then raise exception 'The project, date and author of a report cannot change'; end if;
    engineer_review:=current_setting('app.report_review',true)='1' and public.can_edit_blueprints(old.project_id);
    if old.status='submitted' and not engineer_review then raise exception 'A submitted report cannot be edited. Ask an engineer to reopen it'; end if;
    if not engineer_review then
      new.review_state:=case when new.status='submitted' then 'pending' else old.review_state end;
      new.reviewed_by:=case when new.status='submitted' then null else old.reviewed_by end;
      new.reviewed_at:=case when new.status='submitted' then null else old.reviewed_at end;
      new.review_note:=old.review_note; new.revision:=old.revision;
    end if;
  end if;
  if jsonb_typeof(new.linked_work)<>'array' or jsonb_array_length(new.linked_work)>100 then raise exception 'Link at most 100 work pins'; end if;
  for link in select * from jsonb_array_elements(new.linked_work) loop
    if not exists(select 1 from public.pins where id=(link->>'pin_id')::uuid and project_id=new.project_id and category<>'note') then raise exception 'Linked work must belong to this project'; end if;
    if coalesce(link->>'unit','')='' or char_length(link->>'unit')>40 or jsonb_typeof(link->'planned') is distinct from 'number' or jsonb_typeof(link->'actual') is distinct from 'number' or (link->>'planned')::numeric<0 or (link->>'actual')::numeric<0
      or link->>'planned' is null or link->>'actual' is null then raise exception 'Enter a unit and nonnegative planned/actual quantities'; end if;
  end loop;
  if new.status='submitted' and (tg_op='INSERT' or old.status='draft') then
    if char_length(btrim(new.work_done))<5 then raise exception 'Describe the work done before submitting'; end if;
    new.submitted_at:=now(); new.revision:=new.revision+1; new.review_state:='pending';
  elsif new.status='draft' then new.submitted_at:=null;
  end if;
  new.updated_at:=now(); return new;
end; $$;
create function public.snapshot_daily_report() returns trigger
language plpgsql security definer set search_path='' as $$
declare action text;
begin
  if new.status='submitted' and (tg_op='INSERT' or old.status='draft') then action:='submitted';
  elsif tg_op='UPDATE' and new.review_state is distinct from old.review_state and new.review_state in ('reviewed','returned') then action:=new.review_state;
  else return new; end if;
  insert into public.daily_report_revisions(project_id,report_id,revision,event,actor_id,snapshot,photos_snapshot)
    select new.project_id,new.id,new.revision,action,auth.uid(),to_jsonb(new),coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.daily_report_photos p where p.report_id=new.id),'[]'::jsonb);
  return new;
end; $$;
create trigger daily_report_snapshot after insert or update on public.daily_reports for each row execute function public.snapshot_daily_report();
create function public.review_daily_report(p_id uuid,p_accept boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.daily_reports;
begin
  select * into r from public.daily_reports where id=p_id for update;
  if r.id is null or not public.can_edit_blueprints(r.project_id) then raise exception 'Report not found or not allowed. Only the project Engineer reviews reports'; end if;
  if r.status<>'submitted' then raise exception 'Only a submitted report can be reviewed'; end if;
  if char_length(btrim(coalesce(p_note,'')))<5 then raise exception 'Enter review feedback (at least 5 characters)'; end if;
  perform set_config('app.report_review','1',true);
  update public.daily_reports set status=case when p_accept then 'submitted' else 'draft' end,
    review_state=case when p_accept then 'reviewed' else 'returned' end,review_note=left(btrim(p_note),2000),reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
  perform set_config('app.report_review','0',true);
  perform public.notify_user(r.author_id,'report.reviewed',case when p_accept then 'Daily report reviewed' else 'Daily report returned for correction' end,
    left(p_note,500),'/foreman/daily-report?project='||r.project_id,r.project_id,r.id);
end; $$;
create or replace function public.reopen_daily_report(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin perform public.review_daily_report(p_id,false,'Please review and correct this daily report.'); end; $$;

create function public.protect_report_revision_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if pg_trigger_depth()>1 then return old; end if;
  if tg_table_name='daily_reports' then
    if exists(select 1 from public.daily_report_revisions where report_id=old.id) then raise exception 'A report with submitted revisions cannot be deleted'; end if;
  else
    if exists(select 1 from public.daily_report_revisions r, jsonb_array_elements(r.photos_snapshot) ph
      where r.report_id=old.report_id and ph->>'id'=old.id::text) then raise exception 'Photos retained in submitted report revisions cannot be deleted'; end if;
  end if;
  return old;
end; $$;
create trigger a_report_history_delete before delete on public.daily_reports for each row execute function public.protect_report_revision_evidence();
create trigger a_report_photo_history_delete before delete on public.daily_report_photos for each row execute function public.protect_report_revision_evidence();
revoke all on function public.protect_report_revision_evidence() from public,anon,authenticated;

-- Real biometric device totals can be imported; no sample attendance is used as evidence.
create table public.biometric_daily_totals(
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  work_date date not null, workers_count integer not null check(workers_count between 0 and 5000),
  source text not null check(char_length(source) between 3 and 200), imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now(), unique(project_id,work_date)
);
alter table public.biometric_daily_totals enable row level security;
revoke all on public.biometric_daily_totals from anon,authenticated;
grant select on public.biometric_daily_totals to authenticated;
create policy "staff read attendance totals" on public.biometric_daily_totals for select to authenticated using(public.is_staff() and public.can_view_project(project_id));
create trigger biometric_totals_audit after insert or update or delete on public.biometric_daily_totals for each row execute function public.log_row_change();
create function public.import_biometric_total(p_project uuid,p_date date,p_count integer,p_source text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_edit_blueprints(p_project) then raise exception 'Only the project Engineer imports biometric totals'; end if;
  if p_date>(now() at time zone 'Asia/Manila')::date then raise exception 'Attendance cannot be dated in the future'; end if;
  insert into public.biometric_daily_totals(project_id,work_date,workers_count,source,imported_by) values(p_project,p_date,p_count,btrim(p_source),auth.uid())
  on conflict(project_id,work_date) do update set workers_count=excluded.workers_count,source=excluded.source,imported_by=auth.uid(),imported_at=now();
end; $$;

alter publication supabase_realtime add table public.daily_report_revisions,public.biometric_daily_totals;
revoke all on function public.guard_one_open_inspection(),public.guard_inspection_evidence_eligibility(),public.snapshot_daily_report() from public,anon,authenticated;
revoke all on function public.photo_eligible(text),public.evidence_image_allowed(text,text),public.approve_pin_qa_checklist(uuid,uuid),
 public.submit_checklist_qa(uuid,uuid[],text),public.pin_qa_verification_problem(uuid),public.review_checklist_item(uuid,boolean,text),
 public.set_inspection_schedule(uuid,timestamptz,uuid),public.generate_inspection_reminders(),public.review_daily_report(uuid,boolean,text),
 public.import_biometric_total(uuid,date,integer,text) from public,anon;
grant execute on function public.photo_eligible(text),public.evidence_image_allowed(text,text),public.approve_pin_qa_checklist(uuid,uuid),
 public.submit_checklist_qa(uuid,uuid[],text),public.pin_qa_verification_problem(uuid),public.review_checklist_item(uuid,boolean,text),
 public.set_inspection_schedule(uuid,timestamptz,uuid),public.generate_inspection_reminders(),public.review_daily_report(uuid,boolean,text),
 public.import_biometric_total(uuid,date,integer,text) to authenticated;

-- Move existing pending submissions into item review without inventing results or replacing snapshots.
update public.pin_qa_submissions s set item_ids=coalesce((
  select array_agg((c->>'id')::uuid) from jsonb_array_elements(s.checklist_snapshot) c where (c->>'done')::boolean
),'{}'::uuid[]) where exists(select 1 from public.qa_inspections i where i.id=s.inspection_id and i.status in ('requested','in_progress'));
update public.pin_checklist_items c set review_status='for_review',review_inspection_id=s.inspection_id
from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
where c.id=any(s.item_ids) and i.status in ('requested','in_progress');
-- Baseline currently published reports. Earlier revisions are unknown and are not fabricated.
insert into public.daily_report_revisions(project_id,report_id,revision,event,actor_id,snapshot,photos_snapshot)
select r.project_id,r.id,r.revision,'baseline',null,to_jsonb(r),coalesce((select jsonb_agg(to_jsonb(p) order by p.id)
  from public.daily_report_photos p where p.report_id=r.id),'[]'::jsonb) from public.daily_reports r where r.status='submitted';

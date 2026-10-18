-- Every correction has a separate evidence holder; submitted attempts and earlier snapshots remain immutable.
create table public.qa_work_attempts(
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  pin_id uuid not null references public.pins(id), item_id uuid not null references public.pin_checklist_items(id),
  previous_inspection_id uuid not null references public.qa_inspections(id),
  submitted_inspection_id uuid references public.qa_inspections(id),
  remarks text not null default '' check(char_length(remarks)<=1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_draft_qa_attempt on public.qa_work_attempts(item_id) where submitted_inspection_id is null;
create index qa_attempt_history on public.qa_work_attempts(pin_id,created_at,id);
create index qa_attempt_parent on public.qa_work_attempts(submitted_inspection_id,previous_inspection_id);
alter table public.qa_work_attempts enable row level security;
revoke all on public.qa_work_attempts from anon,authenticated;
grant select on public.qa_work_attempts to authenticated;
create policy "staff read QA attempts" on public.qa_work_attempts for select to authenticated
using(public.is_staff() and public.can_view_project(project_id));
create trigger qa_attempt_audit after insert or update or delete on public.qa_work_attempts for each row execute function public.log_row_change();
alter table public.pin_photos add column qa_attempt_id uuid references public.qa_work_attempts(id);
create index pin_photo_attempt on public.pin_photos(qa_attempt_id);
grant insert(qa_attempt_id) on public.pin_photos to authenticated;

-- The Engineer's actual recorded inspection of these criteria is also approval to reuse them for correction.
create function public.pin_qa_template_approved(p_pin uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.pins p where p.id=p_pin and public.is_staff() and public.can_view_project(p.project_id)
    and (p.qa_approved_by is not null or exists(select 1 from public.qa_inspections i
      where i.pin_id=p.id and i.template_id=p.qa_template_id and i.inspector_id is not null
      and i.status in ('passed','failed','conditional') and i.started_at is not null)));
$$;
create function public.begin_checklist_resubmission(p_item uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.pin_checklist_items; pn public.pins; previous uuid; draft uuid;
begin
  select * into c from public.pin_checklist_items where id=p_item;
  select * into pn from public.pins where id=c.pin_id for update;
  select * into c from public.pin_checklist_items where id=p_item for update;
  if c.id is null or not public.can_work_on_pin(c.pin_id) then raise exception 'Only the assigned active Foreman prepares corrections'; end if;
  if pn.status in ('for_review','verified') or c.review_status in ('for_review','verified')
    or exists(select 1 from public.qa_inspections where pin_id=c.pin_id and status in ('requested','in_progress'))
    or exists(select 1 from public.pin_checklist_items where pin_id=c.pin_id and review_status='for_review') then
    raise exception 'Finish the pending inspection or Engineer verification before preparing another submission'; end if;
  select id into draft from public.qa_work_attempts where item_id=c.id and submitted_inspection_id is null;
  if draft is not null then return draft; end if;
  select s.inspection_id into previous from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
    where s.pin_id=c.pin_id and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text and (x->>'done')::boolean)
    order by i.number desc limit 1;
  if previous is null then raise exception 'This item has no earlier submission; upload its initial evidence and submit it first'; end if;
  insert into public.qa_work_attempts(project_id,pin_id,item_id,previous_inspection_id,created_by)
    values(c.project_id,c.pin_id,c.id,previous,auth.uid()) returning id into draft;
  insert into public.pin_events(pin_id,project_id,kind,note) values(c.pin_id,c.project_id,'comment','Correction draft opened for '||c.text||'; previous inspection '||previous||'. Original evidence remains unchanged.');
  return draft;
end; $$;
create function public.save_checklist_attempt(p_attempt uuid,p_remarks text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.qa_work_attempts;
begin
  select * into a from public.qa_work_attempts where id=p_attempt;
  perform 1 from public.pins where id=a.pin_id for update;
  select * into a from public.qa_work_attempts where id=p_attempt for update;
  if a.id is null or not public.can_work_on_pin(a.pin_id) then raise exception 'Only the assigned active Foreman edits correction evidence'; end if;
  if a.submitted_inspection_id is not null then raise exception 'Submitted attempt remarks are immutable; prepare a new correction'; end if;
  if exists(select 1 from public.qa_inspections where pin_id=a.pin_id and status in ('requested','in_progress')) then raise exception 'An inspection is already pending'; end if;
  update public.qa_work_attempts set remarks=left(btrim(coalesce(p_remarks,'')),1000),updated_at=now() where id=a.id;
  insert into public.pin_events(pin_id,project_id,kind,note) values(a.pin_id,a.project_id,'comment','Correction remarks saved for attempt '||a.id||'.');
end; $$;
create function public.check_work_attempt_photo() returns trigger
language plpgsql security definer set search_path='' as $$
declare a public.qa_work_attempts;
begin
  if new.qa_attempt_id is null then return new; end if;
  select * into a from public.qa_work_attempts where id=new.qa_attempt_id for update;
  if a.id is null or a.pin_id<>new.pin_id or a.item_id is distinct from new.checklist_item_id or not public.can_work_on_pin(a.pin_id) then
    raise exception 'Correction photo must belong to your own checklist item and attempt'; end if;
  if a.submitted_inspection_id is not null then raise exception 'Submitted attempt photos are immutable; prepare a new correction'; end if;
  update public.qa_work_attempts set updated_at=now() where id=a.id;
  return new;
end; $$;
create trigger pin_photos_attempt before insert on public.pin_photos for each row execute function public.check_work_attempt_photo();
create or replace function public.guard_pin_photo_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.qa_attempt_id is not null and exists(select 1 from public.qa_work_attempts a where a.id=old.qa_attempt_id
      and a.submitted_inspection_id is null and public.can_work_on_pin(a.pin_id)) and not exists(
      select 1 from public.pin_qa_submissions s,jsonb_array_elements(s.photos_snapshot) p where p->>'id'=old.id::text) then return old; end if;
  if exists(select 1 from public.pins where id=old.pin_id) and public.pin_has_evidence(old.pin_id) then
    raise exception 'This photo is evidence for submitted work and cannot be removed' using hint='evidence_locked'; end if;
  return old;
end; $$;

create or replace function public.submit_checklist_qa(p_pin uuid,p_items uuid[],p_note text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; ir uuid; previous uuid; selected uuid[]; c public.pin_checklist_items; a public.qa_work_attempts; prior uuid;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or not public.can_work_on_pin(p_pin) then raise exception 'Only the active Foreman assigned to this work may submit it'; end if;
  if pn.status='verified' then raise exception 'Completed work must be reopened by the Engineer'; end if;
  if pn.status='for_review' or exists(select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress'))
    or exists(select 1 from public.pin_checklist_items where pin_id=p_pin and review_status='for_review') then
    raise exception 'An inspection is already pending or in progress. Finish it before submitting another QA request'; end if;
  if not public.pin_qa_template_approved(p_pin) or not exists(select 1 from public.qa_templates t where t.id=pn.qa_template_id and not t.archived
    and (t.project_id is null or t.project_id=pn.project_id) and exists(select 1 from public.qa_template_items where template_id=t.id)) then
    raise exception 'The Engineer must approve an available QA checklist first'; end if;
  select array_agg(distinct id) into selected from public.pin_checklist_items where pin_id=p_pin and id=any(p_items);
  if coalesce(cardinality(selected),0)=0 or cardinality(selected)<>(select count(distinct x) from unnest(p_items) x) then raise exception 'Select checklist items belonging to this work'; end if;
  for c in select * from public.pin_checklist_items where id=any(selected) order by id for update loop
    if not c.done or c.review_status in ('verified','for_review') then raise exception 'Only completed, unverified items can be submitted for review'; end if;
    select s.inspection_id into prior from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
      where s.pin_id=p_pin and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text and (x->>'done')::boolean)
      order by i.number desc limit 1;
    select * into a from public.qa_work_attempts where item_id=c.id and submitted_inspection_id is null for update;
    if prior is not null then
      if a.id is null or a.previous_inspection_id<>prior then raise exception 'Prepare a separate resubmission for each previously submitted item'; end if;
      if char_length(btrim(a.remarks))<5 then raise exception 'Describe the correction in the new attempt remarks (at least 5 characters)'; end if;
      if not exists(select 1 from public.pin_photos ph where ph.checklist_item_id=c.id and ph.qa_attempt_id=a.id and public.photo_eligible(ph.stamp_flag)) then
        raise exception 'Add new eligible photos to this resubmission. Photos from the old request do not count'; end if;
      update public.pin_checklist_items set remark=a.remarks where id=c.id;
    elsif not exists(select 1 from public.pin_photos ph where ph.checklist_item_id=c.id and ph.qa_attempt_id is null and public.photo_eligible(ph.stamp_flag)) then
      raise exception 'Every submitted item requires eligible photo evidence; away-from-site or invalid-time photos do not count';
    end if;
  end loop;
  select s.inspection_id into previous from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
    where s.pin_id=p_pin and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where (x->>'id')::uuid=any(selected) and (x->>'done')::boolean)
    order by i.number desc limit 1;
  ir:=public.request_inspection(pn.project_id,pn.qa_template_id,left(pn.title,160),p_pin,null,
    left(case when previous is null then 'Initial checklist submission. ' else 'Resubmission of corrected checklist work. ' end||coalesce(p_note,''),2000));
  update public.qa_inspections set reinspection_of=previous where id=ir;
  insert into public.pin_qa_submissions(project_id,pin_id,inspection_id,template_id,submitted_by,checklist_snapshot,photos_snapshot,work_snapshot,all_complete,item_ids)
    select pn.project_id,p_pin,ir,pn.qa_template_id,auth.uid(),
      (select jsonb_agg(to_jsonb(ci) order by ci.id) from public.pin_checklist_items ci where id=any(selected)),
      coalesce((select jsonb_agg(to_jsonb(ph) order by ph.id) from public.pin_photos ph where ph.checklist_item_id=any(selected) and (
        ph.qa_attempt_id in (select id from public.qa_work_attempts where item_id=any(selected) and submitted_inspection_id is null)
        or (ph.qa_attempt_id is null and not exists(select 1 from public.pin_qa_submissions old_s,jsonb_array_elements(old_s.checklist_snapshot) x
          where old_s.pin_id=p_pin and x->>'id'=ph.checklist_item_id::text and (x->>'done')::boolean)))),'[]'::jsonb),
      public.pin_qa_work(p_pin),not exists(select 1 from public.pin_checklist_items where pin_id=p_pin and not done),selected;
  update public.qa_work_attempts set submitted_inspection_id=ir,updated_at=now() where item_id=any(selected) and submitted_inspection_id is null;
  update public.pin_checklist_items set review_status='for_review',review_inspection_id=ir where id=any(selected);
  update public.pins set status='for_review' where id=p_pin;
  insert into public.pin_events(pin_id,project_id,kind,note) values(p_pin,pn.project_id,'comment',
    case when previous is null then 'Initial QA request: ' else 'QA resubmission: ' end||cardinality(selected)||' item(s); inspection '||ir||coalesce('; replaces request '||previous,'')||'.');
  return ir;
end; $$;

-- Link all parents when a batch contains corrections of more than one earlier inspection.
create function public.work_qa_has_unresolved_result(p_pin uuid) returns boolean
language sql stable security definer set search_path='' as $$
  with recursive resolved(id) as (
    select id from public.qa_inspections where pin_id=p_pin and status='passed'
    union
    select parent_id from resolved r join public.qa_inspections i on i.id=r.id
      cross join lateral unnest(array[i.reinspection_of]||coalesce((select array_agg(a.previous_inspection_id)
        from public.qa_work_attempts a where a.submitted_inspection_id=i.id),'{}'::uuid[])) parent_id where parent_id is not null
  ) select exists(select 1 from public.qa_inspections i where i.pin_id=p_pin and i.status in ('failed','conditional') and not exists(select 1 from resolved r where r.id=i.id));
$$;
create or replace function public.pin_qa_verification_problem(p_pin uuid) returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_staff() or not exists(select 1 from public.pins where id=p_pin and public.can_view_project(project_id)) then return 'Access denied'; end if;
  if not exists(select 1 from public.pin_qa_submissions where pin_id=p_pin and item_ids is not null) then return public.legacy_pin_qa_verification_problem(p_pin); end if;
  if exists(select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress')) then return 'An inspection of this pin is still open'; end if;
  if exists(select 1 from public.qa_defects where pin_id=p_pin and status<>'closed') then return 'This pin still has open defects (NCRs)'; end if;
  if not exists(select 1 from public.pin_checklist_items where pin_id=p_pin) or exists(select 1 from public.pin_checklist_items where pin_id=p_pin and (not done or review_status<>'verified')) then
    return 'Every checklist item must pass inspection and be verified by the Engineer before work is completed'; end if;
  if public.work_qa_has_unresolved_result(p_pin) then return 'A required inspection failed or is conditional; a linked re-inspection must pass'; end if;
  return null;
end; $$;

-- Retain the last inspection link even if the Foreman edits readiness or remarks after a return.
create or replace function public.guard_work_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare pid uuid; pn public.pins; review_only boolean:=false;
begin
  pid:=case when tg_op='DELETE' then old.pin_id else new.pin_id end;
  select * into pn from public.pins where id=pid for update;
  if tg_op='UPDATE' and tg_table_name='pin_checklist_items' then
    review_only:=(to_jsonb(new)-array['review_status','review_inspection_id','verified_by','verified_at'])=(to_jsonb(old)-array['review_status','review_inspection_id','verified_by','verified_at']);
    if not review_only and old.review_status='verified' then raise exception 'Reopen the checklist item before changing verified evidence'; end if;
    if not review_only and (new.done is distinct from old.done or new.text is distinct from old.text or new.remark is distinct from old.remark) then
      new.review_status:=case when old.review_inspection_id is null then 'not_submitted' else 'returned' end;
      new.review_inspection_id:=old.review_inspection_id; new.verified_at:=null; new.verified_by:=null;
    end if;
  end if;
  if auth.uid() is not null and pn.status in ('for_review','verified') and not review_only then raise exception 'Awaiting Engineer inspection or verified: checklist and evidence are locked'; end if;
  if tg_op='UPDATE' and new.pin_id is distinct from old.pin_id then raise exception 'Evidence cannot move between work items'; end if;
  if tg_op='DELETE' and tg_table_name='pin_checklist_items' and exists(select 1 from public.pin_qa_submissions s,jsonb_array_elements(s.checklist_snapshot) c
    where s.pin_id=pid and c->>'id'=old.id::text) then raise exception 'Submitted checklist history cannot be deleted'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

create table public.qa_inspection_events(
  id bigint generated always as identity primary key, project_id uuid not null references public.projects(id),
  inspection_id uuid not null references public.qa_inspections(id), actor_id uuid references auth.users(id) on delete set null,
  kind text not null, note text not null, created_at timestamptz not null default now()
);
create index qa_inspection_timeline on public.qa_inspection_events(inspection_id,created_at,id);
create index qa_inspection_event_project on public.qa_inspection_events(project_id,id);
alter table public.qa_inspection_events enable row level security;
revoke all on public.qa_inspection_events from anon,authenticated;
grant select on public.qa_inspection_events to authenticated;
create policy "staff read inspection timelines" on public.qa_inspection_events for select to authenticated using(public.is_staff() and public.can_view_project(project_id));
create function public.record_inspection_workflow_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='qa_inspections' then
    if tg_op='INSERT' then
      insert into public.qa_inspection_events(project_id,inspection_id,actor_id,kind,note) values(new.project_id,new.id,auth.uid(),'requested','Inspection requested. '||coalesce(new.request_note,''));
    elsif new.status is distinct from old.status then
      insert into public.qa_inspection_events(project_id,inspection_id,actor_id,kind,note) values(new.project_id,new.id,auth.uid(),new.status,
        'Inspection '||new.status||coalesce(': '||new.summary,''));
    end if;
  else
    if (new.result,new.measured_value,new.remarks) is distinct from (old.result,old.measured_value,old.remarks) then
      insert into public.qa_inspection_events(project_id,inspection_id,actor_id,kind,note) values(new.project_id,new.inspection_id,auth.uid(),'item_result',
        new.text||': '||new.result||coalesce('; measured '||new.measured_value||' '||new.unit,'')||coalesce('; '||new.remarks,''));
    end if;
  end if;
  return new;
end; $$;
create trigger qa_inspection_workflow after insert or update on public.qa_inspections for each row execute function public.record_inspection_workflow_event();
create trigger qa_item_workflow after update on public.qa_inspection_items for each row execute function public.record_inspection_workflow_event();
insert into public.qa_inspection_events(project_id,inspection_id,actor_id,kind,note,created_at)
  select project_id,id,requested_by,'requested','Existing inspection request.',requested_at from public.qa_inspections
  union all select project_id,id,inspector_id,'in_progress','Existing inspection start.',started_at from public.qa_inspections where started_at is not null
  union all select project_id,id,inspector_id,status,'Existing recorded outcome: '||status||coalesce('; '||summary,''),completed_at from public.qa_inspections where completed_at is not null;

alter publication supabase_realtime add table public.qa_work_attempts,public.qa_inspection_events;
revoke all on function public.check_work_attempt_photo(),public.record_inspection_workflow_event(),public.work_qa_has_unresolved_result(uuid) from public,anon,authenticated;
revoke all on function public.pin_qa_template_approved(uuid),public.begin_checklist_resubmission(uuid),public.save_checklist_attempt(uuid,text) from public,anon;
grant execute on function public.pin_qa_template_approved(uuid),public.begin_checklist_resubmission(uuid),public.save_checklist_attempt(uuid,text) to authenticated;

-- Repair display state only from existing recorded failures. Never create synthetic results or submissions.
update public.pin_checklist_items c set review_status='returned',review_inspection_id=s.inspection_id
from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
where c.pin_id=s.pin_id and c.review_status='not_submitted' and i.status in ('failed','conditional','cancelled')
  and exists(select 1 from jsonb_array_elements(s.checklist_snapshot) x where x->>'id'=c.id::text and (x->>'done')::boolean)
  and not exists(select 1 from public.pin_qa_submissions newer join public.qa_inspections ni on ni.id=newer.inspection_id
    where newer.pin_id=c.pin_id and ni.number>i.number and exists(select 1 from jsonb_array_elements(newer.checklist_snapshot) x where x->>'id'=c.id::text and (x->>'done')::boolean));

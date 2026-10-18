-- Checklist QA requests may be partial. Only a complete, passed submission can verify work.
alter table public.pins add column qa_template_id uuid references public.qa_templates(id);

create table public.pin_qa_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  pin_id uuid not null references public.pins(id),
  inspection_id uuid not null unique references public.qa_inspections(id),
  template_id uuid not null references public.qa_templates(id),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  checklist_snapshot jsonb not null,
  photos_snapshot jsonb not null,
  work_snapshot jsonb not null,
  all_complete boolean not null
);
create index pin_qa_submissions_pin on public.pin_qa_submissions(pin_id, submitted_at desc);
alter table public.pin_qa_submissions enable row level security;
revoke all on public.pin_qa_submissions from anon, authenticated;
grant select on public.pin_qa_submissions to authenticated;
create policy "staff read work submissions" on public.pin_qa_submissions for select to authenticated
using (public.is_staff() and public.can_view_project(project_id));
create trigger pin_qa_submissions_audit after insert or update or delete on public.pin_qa_submissions
for each row execute function public.log_row_change();

create function public.pin_qa_checklist(p_pin uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
 from public.pin_checklist_items c where c.pin_id = p_pin;
$$;
create function public.pin_qa_work(p_pin uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('title', p.title, 'description', p.description, 'assigned_to', p.assigned_to,
 'blueprint_id', p.blueprint_id, 'revision_id', p.revision_id, 'qa_template_id', p.qa_template_id,
 'x', p.x, 'y', p.y, 'category', p.category, 'discipline', p.discipline)
 from public.pins p where p.id = p_pin;
$$;

-- Stage requests remain available, but pin locking serializes them with final submissions/verification.
alter function public.request_inspection(uuid, uuid, text, uuid, text, text) rename to request_stage_inspection;
revoke all on function public.request_stage_inspection(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
create function public.request_inspection(p_project uuid, p_template uuid, p_title text, p_pin uuid default null, p_location text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_pin is not null then
    perform 1 from public.pins where id=p_pin for update;
    if exists(select 1 from public.pins where id=p_pin and status='verified') then raise exception 'The Engineer must reopen verified work before another inspection'; end if;
    if exists(select 1 from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
      where s.pin_id=p_pin and i.status in ('requested','in_progress')) then raise exception 'A work inspection is already pending or in progress'; end if;
  end if;
  return public.request_stage_inspection(p_project,p_template,p_title,p_pin,p_location,p_note);
end;
$$;
revoke all on function public.request_inspection(uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.request_inspection(uuid,uuid,text,uuid,text,text) to authenticated;

create function public.submit_pin_qa(p_pin uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pn public.pins; ir uuid; previous uuid; snap jsonb; complete boolean;
begin
  select * into pn from public.pins where id = p_pin for update;
  if pn.id is null or not public.can_work_on_pin(p_pin) then
    raise exception 'Only the active Foreman assigned to this work may submit it';
  end if;
  if pn.status = 'verified' then raise exception 'Verified work cannot be submitted'; end if;
  if exists (select 1 from public.qa_inspections where pin_id = p_pin and status in ('requested', 'in_progress')) then
    raise exception 'Awaiting Engineer inspection: an inspection is already pending or in progress';
  end if;
  if not exists (select 1 from public.qa_templates t where t.id = pn.qa_template_id and not t.archived
      and (t.project_id is null or t.project_id = pn.project_id))
     or not exists (select 1 from public.qa_template_items where template_id = pn.qa_template_id) then
    raise exception 'The Engineer must configure an applicable QA checklist first';
  end if;
  if not exists (select 1 from public.pin_checklist_items where pin_id = p_pin) then
    raise exception 'The Engineer must configure the work checklist first';
  end if;
  if exists (select 1 from public.pin_checklist_items c where c.pin_id = p_pin and c.done
      and not exists (select 1 from public.pin_photos ph where ph.checklist_item_id = c.id)) then
    raise exception 'Every completed checklist item requires photo evidence';
  end if;
  snap := public.pin_qa_checklist(p_pin);
  complete := not exists (select 1 from public.pin_checklist_items where pin_id = p_pin and not done);
  select s.inspection_id into previous from public.pin_qa_submissions s join public.qa_inspections i on i.id = s.inspection_id
    where s.pin_id = p_pin order by i.number desc limit 1;
  ir := public.request_inspection(pn.project_id, pn.qa_template_id, left(pn.title, 160), p_pin, null,
    left(case when complete then 'Complete work submission. ' else 'Partial work submission: outstanding items remain. ' end || coalesce(p_note, ''), 2000));
  update public.qa_inspections set reinspection_of = previous where id = ir;
  insert into public.pin_qa_submissions(project_id, pin_id, inspection_id, template_id, submitted_by,
      checklist_snapshot, photos_snapshot, work_snapshot, all_complete)
    select pn.project_id, p_pin, ir, pn.qa_template_id, auth.uid(), snap,
      coalesce((select jsonb_agg(to_jsonb(ph) order by ph.id) from public.pin_photos ph where ph.pin_id = p_pin), '[]'::jsonb),
      public.pin_qa_work(p_pin), complete;
  update public.pins set status = 'for_review' where id = p_pin;
  insert into public.pin_events(pin_id, project_id, kind, note) values
    (p_pin, pn.project_id, 'comment', case when complete then 'Submitted for QA inspection.' else 'Submitted for partial QA inspection; incomplete work is not final verification.' end);
  return ir;
end;
$$;

-- Serialize evidence mutations with submission. Corrections add new evidence; existing submitted evidence stays immutable.
create function public.guard_work_evidence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid; pn public.pins;
begin
  pid := case when tg_op = 'DELETE' then old.pin_id else new.pin_id end;
  select * into pn from public.pins where id = pid for update;
  if auth.uid() is not null and pn.status in ('for_review', 'verified') then
    raise exception 'Awaiting Engineer inspection or verified: checklist and evidence are locked';
  end if;
  if tg_op = 'UPDATE' and new.pin_id is distinct from old.pin_id then raise exception 'Evidence cannot move between work items'; end if;
  if tg_op = 'DELETE' and tg_table_name = 'pin_checklist_items' and exists (
    select 1 from public.pin_qa_submissions s, jsonb_array_elements(s.checklist_snapshot) c
    where s.pin_id = pid and c->>'id' = old.id::text) then
    raise exception 'Submitted checklist history cannot be deleted';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger a_work_checklist_lock before insert or update or delete on public.pin_checklist_items
for each row execute function public.guard_work_evidence();
create trigger a_work_photo_lock before insert or update or delete on public.pin_photos
for each row execute function public.guard_work_evidence();

create function public.guard_work_qa_config() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.qa_template_id is not null and (tg_op = 'INSERT' or new.qa_template_id is distinct from old.qa_template_id) then
    if not public.can_edit_blueprints(new.project_id) then raise exception 'Only the project Engineer configures QA'; end if;
    if not exists (select 1 from public.qa_templates where id = new.qa_template_id and not archived
      and (project_id is null or project_id = new.project_id)) then raise exception 'QA checklist is not available for this project'; end if;
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.pin_qa_submissions s join public.qa_inspections i on i.id = s.inspection_id
      where s.pin_id = old.id and i.status in ('requested', 'in_progress')) then
    if new.status <> 'for_review' or new.qa_template_id is distinct from old.qa_template_id
      or new.assigned_to is distinct from old.assigned_to or new.title is distinct from old.title
      or new.description is distinct from old.description or new.blueprint_id is distinct from old.blueprint_id
      or new.revision_id is distinct from old.revision_id or new.x is distinct from old.x or new.y is distinct from old.y
      or new.category is distinct from old.category or new.discipline is distinct from old.discipline then
      raise exception 'Awaiting Engineer inspection: complete or cancel the inspection before changing this work';
    end if;
  end if;
  if tg_op='UPDATE' and old.status='verified' and new.status='verified' and (
    new.title is distinct from old.title or new.description is distinct from old.description
    or new.qa_template_id is distinct from old.qa_template_id or new.revision_id is distinct from old.revision_id
    or new.x is distinct from old.x or new.y is distinct from old.y
    or new.category is distinct from old.category or new.discipline is distinct from old.discipline) then
    raise exception 'The Engineer must reopen verified work before changing it';
  end if;
  return new;
end;
$$;
create trigger pins_work_qa_config before insert or update on public.pins
for each row execute function public.guard_work_qa_config();

-- Keep the existing offline progress endpoint, but obsolete queued "for_review" requests cannot bypass confirmation/QA.
create or replace function public.report_pin_progress(p_pin uuid, p_status public.pin_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare pn public.pins;
begin
  select * into pn from public.pins where id = p_pin for update;
  if not public.can_work_on_pin(p_pin) then raise exception 'This work is not assigned to you. Only a Foreman assigned to this project can report progress'; end if;
  if pn.status = 'verified' then raise exception 'A verified pin can only be changed by an Engineer'; end if;
  if p_status <> 'in_progress' then raise exception 'Use Submit for QA inspection in the checklist'; end if;
  if pn.status = 'for_review' then raise exception 'Awaiting Engineer inspection'; end if;
  update public.pins set status = p_status where id = p_pin;
  if nullif(btrim(p_note), '') is not null then
    insert into public.pin_events(pin_id, project_id, kind, note) values(p_pin, pn.project_id, 'comment', left(btrim(p_note), 2000));
  end if;
end;
$$;

-- Keep generic stage/hold-point reinspection unchanged; checklist submissions must take a new immutable snapshot.
alter function public.request_reinspection(uuid, text) rename to request_stage_reinspection;
revoke all on function public.request_stage_reinspection(uuid, text) from public, anon, authenticated;
create function public.request_reinspection(p_id uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  if exists (select 1 from public.pin_qa_submissions where inspection_id = p_id) then
    raise exception 'Resubmit from the assigned work checklist with confirmation';
  end if;
  select pin_id into pid from public.qa_inspections where id=p_id;
  if pid is not null then
    perform 1 from public.pins where id=pid for update;
    if exists(select 1 from public.pins where id=pid and status='verified') then raise exception 'The Engineer must reopen verified work before another inspection'; end if;
    if exists(select 1 from public.pin_qa_submissions s join public.qa_inspections i on i.id=s.inspection_id
      where s.pin_id=pid and i.status in ('requested','in_progress')) then raise exception 'A work inspection is already pending or in progress'; end if;
  end if;
  return public.request_stage_reinspection(p_id, p_note);
end;
$$;

create function public.finish_work_qa() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.pin_qa_submissions; why text;
begin
  if new.status = old.status or new.status not in ('passed', 'failed', 'conditional', 'cancelled') then return new; end if;
  select * into s from public.pin_qa_submissions where inspection_id = new.id;
  if s.id is null then return new; end if;
  if new.status <> 'passed' or not s.all_complete then
    why := case when new.status = 'passed' then 'Partial inspection passed; finish remaining work and submit again for final inspection.'
      else 'Sent back: inspection ' || new.status || '. ' || coalesce(new.summary, '') end;
    update public.pins set status = 'in_progress' where id = s.pin_id and status = 'for_review';
    insert into public.pin_events(pin_id, project_id, kind, note) values(s.pin_id, s.project_id, 'comment', left(why,2000));
  end if;
  return new;
end;
$$;
create trigger qa_finish_work after update of status on public.qa_inspections
for each row execute function public.finish_work_qa();

create function public.pin_qa_verification_problem(p_pin uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare s public.pin_qa_submissions; state text;
begin
  if not public.is_staff() or not exists (select 1 from public.pins where id = p_pin and public.can_view_project(project_id)) then return 'Access denied'; end if;
  if not exists (select 1 from public.pin_checklist_items where pin_id=p_pin) or exists (
    select 1 from public.pin_checklist_items where pin_id=p_pin and not done) then return 'Every checklist item must be completed by the Foreman before the work can be verified'; end if;
  if exists (select 1 from public.pin_checklist_items c where c.pin_id=p_pin and not exists (
    select 1 from public.pin_photos ph where ph.checklist_item_id=c.id)) then return 'Every checklist item requires photo evidence'; end if;
  if exists (select 1 from public.qa_inspections where pin_id=p_pin and status in ('requested','in_progress')) then return 'An inspection of this pin is still open'; end if;
  if exists (select 1 from public.qa_defects where pin_id=p_pin and status <> 'closed') then return 'This pin still has open defects (NCRs)'; end if;
  select x.* into s from public.pin_qa_submissions x join public.qa_inspections i on i.id=x.inspection_id
    where x.pin_id=p_pin order by i.number desc limit 1;
  select status into state from public.qa_inspections where id=s.inspection_id;
  if s.id is null or state is distinct from 'passed' or not s.all_complete then return 'A complete work submission must pass Engineer inspection before verification'; end if;
  if s.checklist_snapshot <> public.pin_qa_checklist(p_pin) or s.work_snapshot <> public.pin_qa_work(p_pin) then
    return 'Work changed after inspection; submit again for Engineer inspection';
  end if;
  -- Earlier failed/conditional stage inspections remain required until a linked descendant passes.
  if exists (with recursive resolved as (
      select id, reinspection_of from public.qa_inspections where pin_id=p_pin and status='passed'
      union select i.id, i.reinspection_of from public.qa_inspections i join resolved r on i.id=r.reinspection_of
    ) select 1 from public.qa_inspections i where i.pin_id=p_pin and i.status in ('failed','conditional')
      and not exists (select 1 from resolved r where r.id=i.id)) then return 'A required inspection failed or is conditional; a linked re-inspection must pass'; end if;
  return null;
end;
$$;
create or replace function public.guard_pin_verification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare problem text;
begin
  if auth.uid() is null or new.status <> 'verified' or (tg_op='UPDATE' and old.status='verified') then return new; end if;
  if tg_op='INSERT' then raise exception 'A new pin cannot start as verified'; end if;
  if not public.can_edit_blueprints(new.project_id) then raise exception 'Only the project Engineer can verify work'; end if;
  problem := public.pin_qa_verification_problem(new.id);
  if problem is not null then raise exception '%', problem; end if;
  if new.assigned_to is distinct from old.assigned_to or new.title is distinct from old.title
    or new.description is distinct from old.description or new.qa_template_id is distinct from old.qa_template_id
    or new.blueprint_id is distinct from old.blueprint_id or new.revision_id is distinct from old.revision_id
    or new.x is distinct from old.x or new.y is distinct from old.y or new.category is distinct from old.category
    or new.discipline is distinct from old.discipline then raise exception 'Cannot change and verify work together'; end if;
  return new;
end;
$$;

create function public.return_pin_for_correction(p_pin uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare pn public.pins; ir record;
begin
  select * into pn from public.pins where id=p_pin for update;
  if not public.can_edit_blueprints(pn.project_id) then raise exception 'Only the project Engineer can return work'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Identify the affected items and provide a correction reason'; end if;
  if pn.status <> 'for_review' then raise exception 'Only work awaiting review can be returned'; end if;
  for ir in select i.id from public.qa_inspections i join public.pin_qa_submissions s on s.inspection_id=i.id
    where s.pin_id=p_pin and i.status in ('requested','in_progress') loop
    perform public.cancel_inspection(ir.id, p_reason);
  end loop;
  update public.pins set status='in_progress' where id=p_pin;
  insert into public.pin_events(pin_id,project_id,kind,note) values(p_pin,pn.project_id,'comment','Sent back: ' || left(btrim(p_reason),1900));
end;
$$;

revoke all on function public.pin_qa_checklist(uuid), public.pin_qa_work(uuid), public.guard_work_evidence(),
 public.guard_work_qa_config(), public.finish_work_qa() from public, anon, authenticated;
revoke all on function public.submit_pin_qa(uuid,text), public.request_reinspection(uuid,text),
 public.pin_qa_verification_problem(uuid), public.return_pin_for_correction(uuid,text) from public, anon;
grant execute on function public.submit_pin_qa(uuid,text), public.request_reinspection(uuid,text),
 public.pin_qa_verification_problem(uuid), public.return_pin_for_correction(uuid,text) to authenticated;

-- A Foreman cannot mutate submitted QA evidence through the generic QA-photo endpoint either.
create function public.guard_submitted_qa_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ir uuid; pid uuid;
begin
  if tg_op='DELETE' then
    ir := coalesce(old.inspection_id,(select inspection_id from public.qa_inspection_items where id=old.item_id));
  else
    ir := coalesce(new.inspection_id,(select inspection_id from public.qa_inspection_items where id=new.item_id));
  end if;
  select project_id into pid from public.pin_qa_submissions where inspection_id=ir;
  if pid is not null and not public.can_edit_blueprints(pid) then raise exception 'Submitted work evidence is locked; only the Engineer records inspection evidence'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger a_submitted_qa_photo before insert or delete on public.qa_photos
for each row execute function public.guard_submitted_qa_photo();
revoke all on function public.guard_submitted_qa_photo() from public,anon,authenticated;

create function public.guard_work_qa_cancellation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='cancelled' and old.status<>new.status
    and exists(select 1 from public.pin_qa_submissions where inspection_id=new.id)
    and not public.can_edit_blueprints(new.project_id) then
    raise exception 'Only the project Engineer may return or cancel submitted work';
  end if;
  return new;
end;
$$;
create trigger qa_work_cancel before update of status on public.qa_inspections
for each row execute function public.guard_work_qa_cancellation();
revoke all on function public.guard_work_qa_cancellation() from public,anon,authenticated;

-- Pin record links (2026-10-24).
-- 1. An NCR may name the checklist item it concerns: permanent id + the item name saved when it was raised (same pattern as
--    site_issue_reports). A trigger validates every NCR row: its pin belongs to its project, its item belongs to its pin and
--    project. Inspection-raised NCRs keep their existing link through the inspection (item_defect_ids is unchanged), so the
--    correction package, item completion and work completion rules stay exactly as they are.
-- 2. raise_defect gains an 11-argument form with the checklist item. The old 10-argument entrypoint (used by decide_snag and
--    older clients) is now a thin wrapper, as was done for log_site_issue.
-- 3. report_field_problem: the assigned Foreman reports a field problem on their work pin (optionally one checklist item). It is
--    written to the pin timeline and notifies the project Engineers, who decide whether to log an issue or raise an NCR.

alter table public.qa_defects
  add column checklist_item_id uuid references public.pin_checklist_items(id) on delete set null,
  add column checklist_name text check (checklist_name is null or char_length(btrim(checklist_name)) between 1 and 200);
create index qa_defects_checklist_item on public.qa_defects(checklist_item_id) where checklist_item_id is not null;

create function public.guard_defect_links() returns trigger
language plpgsql security definer set search_path='' as $$
declare item public.pin_checklist_items; pin_project uuid;
begin
  -- The work pin was removed (on delete set null): the item link goes with it, the saved name stays as history.
  if tg_op='UPDATE' and new.pin_id is null and old.pin_id is not null then
    new.checklist_item_id:=null;
    return new;
  end if;
  if new.checklist_item_id is not null and (tg_op='INSERT' or new.checklist_item_id is distinct from old.checklist_item_id or new.pin_id is distinct from old.pin_id) then
    select * into item from public.pin_checklist_items where id=new.checklist_item_id;
    if item.id is null or item.project_id<>new.project_id then raise exception 'Select a checklist item from this project'; end if;
    if new.pin_id is null and tg_op='INSERT' then new.pin_id:=item.pin_id; end if;
    if new.pin_id is distinct from item.pin_id then raise exception 'Select a checklist item belonging to this work pin'; end if;
    if tg_op='INSERT' or new.checklist_item_id is distinct from old.checklist_item_id then new.checklist_name:=left(item.text,200); end if;
  end if;
  if new.pin_id is not null and (tg_op='INSERT' or new.pin_id is distinct from old.pin_id or new.project_id is distinct from old.project_id) then
    select project_id into pin_project from public.pins where id=new.pin_id;
    if pin_project is distinct from new.project_id then raise exception 'That pin is not part of this project'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_defect_links() from public,anon,authenticated;
create trigger qa_defects_links before insert or update of pin_id,checklist_item_id,project_id on public.qa_defects
  for each row execute function public.guard_defect_links();

-- No defaults: a 10-argument call can only mean the old entrypoint, so SQL and PostgREST stay unambiguous.
create function public.raise_defect(p_project uuid, p_title text, p_description text, p_category text, p_severity text, p_trade text, p_reference text,
                                    p_pin uuid, p_assigned_to uuid, p_due date, p_checklist_item uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; n integer; item public.pin_checklist_items;
begin
  if not public.can_report_on_project(p_project) then raise exception 'You are not allowed to raise defects on this project'; end if;
  if p_pin is not null and not exists (select 1 from public.pins where id = p_pin and project_id = p_project) then raise exception 'That pin is not part of this project'; end if;
  if p_checklist_item is not null then
    select * into item from public.pin_checklist_items where id = p_checklist_item and project_id = p_project;
    if item.id is null or (p_pin is not null and item.pin_id <> p_pin) then raise exception 'Select a checklist item belonging to this work pin'; end if;
  end if;
  if p_assigned_to is not null and not exists (select 1 from public.project_members where project_id = p_project and user_id = p_assigned_to and member_role = 'foreman') then raise exception 'A defect can only be assigned to a foreman of the project'; end if;
  if p_due is not null and p_due < current_date - 1 then raise exception 'The due date is in the past'; end if;
  n := public.next_qa_number(p_project, 'ncr');
  insert into public.qa_defects (project_id, number, pin_id, checklist_item_id, title, description, category, severity, trade, reference, assigned_to, due_date)
  values (p_project, n, coalesce(p_pin, item.pin_id), p_checklist_item, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_category, p_severity, coalesce(p_trade, 'general'),
          nullif(btrim(coalesce(p_reference, '')), ''), p_assigned_to, coalesce(p_due, current_date + public.qa_due_days(p_severity))) returning id into v_id;
  insert into public.qa_defect_events (defect_id, project_id, kind, to_status, note) values (v_id, p_project, 'raised', 'open', null);
  if p_assigned_to is not null and p_assigned_to is distinct from auth.uid() then
    perform public.notify_user(p_assigned_to, 'qa.defect', 'NCR-' || lpad(n::text, 4, '0') || ' (' || p_severity || '): ' || left(btrim(p_title), 100), 'Due ' || to_char(coalesce(p_due, current_date + public.qa_due_days(p_severity)), 'Mon DD'),
      '/foreman/issues?project=' || p_project || '&defect=' || v_id, p_project, v_id);
  end if;
  return v_id;
end; $$;
revoke all on function public.raise_defect(uuid,text,text,text,text,text,text,uuid,uuid,date,uuid) from public,anon;
grant execute on function public.raise_defect(uuid,text,text,text,text,text,text,uuid,uuid,date,uuid) to authenticated;

-- Legacy entrypoint: the same checked implementation owns all logic (grants on this signature are unchanged).
create or replace function public.raise_defect(p_project uuid, p_title text, p_description text, p_category text, p_severity text, p_trade text, p_reference text default null,
                                               p_pin uuid default null, p_assigned_to uuid default null, p_due date default null)
returns uuid language sql security invoker set search_path='' as $$
  select public.raise_defect(p_project, p_title, p_description, p_category, p_severity, p_trade, p_reference, p_pin, p_assigned_to, p_due, null::uuid);
$$;

create function public.report_field_problem(p_pin uuid, p_item uuid, p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare pn public.pins; item_name text; problem text:=btrim(coalesce(p_note,'')); member record;
begin
  select * into pn from public.pins where id=p_pin;
  if pn.id is null or auth.uid() is null or not public.can_work_on_pin(p_pin) then raise exception 'Only the Foreman assigned to this work can report a field problem on it'; end if;
  if pn.category='note' then raise exception 'Choose a work pin, not a note'; end if;
  if char_length(problem) not between 5 and 1000 then raise exception 'Describe the problem (5 to 1000 characters)'; end if;
  if p_item is not null then
    select text into item_name from public.pin_checklist_items where id=p_item and pin_id=p_pin and project_id=pn.project_id;
    if not found then raise exception 'Select a checklist item belonging to this work pin'; end if;
  end if;
  if (select count(*) from public.pin_events where actor_id=auth.uid() and kind='comment' and note like 'Field problem:%' and created_at>now()-interval '1 day')>=20 then
    raise exception 'You have reported many field problems today. Please wait for the Engineer'; end if;
  insert into public.pin_events(pin_id,project_id,kind,note)
    values(p_pin,pn.project_id,'comment',left('Field problem: '||case when item_name is not null then '['||item_name||'] ' else '' end||problem,2000));
  for member in select pm.user_id from public.project_members pm where pm.project_id=pn.project_id and pm.member_role='engineer' and pm.user_id is distinct from auth.uid() loop
    perform public.notify_user(member.user_id,'pin.problem','Field problem: '||left(pn.title,100),left(case when item_name is not null then item_name||': ' else '' end||problem,200),
      '/engineer/annotation?project='||pn.project_id||'&sheet='||pn.blueprint_id||'&pin='||pn.id||'&pintab=activity',pn.project_id,pn.id);
  end loop;
end; $$;
revoke all on function public.report_field_problem(uuid,uuid,text) from public,anon;
grant execute on function public.report_field_problem(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';

-- Optional issue-to-checklist link with the exact label snapshotted when the observation is logged.
-- CLI-created local filename aligned to hosted migration version 20261019101438 after deployment.
-- Existing pin-level observations remain unlinked; never infer a checklist item from their text.
alter table public.site_issue_reports
  add column checklist_item_id uuid references public.pin_checklist_items(id) on delete set null,
  add column checklist_name text check (checklist_name is null or char_length(btrim(checklist_name)) between 3 and 300),
  add constraint site_issue_checklist_name_required check(checklist_item_id is null or checklist_name is not null);
create index site_issue_reports_checklist on public.site_issue_reports(checklist_item_id) where checklist_item_id is not null;

-- No default on the new sixth parameter: old five-argument calls stay unambiguous for SQL and PostgREST.
create function public.log_site_issue(p_id uuid,p_pin uuid,p_severity text,p_description text,p_photos jsonb,p_checklist_item uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; existing public.site_issue_reports; item_name text;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or auth.uid() is null or not public.can_edit_blueprints(pn.project_id) then raise exception 'Only the project Engineer can log a site issue'; end if;
  select * into existing from public.site_issue_reports where id=p_id;
  if existing.id is not null then
    if existing.pin_id=p_pin and existing.raised_by=auth.uid() then return existing.id; end if;
    raise exception 'That issue request ID is already in use';
  end if;
  if pn.category='note' then raise exception 'Choose a work pin, not a note'; end if;
  if pn.status='verified' then raise exception 'Reopen completed work on the plan before logging an issue'; end if;
  if p_checklist_item is not null then
    select text into item_name from public.pin_checklist_items where id=p_checklist_item and pin_id=p_pin and project_id=pn.project_id;
    if not found then raise exception 'Select a checklist item belonging to this work pin'; end if;
  end if;
  insert into public.site_issue_reports(id,pin_id,project_id,checklist_item_id,checklist_name,description,severity,raised_by)
    values(p_id,p_pin,pn.project_id,p_checklist_item,item_name,btrim(p_description),p_severity,auth.uid());
  update public.pins set status='issue',severity=p_severity where id=p_pin;
  insert into public.pin_events(pin_id,project_id,kind,note)
    values(p_pin,pn.project_id,'comment','Issue: '||case when item_name is not null then '['||item_name||'] ' else '' end||btrim(p_description));
  perform public.insert_site_issue_photos(p_id,p_photos);
  return p_id;
end; $$;
revoke all on function public.log_site_issue(uuid,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.log_site_issue(uuid,uuid,text,text,jsonb,uuid) to authenticated;

-- Legacy entrypoint is now an invoker wrapper: the same checked implementation owns all mutation logic.
create or replace function public.log_site_issue(p_id uuid,p_pin uuid,p_severity text,p_description text,p_photos jsonb default '[]') returns uuid
language sql security invoker set search_path='' as $$
  select public.log_site_issue(p_id,p_pin,p_severity,p_description,p_photos,null::uuid);
$$;
revoke all on function public.log_site_issue(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.log_site_issue(uuid,uuid,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';

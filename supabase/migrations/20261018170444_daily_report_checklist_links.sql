-- Daily report linked work: each link is a work pin and the checklist item (work item) worked on that day, instead of
-- planned / actual quantities. Shape: [{ "pin_id": uuid, "item_id": uuid | null }]. The item must belong to that pin and is
-- required when the pin has checklist items. Validated only when the links change, so an Engineer review of a submitted report
-- never fails because a pin gained checklist items later. No live report had linked work when this was written.
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
  if tg_op='INSERT' or new.linked_work is distinct from old.linked_work then
    for link in select * from jsonb_array_elements(new.linked_work) loop
      if jsonb_typeof(link)<>'object' or exists(select 1 from jsonb_object_keys(link) k where k not in ('pin_id','item_id')) then
        raise exception 'Linked work keeps only the work pin and its checklist item'; end if;
      if not exists(select 1 from public.pins where id=(link->>'pin_id')::uuid and project_id=new.project_id and category<>'note') then raise exception 'Linked work must belong to this project'; end if;
      if link->>'item_id' is not null then
        if not exists(select 1 from public.pin_checklist_items where id=(link->>'item_id')::uuid and pin_id=(link->>'pin_id')::uuid) then
          raise exception 'Choose a checklist item of the linked work pin'; end if;
      elsif exists(select 1 from public.pin_checklist_items where pin_id=(link->>'pin_id')::uuid) then
        raise exception 'Choose the checklist item worked on for each linked work pin';
      end if;
    end loop;
  end if;
  if new.status='submitted' and (tg_op='INSERT' or old.status='draft') then
    if char_length(btrim(new.work_done))<5 then raise exception 'Describe the work done before submitting'; end if;
    new.submitted_at:=now(); new.revision:=new.revision+1; new.review_state:='pending';
  elsif new.status='draft' then new.submitted_at:=null;
  end if;
  new.updated_at:=now(); return new;
end; $$;

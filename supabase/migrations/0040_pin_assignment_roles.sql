-- BuildTrack 0040: project membership is separate from pin-level work assignment.
--   * Admin / Super Admin: create projects, choose the team (project_members), upload sheets and revisions, delete sheets.
--     They read everything on their projects but no longer edit annotations or pins, assign work, run inspections or verify.
--   * Engineer (active, assigned to the project): pins, annotations, checklists, QA, assignment of each pin to a Foreman,
--     verification. Cannot change project membership (unchanged: projects.manage only).
--   * Foreman (active, assigned to the project): works only on pins assigned to them: progress reports, checklist ticks,
--     one remark per checklist item, photos (for the pin or for one checklist item). Cannot create pins, reassign or verify.
--   * Assignment: only an active Engineer of the project may set or change pins.assigned_to; the new assignee must be an
--     active Foreman who is a member of the same project. Every change is written to the timeline as kind 'assigned' with the
--     previous and new assignee, who did it and when (pins.assigned_by / assigned_at hold the latest). Earlier reports,
--     checklist ticks and photos stay where they are. When a Foreman leaves a project, their unfinished pins become unassigned.
--   * Checklist evidence: only the assigned Foreman ticks items, writes remarks and uploads photos (Engineers build the
--     checklist but never fill it in). An item can only be marked done once the Foreman uploaded a photo for it (a remark
--     is optional), and work can only be sent for review once every checklist item is done.
--   * Verification: an Engineer can verify only when every checklist item is done and QA is clear (no open inspection,
--     the latest completed inspection did not fail, no open NCR on the pin), the same checks the review screen shows.
-- All rules live in the database (policies, triggers, functions), so they hold for direct API calls too.
-- Requires 0001-0039. Applied through the BUILDTRACK_MIGRATIONS connector.

-- ---------------------------------------------------------------- who may do what
-- Engineering work on a project (pins, annotations, checklists, layers, QA, reopening reports, deciding client reports):
-- an ACTIVE Engineer who is a member of the project. Admins no longer pass (0009 let blueprints.manage in).
-- Every existing caller (policies and functions from 0010-0039) picks up the new rule.
create or replace function public.can_edit_blueprints(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    join public.profiles p on p.id = m.user_id
    where m.project_id = pid and m.user_id = auth.uid() and m.member_role = 'engineer'
      and p.role = 'engineer' and p.status = 'active');
$$;

-- Sheet files (upload a sheet, a new revision, rename): admins with blueprints.manage and the project's Engineers.
create function public.can_upload_blueprints(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('blueprints.manage') or public.can_edit_blueprints(pid);
$$;

-- Field reporting on a project (comments, daily reports, QA requests and corrections): active Engineers and Foremen of
-- the project. Admins no longer pass (0010 let blueprints.manage in).
create or replace function public.can_report_on_project(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    join public.profiles p on p.id = m.user_id
    where m.project_id = pid and m.user_id = auth.uid() and m.member_role in ('engineer', 'foreman')
      and p.role = m.member_role and p.status = 'active');
$$;

-- Field work on ONE pin (tick its checklist, write remarks, upload photos): ONLY the active Foreman it is assigned to.
-- Engineers build the checklist and approve; they do not fill it in (their own inspection photos go to QA).
create function public.can_work_on_pin(p_pin uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pins pn
    where pn.id = p_pin and pn.assigned_to = auth.uid()
      and exists (
        select 1 from public.project_members m join public.profiles p on p.id = m.user_id
        where m.project_id = pn.project_id and m.user_id = auth.uid() and m.member_role = 'foreman'
          and p.role = 'foreman' and p.status = 'active'));
$$;

revoke execute on function public.can_upload_blueprints(uuid), public.can_work_on_pin(uuid) from public, anon;
grant execute on function public.can_upload_blueprints(uuid), public.can_work_on_pin(uuid) to authenticated;

-- ---------------------------------------------------------------- sheets: admins keep upload rights
drop policy "add blueprints" on public.blueprints;
create policy "add blueprints" on public.blueprints
  for insert to authenticated with check (public.can_upload_blueprints(project_id));
drop policy "edit blueprints" on public.blueprints;
create policy "edit blueprints" on public.blueprints
  for update to authenticated
  using (public.can_upload_blueprints(project_id)) with check (public.can_upload_blueprints(project_id));
drop policy "add revisions" on public.blueprint_revisions;
create policy "add revisions" on public.blueprint_revisions
  for insert to authenticated with check (public.can_upload_blueprints(project_id));
drop policy "blueprint files: upload" on storage.objects;
create policy "blueprint files: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blueprints' and public.storage_project_id(name) is not null
              and public.can_upload_blueprints(public.storage_project_id(name)));

-- The sheet scale and the base lock belong to the editor: Engineers only.
create function public.guard_blueprint_editor_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null
     and (new.scale_width_m is distinct from old.scale_width_m or new.base_locked is distinct from old.base_locked)
     and not public.can_edit_blueprints(old.project_id) then
    raise exception 'Only an Engineer assigned to this project can change the sheet scale or the base lock';
  end if;
  return new;
end;
$$;
create trigger blueprints_editor_fields before update on public.blueprints
  for each row execute function public.guard_blueprint_editor_fields();

-- ---------------------------------------------------------------- assignment
alter table public.pins
  add column assigned_by uuid references auth.users (id) on delete set null,
  add column assigned_at timestamptz;

alter table public.pin_events
  add column from_user uuid references public.profiles (id) on delete set null,
  add column to_user uuid references public.profiles (id) on delete set null;
alter table public.pin_events add constraint pin_events_users_only_on_assign
  check (kind = 'assigned' or (from_user is null and to_user is null));
alter table public.pin_events drop constraint pin_events_kind_check;
alter table public.pin_events add constraint pin_events_kind_check
  check (kind in ('created', 'moved', 'edited', 'status', 'comment', 'photo', 'checklist', 'photo_removed', 'assigned'));

-- Runs after pins_prepare (trigger names sort), so project_id is already the sheet's project.
create function public.guard_pin_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  f public.profiles;
begin
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    new.assigned_by := old.assigned_by;
    new.assigned_at := old.assigned_at;
    return new;
  end if;
  if tg_op = 'INSERT' and new.assigned_to is null then
    new.assigned_by := null;
    new.assigned_at := null;
    return new;
  end if;
  -- Allowed without an Engineer: the backend (no signed-in user), and the automatic unassignment when a Foreman leaves the
  -- project (an update issued by another trigger that only clears the assignee).
  if me is not null and not (pg_trigger_depth() > 1 and new.assigned_to is null)
     and not public.can_edit_blueprints(new.project_id) then
    raise exception 'Only an Engineer assigned to this project can assign or reassign its work';
  end if;
  if tg_op = 'UPDATE' and old.status = 'verified' then
    raise exception 'Verified work keeps the Foreman who did it; reopen the pin before reassigning it';
  end if;
  if new.assigned_to is not null then
    select * into f from public.profiles where id = new.assigned_to;
    if f.id is null or f.status <> 'active' or f.role is distinct from 'foreman' or not exists (
         select 1 from public.project_members
         where project_id = new.project_id and user_id = new.assigned_to and member_role = 'foreman') then
      raise exception 'A pin can only be assigned to an active Foreman on this project';
    end if;
  end if;
  new.assigned_by := me;
  new.assigned_at := now();
  return new;
end;
$$;
create trigger pins_prepare_assignment before insert or update on public.pins
  for each row execute function public.guard_pin_assignment();

-- Timeline: assignment changes get their own entry (previous + new assignee) instead of a plain 'edited'.
create or replace function public.record_pin_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, to_status, note)
    values (new.id, new.project_id, auth.uid(), 'created', new.status, new.title);
    if new.assigned_to is not null then
      insert into public.pin_events (pin_id, project_id, actor_id, kind, to_user)
      values (new.id, new.project_id, auth.uid(), 'assigned', new.assigned_to);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, from_status, to_status)
    values (new.id, new.project_id, auth.uid(), 'status', old.status, new.status);
  end if;
  if new.x is distinct from old.x or new.y is distinct from old.y then
    insert into public.pin_events (pin_id, project_id, actor_id, kind)
    values (new.id, new.project_id, auth.uid(), 'moved');
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, from_user, to_user)
    values (new.id, new.project_id, auth.uid(), 'assigned', old.assigned_to, new.assigned_to);
  end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.category is distinct from old.category or new.discipline is distinct from old.discipline
     or new.due_date is distinct from old.due_date or new.severity is distinct from old.severity then
    insert into public.pin_events (pin_id, project_id, actor_id, kind)
    values (new.id, new.project_id, auth.uid(), 'edited');
  end if;
  return new;
end;
$$;

-- A Foreman removed from a project hands back their unfinished pins (verified work keeps its Foreman).
create function public.unassign_departed_foreman()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.pins set assigned_to = null
  where project_id = old.project_id and assigned_to = old.user_id and status <> 'verified';
  return old;
end;
$$;
create trigger project_members_unassign after delete on public.project_members
  for each row when (old.member_role = 'foreman') execute function public.unassign_departed_foreman();

-- Foremen report progress only on pins assigned to them (unassigned pins are no longer open to every Foreman).
create or replace function public.report_pin_progress(p_pin uuid, p_status public.pin_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pn public.pins;
begin
  select * into pn from public.pins where id = p_pin;
  if pn.id is null then
    raise exception 'Pin not found';
  end if;
  if not (public.is_active() and exists (
        select 1 from public.project_members m join public.profiles p on p.id = m.user_id
        where m.project_id = pn.project_id and m.user_id = auth.uid() and m.member_role = 'foreman' and p.role = 'foreman')) then
    raise exception 'Only a Foreman assigned to this project can report progress';
  end if;
  if pn.assigned_to is distinct from auth.uid() then
    raise exception 'This work is not assigned to you. Ask the Engineer to assign it first';
  end if;
  if p_status not in ('in_progress', 'for_review') then
    raise exception 'Foremen can only report In progress or For review';
  end if;
  if pn.status = 'verified' then
    raise exception 'A verified pin can only be changed by an Engineer';
  end if;
  if p_status = 'for_review' and exists (select 1 from public.pin_checklist_items where pin_id = p_pin and not done) then
    raise exception 'Complete every checklist item (each with its photo) before sending the work for review';
  end if;
  update public.pins set status = p_status where id = p_pin;
  if p_note is not null and char_length(btrim(p_note)) > 0 then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, note)
    values (p_pin, pn.project_id, auth.uid(), 'comment', left(btrim(p_note), 2000));
  end if;
end;
$$;

-- ---------------------------------------------------------------- checklist evidence (per item)
alter table public.pin_checklist_items
  add column remark text check (remark is null or char_length(remark) <= 1000),
  add column remark_by uuid references auth.users (id) on delete set null,
  add column remark_at timestamptz;

alter table public.pin_photos
  add column checklist_item_id uuid references public.pin_checklist_items (id) on delete set null;
create index pin_photos_checklist_item_idx on public.pin_photos (checklist_item_id) where checklist_item_id is not null;

create or replace function public.prepare_checklist_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pn public.pins;
begin
  if tg_op = 'INSERT' then
    select * into pn from public.pins where id = new.pin_id;
    if pn.id is null then
      raise exception 'Pin not found';
    end if;
    new.project_id := pn.project_id;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.position := coalesce((select max(position) + 1 from public.pin_checklist_items where pin_id = new.pin_id), 0);
    new.done := false;
    new.done_by := null;
    new.done_at := null;
    new.remark := null;
    new.remark_by := null;
    new.remark_at := null;
  else
    -- Foremen (and anyone who is not an Engineer of the project) may only tick / untick and write the remark.
    if not public.can_edit_blueprints(old.project_id)
       and (new.text <> old.text or new.pin_id <> old.pin_id or new.position <> old.position) then
      raise exception 'Only an Engineer can change the checklist items; you can tick them off';
    end if;
    -- Filling the checklist in is field work: only the Foreman assigned to the pin (Engineers approve, they do not tick).
    if auth.uid() is not null and not public.can_work_on_pin(old.pin_id)
       and (new.done is distinct from old.done or nullif(btrim(coalesce(new.remark, '')), '') is distinct from old.remark) then
      raise exception 'Only the Foreman assigned to this pin can tick items or add evidence';
    end if;
    new.pin_id := old.pin_id;
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.remark := nullif(btrim(coalesce(new.remark, '')), '');
    if new.remark is distinct from old.remark then
      new.remark_by := auth.uid();
      new.remark_at := now();
    else
      new.remark_by := old.remark_by;
      new.remark_at := old.remark_at;
    end if;
    if new.done is distinct from old.done then
      if new.done and not exists (select 1 from public.pin_photos where checklist_item_id = old.id) then
        raise exception 'Upload a photo for this checklist item before marking it done';
      end if;
      new.done_by := case when new.done then auth.uid() end;
      new.done_at := case when new.done then now() end;
    else
      new.done_by := old.done_by;
      new.done_at := old.done_at;
    end if;
  end if;
  return new;
end;
$$;

-- A photo linked to a checklist item must belong to that item's pin.
create function public.check_pin_photo_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.checklist_item_id is not null and not exists (
       select 1 from public.pin_checklist_items where id = new.checklist_item_id and pin_id = new.pin_id) then
    raise exception 'That checklist item belongs to another pin';
  end if;
  return new;
end;
$$;
create trigger pin_photos_item before insert on public.pin_photos
  for each row execute function public.check_pin_photo_item();

revoke execute on function public.guard_blueprint_editor_fields(), public.guard_pin_assignment(), public.record_pin_events(),
  public.unassign_departed_foreman(), public.prepare_checklist_item(), public.check_pin_photo_item()
  from public, anon, authenticated;

-- Checklist rows: the Engineer edits the wording, the pin's own Foreman ticks / writes remarks (the trigger splits the two).
-- Photos: only the pin's own Foreman.
drop policy "tick or edit checklist items" on public.pin_checklist_items;
create policy "tick or edit checklist items" on public.pin_checklist_items
  for update to authenticated
  using (public.can_edit_blueprints(project_id) or public.can_work_on_pin(pin_id))
  with check (public.can_edit_blueprints(project_id) or public.can_work_on_pin(pin_id));

-- ---------------------------------------------------------------- verification gate
-- The Engineer approves only work whose checklist the Foreman completed and whose QA is clear. Same checks as the review
-- screen (pinQualityWarning in src/lib/qaModel.ts): no open inspection, the latest completed inspection did not fail,
-- no open NCR on the pin. A new pin can never start as verified.
create function public.guard_pin_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  latest text;
begin
  -- The backend (no signed-in user: seeds, service jobs) is trusted, like the other guards in this file.
  if auth.uid() is null or new.status <> 'verified' or (tg_op = 'UPDATE' and old.status = 'verified') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'A new pin cannot start as verified';
  end if;
  if exists (select 1 from public.pin_checklist_items where pin_id = new.id and not done) then
    raise exception 'Every checklist item must be completed by the Foreman before the work can be verified';
  end if;
  if exists (select 1 from public.qa_inspections where pin_id = new.id and status in ('requested', 'in_progress')) then
    raise exception 'An inspection of this pin is still open; complete or cancel it before verifying';
  end if;
  select status into latest from public.qa_inspections
  where pin_id = new.id and status in ('passed', 'conditional', 'failed') order by number desc limit 1;
  if latest = 'failed' then
    raise exception 'The latest inspection of this pin failed; it must pass a re-inspection before the work can be verified';
  end if;
  if exists (select 1 from public.qa_defects where pin_id = new.id and status <> 'closed') then
    raise exception 'This pin still has open defects (NCRs); close them before verifying';
  end if;
  return new;
end;
$$;
create trigger pins_verify_gate before insert or update of status on public.pins
  for each row execute function public.guard_pin_verification();
revoke execute on function public.guard_pin_verification() from public, anon, authenticated;
drop policy "add photos" on public.pin_photos;
create policy "add photos" on public.pin_photos
  for insert to authenticated with check (public.can_work_on_pin(pin_id));

-- Timeline with the names of the previous and new assignee (return type changes, so the function is re-created).
drop function public.get_pin_timeline(uuid);
create function public.get_pin_timeline(p_pin uuid)
returns table (
  id bigint, created_at timestamptz, kind text,
  from_status public.pin_status, to_status public.pin_status,
  note text, actor_name text, actor_role public.app_role,
  from_name text, to_name text
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.created_at, e.kind, e.from_status, e.to_status, e.note,
         coalesce(p.full_name, p.email, 'System'), p.role,
         case when e.from_user is not null then coalesce(f.full_name, f.email) end,
         case when e.to_user is not null then coalesce(t.full_name, t.email) end
  from public.pin_events e
  left join public.profiles p on p.id = e.actor_id
  left join public.profiles f on f.id = e.from_user
  left join public.profiles t on t.id = e.to_user
  where e.pin_id = p_pin
    and public.can_view_project(e.project_id)
    and not public.is_project_client(e.project_id)
  order by e.id;
$$;
revoke execute on function public.get_pin_timeline(uuid) from public, anon;
grant execute on function public.get_pin_timeline(uuid) to authenticated;

-- ---------------------------------------------------------------- QA: the Foreman's photo on each inspection checklist item
-- When a Foreman requests an inspection, the checklist is copied into the inspection items. While it is "requested", the
-- project's Foremen may upload a photo on each item (self-check evidence: the work is ready). During the inspection the rules
-- of 0025 apply unchanged. Same function as 0025 with the "requested" case added.
create or replace function public.check_qa_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  i_status text;
  d_status text;
  is_foreman boolean;
begin
  if tg_op = 'DELETE' then
    select status into i_status from public.qa_inspections where id = coalesce(old.inspection_id, (select inspection_id from public.qa_inspection_items where id = old.item_id));
    select status into d_status from public.qa_defects where id = old.defect_id;
    if i_status in ('passed', 'conditional', 'failed') or d_status = 'closed' then
      raise exception 'Evidence of a completed inspection or a closed defect cannot be removed';
    end if;
    return old;
  end if;
  new.uploaded_by := auth.uid();
  if public.storage_project_id(new.path) is distinct from new.project_id then
    raise exception 'The file must be stored inside the project folder';
  end if;
  is_foreman := exists (
    select 1 from public.project_members m join public.profiles p on p.id = m.user_id
    where m.project_id = new.project_id and m.user_id = auth.uid() and m.member_role = 'foreman' and p.role = 'foreman' and p.status = 'active');
  if new.item_id is not null then
    select i.status into i_status from public.qa_inspection_items it join public.qa_inspections i on i.id = it.inspection_id where it.id = new.item_id and it.project_id = new.project_id;
    if not (i_status = 'in_progress' or (i_status = 'requested' and is_foreman)) then
      raise exception 'Photos can only be added while the inspection is requested (Foremen) or in progress';
    end if;
  end if;
  if new.inspection_id is not null then
    select status into i_status from public.qa_inspections where id = new.inspection_id and project_id = new.project_id;
    if not (i_status = 'in_progress' or (i_status = 'requested' and is_foreman)) then
      raise exception 'Photos can only be added while the inspection is requested (Foremen) or in progress';
    end if;
  end if;
  if new.defect_id is not null then
    select status into d_status from public.qa_defects where id = new.defect_id and project_id = new.project_id;
    if d_status is null or d_status = 'closed' then raise exception 'Photos cannot be added to a closed or unknown defect'; end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.check_qa_photo() from public, anon, authenticated;

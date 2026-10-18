# 0040: Project membership separate from pin assignment

| Field | Value |
|---|---|
| File | `supabase/migrations/0040_pin_assignment_roles.sql` |
| Applied | 2026-10-15, by the owner in the Supabase SQL Editor (wrapped in one transaction, then `notify pgrst, 'reload schema'`) |
| Depends on | 0003, 0009, 0010, 0014, 0017, 0020, 0025, 0033, 0039 |
| Status | **Applied**. Before: `pnpm test:sql` 304/304, `pnpm test:load` unchanged. Never edit this file again; add a new migration instead |
| Reversible | Yes (see Rollback; the new columns can stay, they are nullable) |

## Why
Admins assigned the team **and** could edit pins, assign Foremen to pins and verify work. Unassigned pins were open to every Foreman of the project. The workflow now separates the two levels:
1. Admin creates the project, assigns Engineer / Foremen / Client, uploads the sheets.
2. Engineer creates pins and checklists and designates one project Foreman per pin.
3. Foreman does the work, records checklist evidence, submits for review.
4. Engineer inspects, sends back or verifies; verified work feeds progress (formulas unchanged).

## What changed
- `can_edit_blueprints(pid)` now means **an active Engineer who is a member of the project** (no admin bypass). Every caller since 0010 (pins, annotations, checklists, layers, lock-all, QA inspections / NCR edit / verify, project checklists, reopen daily report, answer question, decide client report) picks this up.
- New `can_upload_blueprints(pid)` = `blueprints.manage` or the project's Engineer. Used by the sheet / revision insert, sheet update and the `blueprints` storage upload policies. Sheet deletion stays `blueprints.manage`.
- Trigger `blueprints_editor_fields`: only an Engineer of the project changes `scale_width_m` or `base_locked`.
- `can_report_on_project(pid)`: active Engineers and Foremen of the project only (the profile role must match the membership role). Admins can no longer comment, write daily reports, request inspections, raise or update NCRs.
- New `can_work_on_pin(pin)`: ONLY the active Foreman the pin is assigned to. Used for pin photos (insert) and checklist ticks / remarks. Engineers build and reword the checklist but never fill it in (the checklist trigger refuses their ticks and remarks); their own inspection photos go to QA.
- `report_pin_progress`: the caller must be the pin's assignee (an unassigned pin is closed to Foremen).
- Assignment trigger `pins_prepare_assignment` (`guard_pin_assignment`): any change of `assigned_to` needs an Engineer of the project; the assignee must be an active Foreman who is a member of the same project; a verified pin cannot be reassigned. Sets `pins.assigned_by` / `assigned_at`.
- Timeline: kind `assigned` with `from_user` / `to_user` (a check constraint keeps them empty on other kinds; users can still only insert comments). `get_pin_timeline` returns `from_name` / `to_name`. Assignment is no longer also logged as `edited`.
- Trigger `project_members_unassign`: when a Foreman leaves a project, their non-verified pins there are unassigned (logged as `assigned` with the admin as actor).
- Verification gate `pins_verify_gate` (`guard_pin_verification`): an Engineer can only set `verified` when every checklist item is done, no inspection of the pin is requested / in progress, the latest completed inspection did not fail, and no NCR on the pin is open (the same checks as `pinQualityWarning`). A new pin cannot start as verified. The backend (no signed-in user) is trusted.
- Checklist evidence: `pin_checklist_items.remark` (+ `remark_by`, `remark_at`), `pin_photos.checklist_item_id` (must be an item of the same pin). An item can only be marked done once the assigned Foreman uploaded a photo for it (the remark is optional). `report_pin_progress(..., 'for_review')` is refused while any checklist item is open.

- `check_qa_photo` (from 0025) re-created: photos on an inspection or its items are also allowed while the inspection is `requested`, for active Foremen of the project (self-check evidence before the engineer starts). Everything else in that function is unchanged.

## Security and RLS
| Action | Admin / Super Admin | Engineer (member) | Foreman (member) | Client |
|---|---|---|---|---|
| Project + membership | projects.manage | no | no | no |
| Upload sheet / revision | blueprints.manage | yes | no | no |
| Pins, annotations, checklist items, scale, base lock | no | yes | no | no |
| Assign / reassign a pin | no | yes | no | no |
| Report progress, tick, remark, pin photo | no | no (builds the checklist only) | only on pins assigned to them | no |
| Inspections, NCR verify, pin verify | no | yes (verify only when checklist complete + QA clear) | no | no |
| Read pins, photos, checklist, QA | yes (as before) | yes | yes | pins / photos / checklist only |

Read policies are unchanged (`99-rls-parity` still passes).

## Verification
```sql
select proname from pg_proc where proname in ('can_upload_blueprints','can_work_on_pin','guard_pin_assignment','unassign_departed_foreman','guard_blueprint_editor_fields','check_pin_photo_item');
select column_name from information_schema.columns where table_name = 'pins' and column_name in ('assigned_by','assigned_at');
select column_name from information_schema.columns where table_name = 'pin_checklist_items' and column_name like 'remark%';
select tgname from pg_trigger where tgname in ('pins_prepare_assignment','project_members_unassign','blueprints_editor_fields','pin_photos_item');
-- must be false for API roles
select has_function_privilege('authenticated', 'public.guard_pin_assignment()', 'execute');
```

Run by hand, so `supabase_migrations.schema_migrations` needs the tracking row (version `0040`, name `pin_assignment_roles`, checksum `ca3b7d78c9ed1922d57b7b7c7c6697913fd19998d07bae2a186d33803b0daea7`), otherwise `pnpm db:apply` would try to run it again.

## Rollback
```sql
drop trigger pins_prepare_assignment on public.pins;
drop trigger project_members_unassign on public.project_members;
drop trigger blueprints_editor_fields on public.blueprints;
drop trigger pin_photos_item on public.pin_photos;
-- then re-run the 0009 bodies of can_edit_blueprints and the 0010 bodies of can_report_on_project and report_pin_progress,
-- the 0020 body of record_pin_events, the 0014 body of prepare_checklist_item, the 0011 get_pin_timeline,
-- and restore the 0009 / 0010 / 0014 policies ("add blueprints", "edit blueprints", "add revisions",
-- "blueprint files: upload", "add photos", "tick or edit checklist items").
```
The new columns may stay (nullable, unused by the old code).

## Notes / known limits
- Existing pins keep their assignee; `assigned_by` / `assigned_at` are empty until the next change.
- Pins assigned before 0040 to someone who is no longer a project Foreman stay assigned until an Engineer reassigns them (the trigger only acts on future removals).
- A disabled or role-changed Foreman keeps their pins; they simply cannot report until reactivated or until the Engineer reassigns.
- Existing done checklist items stay done; the evidence rule applies when an item is ticked from now on.

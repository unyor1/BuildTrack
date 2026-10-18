# 2026-10-15: Project membership separate from pin assignment

Migration `0040_pin_assignment_roles.sql` (details: `sql/0040_pin_assignment_roles.md`). Applied 2026-10-15 by the owner in the SQL Editor.

Follow-up (UI only): checklist photos stay with their checklist item; the pin Photos tab, Photo Documentation and the client Site Logs gallery show progress photos only (`useProjectPhotos` filters `checklist_item_id is null`, `PinPhotos` without an item hides item photos).

## Rules
- Admin / Super Admin: projects, team membership, sheet and revision uploads, sheet deletion; read everything. No pin or annotation editing, no assignment, no inspections, no verification, no comments on pins.
- Engineer (active, member): pins, annotations, builds checklists, QA, assigns each pin to an active Foreman of the same project, verifies. Does not tick checklists or upload pin evidence. Can only verify when the checklist is complete and QA is clear (no open inspection, latest inspection not failed, no open NCR). Cannot change membership.
- Foreman (active, member): only pins assigned to them: uploads a photo on each checklist item (required before ticking; remark optional), progress reports, photos. Sending for review needs every checklist item done.
- Every assignment change is in the pin timeline (previous and new Foreman, who, when); evidence stays after reassignment.
- Enforced in the database (functions, triggers, policies), so direct API calls follow the same rules.

## App
- `BlueprintEditor` / `SelectedProjectWorkspace` / `EditorToolbar`: new `canUpload` (sheets, revisions) separate from `canEdit`. Admin `BlueprintUpload` opens the editor read-only with uploads. `canReport` no longer includes admins.
- Engineer verification queue: "Verify work" is disabled with the reason until the checklist is complete and QA is clear.
- `Inspector.canWorkOn` (assigned Foreman only) decides checklist / photo rights per pin; the foreman report box explains when work is not theirs; status stamps on someone else's pin are refused in the UI.
- `PinChecklist` now takes the pin. Every item has an **Upload** button (camera or gallery; the photos are linked to that item) for the assigned Foreman only, plus an evidence row (remark, and the item's photos via `PinPhotos checklistItemId`). Upload logic is shared in `usePhotoUpload` (compression, photo stamp, offline queue carries the item).
- Timeline shows "assigned / reassigned from X to Y"; the Inspector shows who assigned and when.
- Foreman dashboard and corrective-action list show only pins assigned to the Foreman (unassigned pins are no longer theirs).

- QA inspection requests: while an inspection is "requested", the project's Foremen upload a photo on each checklist item (`check_qa_photo` re-created in 0040; `InspectionDetail` `prepBy`, camera tile per item; the Foreman "Inspection Checklists" page explains it).

## Tests
- New `supabase/tests/99-pin-assignment.cases.mjs` (20 cases). `99-escalations` now seeds its verified pin by creating then verifying it.
- Updated fixtures in `30-pins`, `60-editor`, `80-editor-v2`, `99-evidence-lock`, `99-photo-stamp`: foremen now act on pins assigned to them; admin deletion of a pin is now refused by Row Level Security instead of the evidence trigger.
- `pnpm test:sql` 304/304, `pnpm test:lib` 79/79, `npx tsc --noEmit` clean, `pnpm test:load` timings unchanged.

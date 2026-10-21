# Connected zone progress and annotated site issues

## What changed

- **Progress by Zone** reads the project's real `pins`, `blueprints` and revision rows. It now displays database failures with Retry, supports manual refresh, listens for sheet/revision changes, and links to the exact sheet or its filtered Issue Register. No second, potentially conflicting progress table was introduced.
- **Issue Register** loads full, paginated issue history instead of silently truncating at 1,000 events. Its new observations, descriptions and photos are persistent database records. Status remains the work pin's single source of truth: Open (`issue`), Following up (returned/in progress or awaiting review) and Resolved (`verified`). Sending work back no longer makes it disappear from the register.
- Issue details open from the title or **Details / photos**. Legacy plan-marked issues retain their original timeline; they are not rewritten or fabricated as new reports.
- The assigned Foreman can open **Corrections > Site issues on your work > Details / photos**, including saved Engineer markup and the timeline. The Engineer retains write authority; clients and unrelated project users cannot read internal photo evidence.

## Photo workflow

1. Engineer selects a project, opens **Issue Register > Log an issue**, chooses a work pin and writes the problem description.
   The added **Checklist item** selector can narrow the observation to one of that pin's work items; whole-pin issues remain supported. See [checklist selection/filtering](2026-10-19-issue-checklist-filter.md).
2. **Add photos** accepts multiple JPEG, PNG or WebP originals, up to 40 per observation and 8 MB each.
3. **Edit / annotate** supports text, lines, arrows, rectangles, ellipses, freehand, selection/dragging, color, stroke, text size, undo/redo, zoom and Fit. Original bytes are not flattened or overwritten.
4. **Log issue** commits the pin status, observation, timeline and all photo records together. Failed upload/commit attempts clean up unattached uploads; storage rules prevent deleting an original that was already committed.
5. Existing issue details also allow **Add photos** and **Edit markup**. Edits use a version check; a stale editor cannot overwrite someone else's changes. **Photo history** opens older versions, loading older batches on demand. Captions, authors and upload/edit timestamps remain visible.
6. **View original** temporarily hides the annotation layer without deleting it. Completed work locks photo additions and edits until it is reopened through the existing Engineer workflow.

Issue-finding photos do not replace the Foreman's correction/QA evidence and never count toward checklist completion. No QA acceptance gates were bypassed.

## Database and access controls

Hosted migration: `20261019095439_site_issue_photos.sql` (local CLI-created filename aligned to the applied hosted version).

- New tables: `site_issue_reports`, `site_issue_photos`, `site_issue_photo_revisions` (RLS enabled, read access scoped to project staff; direct authenticated writes revoked).
- New private Storage bucket `issue-photos`: path is project/work-pin/random filename; original files must exist and belong to the uploader before attachment. No authenticated overwrite or deletion of attached originals is allowed.
- Checked RPCs `log_site_issue`, `add_site_issue_photos`, `save_site_issue_photo`, `return_site_issue`; server derives the project from the pin/report. Existing pin/QA guards remain authoritative.
- `insert_site_issue_photos` is an invoker-only internal helper, revoked from API roles. The scoped public functions retain explicit signed-in/project-Engineer checks. `site_issue_photo_in_use` is the narrow definer helper needed to keep originals undeletable even when RLS hides their records after access revocation.
- Realtime publication includes the new tables plus `blueprints`/`blueprint_revisions`. Profiles, identity and audit tables remain unpublished. Added a partial project/status-event index for the register history query.
- Request-sequence guards clear old project data and reject stale sheet/pin fetch responses after switching projects.

## Verification

- Full `pnpm check`: TypeScript, 105 library tests, comparison interactions, actual issue-editor pointer/rendering/save interactions, 377 SQL tests, production build.
- SQL coverage: multi-photo atomic logging, retry idempotence, rollback on invalid/missing/wrong-pin files, markup validation, role isolation, direct-write denial, original protection after disabling the uploader, photo revisions, stale-save rejection, append/cap handling, atomic return, and unchanged QA completion gates.
- Live schema/storage/RLS/privilege/publication checks passed. Existing data stayed at 4 pins and 44 events, with the same complete pin-row fingerprint. No existing records were backfilled or altered.
- Rolled-back live checks exercised Engineer logging, shared pin progress, atomic return, and assigned Foreman visibility (temporary assignment also rolled back). No test reports or notifications were left behind. Editor handlers and Storage-policy SQL were tested without leaving files in the live bucket; a real browser-to-Storage file upload has not been exercised.
- Security advisors retain the existing unrelated findings. The signed-in definer-RPC notice count increases from 81 to 86 for the five deliberately checked entrypoints/helpers above; no new public/anonymous execution or unprotected-table finding. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Deployment boundary

Database migration is already applied; do not paste it again. Application code is updated locally for hot reload and remains uncommitted/unpushed alongside the previous Philippine-standards changes.

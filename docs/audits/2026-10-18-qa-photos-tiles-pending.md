# QA photo viewer, request tiles, and pending-pin enforcement

## Delivered

- Clicking either comparison photo or a QA/work evidence thumbnail opens a shared viewer with 100–300% zoom, Fit, scroll-to-pan, and metadata: upload/capture timestamps, uploader when available, caption, file, site/time stamp, and request/checklist context. Invalid Engineer previews remain blocked; the new viewer does not bypass Storage or UI eligibility checks.
- Before/after comparison retains the original draggable overlay divider. A click enlarges the entire comparison, not one photo; dragging changes the divider without opening a dialog. The enlarged view keeps both layers aligned, shares the divider position with the preview, supports 100–300% zoom and Fit, and shows details for both photos. Full source photo metadata travels with each side, including its eligibility flag.
- Original QA requests and resubmissions now appear as compact responsive tiles. Clicking a tile opens that request's separate details dialog, immutable remarks/photos, original timestamps, and bounded timeline. Photo grid columns respond to container width rather than the desktop viewport, preventing narrow-sidebar letter stacking. Snapshot photo details are labelled historical rather than current checklist state.
- User clarified the pending rule: block only another request for the same work pin. Other pins and independent unlinked stage inspections remain available.

## Database migration

`supabase/migrations/20261018142455_qa_pending_pin_enforcement.sql` applied through the Supabase connector on 2026-10-18.

Existing row-lock/trigger checks were retained and strengthened with a unique partial index on open inspections per non-null pin. A project-authorized read-only `pin_qa_submission_problem` preflight now supplies the same pending/acceptance blocker to item, batch, stage and reinspection flows. Stage, legacy and reinspection RPCs recheck under the pin lock; existing checklist RPC checks and the unique index protect stale pages and concurrent attempts. No global Foreman/project-wide lock was added. Existing history and actual review outcomes were not changed.

The helper is executable by authenticated users only, returns no out-of-project details, and cannot change records. Existing checked RPC privileges and RLS remain intact. No synthetic business acceptance or automatic NCR closure was performed.

## Validation

- TypeScript and production build passed; 91 library tests and 351 SQL tests passed.
- Added SQL coverage for every duplicate request route in requested/in-progress states, pending item acceptance, outsider/anonymous access, independent pins, cancellation/retry, and index enforcement without the advisory trigger.
- Live rollback-only smoke validated same-pin refusal, other-pin independence, cancellation, item QA, verification and completion. Existing repeated-resubmission smoke also passed. Zero rollback test pins remained and zero duplicate open pins existed after verification.
- Advisor categories unchanged: the one new signed-in helper is intentional and authorization checked ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). Existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) is unchanged.
- Browser inventory returned no connected apps/browsers. No signed-in visual walkthrough is claimed.

Comparison correction: `pnpm test:comparison` renders the real comparison canvas and checks both image layers, overlay clipping, divider position, click-versus-drag detection and fit sizing. It passed alongside TypeScript, the build and 91 library tests; this frontend correction requires no migration.

## Checklist-name organization

QA work histories now group original requests and retries under work checklist names (for example FLOOR and WALL), with an All checklist names filter. Shared requests appear in their relevant groups using the same inspection reference; opening a grouped tile limits photos/remarks to that group's submitted item IDs. The full request timeline remains explicitly shared. Retry numbering follows prior submissions of the same item IDs, including renamed items, rather than incorrectly treating every item in a mixed batch as a retry.

QA/QC → Inspections now includes a checklist-name dropdown and searches the names alongside work titles and IR references. CSV export follows the active filters and includes a Checklist item(s) column. Submission evidence is separated by name, with unmatched historical photos retained in an Other historical work evidence section. Partial legacy snapshots do not misclassify unfinished items as submitted reports.

The project-scoped submission-name reader pages through existing snapshots, refreshes on new submissions, rejects stale loads after project changes, and respects the existing staff/project RLS; no schema or permission changes were made. A live read under the authenticated Foreman role confirmed three accessible reports with checklist metadata. No business data was changed.

Checks: TypeScript/build, 94 library tests (including grouping, batch scoping, retry numbering, selected IDs and case/spacing), and comparison rendering tests passed. Authenticated visual browser testing remains unavailable in this session.

Live validation source: `docs/audits/sql/20261018-pending-pin-smoke.sql` (requires explicit BEGIN / ROLLBACK).

Rollback: use a new forward migration if rules change; preserve audit snapshots and pending inspection records. Do not delete requests to make a uniqueness conflict disappear.

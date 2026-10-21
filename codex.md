# BuildTrack development handover

Updated: 2026-10-21.

Read this alongside `AGENTS.md`, `README.md` and the task-specific audit in `docs/audits/`. This file records current project decisions; it is not an application entrypoint or a database migration. Check the implementation and tests before treating an older document as current behavior. In particular, older handover text mentioning a required Ready tick or a separate Accept action is outdated.

## Project and development

- Frontend: React 19, TypeScript, Vite 8 and Tailwind CSS v4.
- Backend services: Supabase PostgreSQL, Auth, private Storage, Realtime and Edge Functions. Brevo sends email; it is not the application backend.
- Start with the paths in `AGENTS.md`. Role pages are in `src/pages/<Role>/`; shared application navigation/layout lives in `src/components/shell/`.
- The development server is already running on the configured port, normally 8443. Do not start a duplicate server.
- Preserve unrelated working-tree changes. Never commit credentials, `.env` secrets, private keys, local caches or generated build output.
- Use existing shared components and styles. Keep UI wording consistent between Engineer, Foreman and Client.

## Current QA workflow

1. The Engineer creates checklist items and supplies their inspection criteria/tests. Requirements should describe the actual work item, not a broad trade label or invented standard clause.
2. The assigned Foreman opens an item, adds its photos/remarks and submits that item directly for QA. No separate Ready tick is required.
3. The Engineer inspects against the recorded criteria. Failed findings create linked NCRs; corrections and re-inspections remain attached to the same work item.
4. After QA passes and linked NCRs are closed, the Engineer explicitly chooses **Complete checklist**. Passing QA or closing an NCR must not automatically perform this manual action.
5. The work pin completes only when all checklist items and the applicable pin-level QA/NCR prerequisites are clear.

Important constraints:

- There is no separate user-facing Accept status/action. The summary rail is **Submitted -> Passed -> Completed**. Legacy `review_status='verified'` storage and `review_checklist_item` with `p_accept=true` remain implementation details; do not casually rename stored values or rewrite history.
- A pending request for one checklist item must not block another eligible item on the same pin. Do not restore a blanket whole-pin pending block. Duplicate active requests for the same item and guarded legacy/stage routes remain subject to server checks.
- The Engineer must be able to add eligible checklist items while other work awaits QA; preserve existing evidence and completion safeguards.
- Every original request/resubmission keeps its own immutable photos, remarks, timestamps, result and timeline. New correction evidence must not overwrite old submissions.
- Evidence and Corrections & NCRs tabs must show actual linked records, with explicit empty/loading/error states. Link by permanent item IDs, not just names.
- Preserve the original-versus-latest comparison. Clicking for a larger view must not replace/remove comparison functionality or its details.
- Engineer/Foreman boards put **All** last. Stage/hold-point request panels were removed from these boards, not from historical data or database completion checks. Existing blocked inspections remain accessible through the QA register.
- **For review** belongs to checklist QA presentation, not a displayed pin-level status. Keep underlying status/authorization logic intact.

Relevant files: `src/lib/workItemModel.ts`, `src/lib/workItem.ts`, `src/components/qa/WorkItemWorkspace.tsx`, `WorkItemBoard.tsx`, `SubmittedEvidence.tsx` and `WorkSubmissionEvidence.tsx`.

## Reports, progress, assignments and issues

- Site Logs reads real Foreman Daily Progress Reports. QA activity does not automatically create a daily report.
- Submitted reports retain linked pins/checklists and their historical snapshots. Older reports outside the editing window remain available read-only.
- Progress uses completed work pins, excluding notes. Checklist completion contributes to completing its pin; do not silently substitute a checklist-percentage or quantity-weighted progress formula.
- Progress by Zone and Assignment Board must use the same project-scoped pin records. Assignment lists include completed work by default and support assigned/unassigned, sheet and status filtering.
- Confirm assignment writes on the server, guard concurrent/stale saves and reload canonical records. Never show an optimistic reassignment as successfully saved after a rejected write.
- Project changes must discard late responses from the previous project. Preserve pagination and reconnect/live-update handling rather than relying on a first-page query.
- Engineer site issues link to a work pin and optionally its checklist item. Assigned Foremen read the same issue and preserved annotated evidence; do not create a disconnected duplicate issue source.

Relevant files: `src/lib/projectWork.ts`, `reports.ts`, `siteReportsModel.ts`, `src/pages/Engineer/EngineerAssignments.tsx`, `EngineerReports.tsx` and `src/components/DailyReportWorkflow.tsx`.

## Client portal

- Open an accessible assigned project automatically instead of requiring an assigned-project card click. Provide a switcher when the client has multiple accessible projects; preserve project scope in navigation.
- A selected blueprint pin exposes submitted daily reports explicitly linked through `daily_reports.linked_work`. Exclude drafts, unrelated pins and other projects.
- Report photos use slideshow navigation, a larger viewer and a details icon. Photos belong to the whole report unless a more specific link is actually stored.
- Problem reports can link to a project work pin and contain annotated photos. Retrying failed photo uploads must reuse the saved report, not create duplicate reports.
- Engineer acceptance of a client problem report preserves its pin on the resulting NCR. Original client evidence stays separate from subsequent correction evidence.
- Communication is the private client question/Engineer answer workflow, with project/pin links and exact-question notifications. Do not expose one client's private questions to another client.

Relevant files: `src/pages/Client/`, `src/components/client/PinDailyReports.tsx`, `src/lib/clientPortalModel.ts` and `src/lib/snags.ts`.

## Shared photo editing

- Reuse `src/components/issues/IssuePhotoEditor.tsx` and `IssuePhotoPicker.tsx` for issue/client/QA markup where applicable.
- Preserve the original photo and save validated text, lines, arrows, shapes and freehand annotations as a separate overlay. Do not flatten over or replace the original.
- `src/lib/canvasView.ts` shares the blueprint sheet's fit/zoom mathematics with `src/components/editor/StageCanvas.tsx`.
- Zoom limits are 5%-1000%, with multiplicative 1.3x buttons. Fit shows the whole image with padding; Fill covers the canvas. Manual zoom/pan remains stable across fullscreen changes.
- The editing viewport is taller (72vh normally, 78dvh fullscreen, minimum 24rem) and non-shrinking. The modal body scrolls down to the caption and other content.
- Ordinary mouse-wheel scrolling moves through the editor. Ctrl/Command + wheel zooms toward the cursor. Keep button zoom, Pan/Select/Space/middle-button drag, touch pinch and keyboard controls working.
- Fullscreen uses an icon button. Escape leaves fullscreen first without discarding unsaved markup. The fullscreen caption disclosure leaves more room for editing.
- Keep the photo and SVG overlay in the same transformed stage so annotations stay aligned at every scale.

## Workforce and biometric attendance

- Admin manages worker registration, profile changes and fingerprint enrollment. Do not add the previously rejected remote delegation/Foreman enrollment permission.
- The hardware workflow uses an AS608 sensor connected to ESP32. Enrollment must be sensor-driven, not require a person to type an AS608 enrollment ID manually.
- Registration includes worker names/contact fields and camera photo capture. Workers do not require website accounts.
- Worker Profiles opens a detailed worker record, not the registration form.
- Foreman **Workforce management** has **Attendance records** first and **Workers** second. Workers are searchable and open details, attendance summaries and records.
- Attendance records support date selection and daily/weekly/monthly reports; individual worker records support attendance reports as well.
- The standalone attendance page is a separate read-only display tied to the selected project. It displays the project name, live recent scans and latest worker profile. It has no project/search/date/status filters or refresh button; fullscreen is icon-only.
- Do not change the standalone attendance page when modifying Foreman workforce pages unless explicitly requested. Never invent attendance records or claim physical sensor enrollment was tested without hardware.

## Database safety and migrations

- Keep role/project authorization, RLS, private Storage policies, checked RPCs, immutable evidence and concurrency guards. UI permission checks are not sufficient.
- Write versioned migrations and corresponding SQL regression tests for database changes. Do not edit previously applied migrations to change production history.
- A committed migration file does not prove deployment. Check migration status and document whether it was applied and verified; never tell the user to paste already-deployed SQL unnecessarily.
- PostgreSQL installation alone does not provide an offline database connection or cloud synchronization. Do not claim local/cloud sync exists without implementing and testing it.
- Do not put access tokens, service-role credentials, database passwords or worker biometric data in this file or Git commits.

## Verification and handoff

- Full regression: `pnpm check` (TypeScript, helper/component tests, SQL regressions and production build).
- Targeted photo/editor checks: `pnpm test:issue-editor`, `pnpm test:comparison`, `pnpm test:qa-photo-markup`.
- QA checks: `pnpm test:direct-qa`, `pnpm test:work-item-evidence`, `pnpm test:qa-board-layout`.
- Connected pages: `pnpm test:project-records`, `pnpm test:client-portal`, `pnpm test:assignments`.
- Attendance/enrollment/report tests are listed in `package.json` and included in `pnpm check`.
- Run `git diff --check`. Report actual test results, remaining blockers and whether visual/hardware checks were possible. A successful build is not visual or hardware verification.
- Keep task-specific implementation/security/test records in `docs/audits/`. Update this handover when workflow decisions change rather than recording contradictory instructions indefinitely.
- Commit/push only when requested. Check the configured remote and remote branch first; never force-push to resolve an unexpected divergence.

## Recent implementation records

- `docs/audits/2026-10-21-work-item-evidence.md`
- `docs/audits/2026-10-21-manual-checklist-completion.md`
- `docs/audits/2026-10-21-qa-board-filters.md`
- `docs/audits/2026-10-21-connected-site-reports-and-assignments.md`
- `docs/audits/2026-10-21-client-portal-connections.md`
- `docs/audits/2026-10-21-qa-photo-markup.md`
- `docs/audits/2026-10-21-photo-editor-zoom-fullscreen.md`

These audits describe individual task runs. Historical statements such as "no push was made" apply to that task, not necessarily to the current repository state. Use Git history for current commit/push status.

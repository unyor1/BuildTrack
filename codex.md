# BuildTrack development handover

Updated: 2026-10-22.

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

- One editor for every editable-photo flow: site issues (Log an issue, Add issue photos, Edit markup on saved issue photos), client problem reports and QA / NCR evidence (`EvidenceStrip`). Upload flows go through `src/components/issues/IssuePhotoPicker.tsx`, which opens `IssuePhotoEditor.tsx` on all chosen photos. Read-only views (client report photos, old issue-photo versions) use the same editor with `readOnly`.
- Editor API: `photos` (`{ id, src, annotations, caption }[]`), `start`, `readOnly`, `title`, `captionLimit`, `onSave(changes)`. Save returns only the photos whose markup or caption changed; saving with no changes just closes (no new issue-photo version).
- Preserve the original photo and save validated text, lines, arrows, shapes and freehand annotations as a separate overlay. Do not flatten over or replace the original.
- Layout follows the blueprint editor. `PhotoEditorToolbar.tsx` is one compact icon toolbar with tooltips: (slideshow controls) | Select, Pan | Text, Shapes dropdown (Line, Arrow, Rectangle, Ellipse, Freehand) | Undo, Redo | View original | zoom − % + Fit Fill | fullscreen. The active tool is filled in brand colour. `MarkupProperties` (colour swatches + custom colour, line width or text size S/M/L/XL, text, delete) shows only while a drawing tool is active or a mark is selected. Changes to a selected mark apply at once; a slider drag or typing run is one undo step, each colour or size pick is its own. No pins, tape or other blueprint-only actions.
- Shortcuts: V select, H pan, T text, L line, A arrow, R rectangle, E ellipse, D freehand, Del delete, Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y), Page Up / Page Down between photos. They are ignored while typing in a field.
- Select, move, rotate (like the blueprint editor):
  - After placing text or finishing a shape, the tool returns to Select and the new mark stays selected.
  - Every mark has a wide invisible grab area (a band around thin outlines, a box around text), so it is easy to pick up.
  - A selected mark shows a dashed frame, turned with the mark, and a round rotate handle above it. Drag the mark to move it; drag the handle to rotate (Shift snaps to 15°).
  - The properties bar has Rotate left / right 15° and a degrees field; `[` and `]` rotate by 15°; arrow keys nudge 0.5% (Shift 5%). A handle drag, a typed angle or a run of arrow presses is one undo step.
  - Rotation is the optional `rotation` key (degrees, around the mark's own centre from `markupBox`, stored -180..180, dropped at 0), allowed by `valid_issue_markup` since `20261021151557`. Every viewer and thumbnail draws it through `MarkupLayer`.
- Several photos open as a manual slideshow: "Image n of N" with Previous / Next (no wrap-around, never automatic) and a collapsible numbered thumbnail strip (`PhotoSlides.tsx`, like the sheet sidebar; a row above the photo on phones) with the current photo highlighted and an "edited" note. Each photo keeps its own markup, caption and undo / redo history (`src/lib/photoEditorModel.ts`, pure and tested). Fullscreen and the chosen tool stay when moving between photos. A single photo shows none of these controls.
- Unsaved work is protected: closing the editor with changes asks (`useConfirm`); the picker asks before removing a photo that has markup or an edited caption; Escape leaves fullscreen first.
- `src/lib/canvasView.ts` shares the blueprint sheet's fit/zoom mathematics with `src/components/editor/StageCanvas.tsx`. Zoom limits are 5%-1000%, multiplicative 1.3x buttons. Every photo opens with **Fit** (whole image, padding, never cropped or stretched). **Fill** covers the canvas only when chosen and stays chosen for the next photo; manual zoom/pan stays stable across fullscreen changes.
- The canvas gets most of the space: 56vh on phones and 64vh beside the thumbnails on wider screens (minimums 18-20rem); in fullscreen it takes all remaining height. The dialog body still scrolls to the caption and hints on small screens.
- Ordinary mouse-wheel scrolling moves through the editor. Ctrl/Command + wheel zooms toward the cursor. Keep button zoom, Pan/Select/Space/middle-button drag, touch pinch and keyboard controls working.
- Fullscreen uses an icon button. Escape leaves fullscreen first without discarding unsaved markup. The fullscreen caption disclosure leaves more room for editing.
- Keep the photo and SVG overlay in the same transformed stage so annotations stay aligned at every scale. `MarkupLayer` lives in `MarkupLayer.tsx` (re-exported by the editor) for thumbnails and viewers.
- `ui/Popover.tsx` panels share the dialogs' z-900 layer, so dropdowns opened inside a dialog appear above it and stacking follows opening order.

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

## Public Valencia introduction

- Opening `/` replaces the URL with `/valencia`. The separate BuildTrack landing page is at `/buildtrack`; internal `navigate("home")` must use that path. Preserve both pages and protected workspace/deep-link routes. Legacy explicit `/#about`, `/#services`, `/#features` and `/#contact` bookmarks redirect to their corresponding `/buildtrack` sections.
- The Valencia desktop/mobile header includes a **BuildTrack** link to `/buildtrack`; its brand logo returns to `/valencia`. The BuildTrack header, About section and footer link back to Valencia. Landing section links must use `/buildtrack#...`, not the new opening `/` URL.
- At widths of 1100px and below, Valencia uses an in-header hamburger and `ValenciaMobileNavigation.tsx` right-side drawer instead of a horizontal navigation strip. It reuses `Modal` with `placement="right"` for focus trapping, Escape/backdrop closing and scroll locking. Section/BuildTrack clicks close it; modified links retain native behavior. Desktop resizing closes the drawer. Drawer focus restoration must not scroll away from the selected section. Desktop links, main landing authentication and standalone attendance stay unchanged.
- Vercel requires the root `vercel.json` SPA rewrite to `/index.html` for direct visits/refreshes of `/valencia`, `/buildtrack`, login and workspace URLs. Do not remove it or bypass RouteGuard to address a hosting 404. Public header/mobile/cross-page links use `handlePublicNavigation` for normal same-tab clicks; preserve external, modified/new-tab and download behavior. `usePublicHashScroll` scrolls sections after lazy page mounting and on hash/Back/Forward changes; keep the sticky-header offset.
- Sources: the Home, About Us, Services, Projects and Contact pages at `https://valenciaconstructionservices.mystrikingly.com/`, checked 2026-10-21. Keep company facts separate from private project records and do not invent project completion dates, statistics, staff, certifications or testimonials.
- `src/pages/Public/ValenciaIntroduction.tsx`, `valenciaContent.ts` and scoped `valencia.css` reuse the public Header and its brand colors. `/valencia` is rendered as static public content; workspace routes retain their existing RouteGuard.
- `src/assets/valencia/introduction/` holds local source photos, an enhanced interior hero and the transparent logo. Preserve source images and do not flatten the logo's alpha channel.
- `proprietor-roxan-valencia.png` is the original supplied proprietor portrait, also published by Valencia. It replaces the initials beside Roxan D. Valencia in About; preserve the actual portrait rather than generating a substitute.
- Hero refinement (2026-10-22): retain the left headline, actions, colors and readability gradient. Overlay the transparent logo directly over the interior photo at the user's yellow-circled right-center area (desktop center at 68% across / 58% down). Keep it clear of tablet copy and above mobile copy. This supersedes the earlier top-center placement. Do not restore the white/glass logo card or the red less-than/chevron decoration.
- The enlarged hero logo uses `clamp(320px,34vw,540px)` on desktop, with smaller tablet/mobile bounds. Preserve its marked center when resizing; mobile copy reserves space below the larger logo.
- The Valencia company header hides Log in and Register using `Header`'s opt-in `showAuthActions={false}`. Keep the main landing page's sign-in controls and the standalone attendance branding-only header unchanged.
- Both public pages use `src/components/PublicFooter.tsx` for the landing footer layout, contact details and responsive columns. Valencia passes `page="valencia"` for white (not yellow) brand/headings/hover text and its own About/Services/Contact anchors; Platform Features links to `/buildtrack#features`. Do not restore the removed Stay connected/company-site promotion or duplicate the footer markup.
- Project filters and gallery slides are manual. Keep renderings labelled as perspectives, not finished construction. Source-website ongoing-status lines, the portfolio-source/date footnote and repeated gallery status disclosures are removed from the public page by request; source provenance remains in content/audits and is not a live database status.
- The inquiry form prepares a `mailto:` message. It does not store or send inquiries itself; keep this clear to visitors. The address-map link uses the published Taytay office address, not the original site's generic map. No verified company social profile was available.
- Run `pnpm test:valencia` after changes; it is included in `pnpm check`. See `docs/audits/2026-10-21-valencia-introduction.md` for sources, asset prompts and verification limitations.

## Recent implementation records

- `docs/audits/2026-10-22-valencia-opening-and-proprietor.md`
- `docs/audits/2026-10-22-deployed-public-navigation.md`
- `docs/audits/2026-10-22-shared-public-footer.md`
- `docs/audits/2026-10-22-valencia-mobile-navigation.md`

- `docs/audits/2026-10-21-work-item-evidence.md`
- `docs/audits/2026-10-21-manual-checklist-completion.md`
- `docs/audits/2026-10-21-qa-board-filters.md`
- `docs/audits/2026-10-21-connected-site-reports-and-assignments.md`
- `docs/audits/2026-10-21-client-portal-connections.md`
- `docs/audits/2026-10-21-qa-photo-markup.md`
- `docs/audits/2026-10-21-photo-editor-zoom-fullscreen.md`
- `docs/audits/2026-10-22-photo-markup-select-move-rotate.md`
- `docs/audits/2026-10-21-photo-editor-toolbar-slideshow.md` (supersedes the Fill-first default and viewport heights above)

These audits describe individual task runs. Historical statements such as "no push was made" apply to that task, not necessarily to the current repository state. Use Git history for current commit/push status.

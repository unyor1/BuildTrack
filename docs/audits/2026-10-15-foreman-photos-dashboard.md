# Foreman photos and database-driven dashboard — 2026-10-15

## Follow-up: calendar filtering and photo details

- Foreman Photo Documentation now has From/To calendar fields and Clear dates, preserved as `?from=YYYY-MM-DD&to=YYYY-MM-DD` alongside the tab/project. Bounds filter `created_at` in SQL before the 200-row limit; both selected days are included in Manila time, with an exclusive next-midnight upper bound. Open-ended ranges work; invalid/reversed dates are rejected.
- Checklist photos show the linked checklist item's full text and completion state on the card. The viewer includes current checklist text/state/completion time/remark, linked work title/description/status or daily report date/status/work description, caption, upload time, uploader name when available from the authorized project team, stored filename and photo-stamp information. Current checklist state is explicitly distinguished from an upload-time snapshot. Missing metadata is labelled, never invented.
- Shared viewer keeps the accessible Modal and signed private-image URLs, with image plus responsive details panel. No schema, RLS, storage, or migration/checksum changes.
- Files: `src/pages/Foreman/ForemanPhotoDocumentation.tsx`, `src/lib/dailyPhotos.ts`, new `src/lib/photoGalleryModel.ts`, `src/components/PhotoGallery.tsx`, new `src/components/PhotoDetails.tsx`, `scripts/test-lib.mjs`.
- Verification: `pnpm check` passed (82 library tests, 316 SQL tests, type-check/build); date tests include same-day, open-ended, year boundary, invalid date, leap year, reversed range and URL parsing. `git diff --check` passed. Authenticated browser/camera checks were not run. Existing 0041 is still the prerequisite for daily photos; no extra SQL is required for this follow-up.

## Review before changes

Reviewed all nine requested Foreman pages (their filenames have the `Foreman` prefix, except `ReportModal`). Preserved all pre-existing uncommitted work.

- Dashboard fetched every visible pin/event, applied assignment filtering only in the browser, ignored selected-project scope, and included unrelated inspections. Its only realtime subscription was pins. The old comment said unassigned work was open to anyone. To-do/overdue card totals excluded work placed in other display groups.
- DailyProgressReport had no photos. Realtime report reloads could replace unsaved form edits; overlapping project reloads could install stale reports.
- PhotoDocumentation had only the work-progress gallery; checklist photos were excluded without a separate way to browse them. No daily-report photo tab or URL tab state.
- ReportModal stripped the old error prefix and offered submit controls even when the pin was not assigned to the caller (the database still refused).
- CorrectiveAction fetched all visible pins/events, loaded reasons without pagination, did not track timeline changes, and ignored selected-project scope.
- QualityControl, QAWorkflow, IssueTracking, DailyWorkManagement: no additional page-local functional bugs found in the wrappers. Their shared QA internals were not exhaustively audited. DailyWorkManagement photo helper copy was outdated.

## Implemented

- Migration 0041 adds private daily-report photos with author/draft guards, report-row locking for the ten-photo limit and submit races, derived project/uploader, bounded stamp fields, immutable API rows, audit triggers and report-matching RLS.
- Private `daily-photos` storage: author/draft folder upload; uploader or readable-photo-row viewing; uploader deletion only after the referencing row is gone. Submitted photo deletion is refused; engineer reopening unlocks editing. Whole draft deletion cascades rows; UI subsequently removes the unused files.
- Added daily_report_photos AND pin_checklist_items to realtime (checklist events were previously not published).
- Daily report upload saves a draft first when needed; camera/gallery, compression and phone stamp reused; shared thumbnails/viewer and delete confirmation. Inputs/submission disabled during upload; submitted reports are read-only. Engineer and Client expanded site logs show photos read-only.
- Three project photo tabs: daily / checklist / work. Server-side filtering, deterministic newest 200, contextual report/pin/item labels, skeletons, error/retry states, empty states, live reload, `?tab=` state.
- Dashboard loads only the caller's assigned work, with optional project filter, paginated stable ordering and bounded pin-ID batches. Quality tasks are own requested inspections or inspections on own pins (deduplicated), and own nonclosed NCRs. Counts use exact database counts for remaining checklist items and own uploads in the half-open Manila day; reports are fetched for the author and Manila report date. Unselected-project report card shows draft/submitted totals across projects. Refreshes on all eight relevant tables, focus and periodic fallback; Manila date rolls over. Failed loads show unavailable figures, not invented zeroes; last loaded work remains for offline queue overlays.
- Export includes daily photo rows and files. CorrectiveAction queries scoped/paginated with live timeline changes; ReportModal ownership and error text corrected. Daily report reloads are race-guarded and unsaved edits preserved.

## Changed files for this task

- `supabase/migrations/0041_daily_report_photos.sql`
- `supabase/tests/99-daily-report-photos.cases.mjs`, `99-evidence-lock.cases.mjs`
- `src/components/DailyReportPhotos.tsx`, `PhotoGallery.tsx`
- `src/lib/dailyPhotos.ts`, `foremanDashboard.ts`, `foremanDashboardModel.ts`, `realtime.ts`, `reports.ts`, `blueprints.ts`, `projectExport.ts`
- `src/pages/Foreman/ForemanDashboard.tsx`, `ForemanDailyProgressReport.tsx`, `ForemanPhotoDocumentation.tsx`, `ReportModal.tsx`, `ForemanCorrectiveAction.tsx`, `ForemanDailyWorkManagement.tsx`
- `src/pages/Engineer/EngineerReports.tsx`, `src/pages/Client/ClientSiteLogs.tsx`
- `scripts/test-lib.mjs`, `scripts/load-test.mjs`, `CLAUDE.md`, migration log and SQL documentation/handover.

## Verification and limitations

- Full `pnpm check`: passed (type-check, 81 library tests, 316 SQL tests, build). Initial sandbox build failed on Windows native dependency/process restrictions; running the same check outside the sandbox passed.
- `pnpm test:load`: passed, local PGlite, 5,000 pins / 50 sheets / 14,000 events / 300 inspections / 500 NCRs (seed 39.2 s). Extended queries: own project pins 396.6 ms median; sent-back events in 100-ID batches 220.5 ms; checklist count 24.1 ms; own daily photo count 2.3 ms. The latter three fixtures return zero; authorization/nonempty photo behavior is exercised separately in the SQL cases. These timings exclude network latency.
- Exact owner `.apply.sql` executed successfully against a fresh local database through migration 0040; verified the embedded body matches the migration and the SHA-256 tracking row is correct. This did not contact Supabase.
- No live database writes or migration application. No authenticated browser/camera end-to-end run against the pending schema. SQL tests simulate Supabase auth/storage/RLS locally; they do not exercise real Storage HTTP limits, Realtime delivery, or multi-connection lock contention.
- Daily photo uploads require connectivity; the existing offline daily-report and pin-progress queues are unchanged. Existing short-lived signed URLs can remain valid after a report is reopened until their one-hour expiry; no new signed URL is authorized for a nonauthor draft reader. Failed storage cleanup is surfaced; unused files may need owner cleanup. Deleted whole-project/report cascades outside this UI can also leave unreferenced storage files.
- The report upload feature and new dashboard metrics require the owner to apply 0041 before use. Owner handover: `sql/0041_daily_report_photos.apply.sql`; checksum and tracking insert are included. Migration remains **NOT APPLIED**.

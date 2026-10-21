# Connected site reports and assignments — 2026-10-21

## Verified source records

Read-only cloud verification for TST-002, repeated after the implementation, returned:

- Two daily reports, both submitted and pending Engineer review. QA requests are separate records and do not automatically create daily reports.
- Seven non-note work pins: five unassigned/not started, one assigned/for review and one assigned/completed (stored as `verified`).

No reports, assignments or sample data were created or modified in the cloud during this investigation.

## Changes

- Site Logs & Reports explains its Foreman daily-report source, shows consistent submitted/returned counts, and supports review-state, date and work/checklist/Foreman search filters.
- Linked report work opens the matching checklist workspace, including QA, NCRs and evidence, or the work pin when no checklist link is available. Missing historical links are disclosed rather than invented.
- Report search results deep-link to the exact report. Foreman report history includes older saved dates as read-only records without expanding the existing editing window.
- Report headcount reconciliation reads real biometric day summaries separately from imported totals; project-wide scans are not misrepresented as one Foreman's crew or added to imported totals.
- Assignment Board includes completed pins by default, with status, sheet and assigned/unassigned filters. Completed, locked and under-review assignment protections remain intact.
- Assignment changes use project and row-version conditions, wait for the canonical saved row, and reload shared project data. Failed/stale responses cannot claim a successful assignment or overwrite newer state.
- Project team, work, daily reports, linked checklist items and questions refresh through realtime subscriptions and periodic/reconnect reads. Project-keyed state and request guards prevent late responses from a previous project appearing in the current one.

## Verification and boundaries

Full `pnpm check` passed: TypeScript, helper and component suites, assignment interactions, project-record/history/attendance connections, 412 SQL regression cases and production build. `git diff --check` passed, apart from existing line-ending conversion warnings.

No browser visual test was performed. No migration, policy, database function, permission expansion or production write was needed. Private draft access and existing RLS remain unchanged. Standalone attendance files remain unchanged. Changes have not been committed or pushed.

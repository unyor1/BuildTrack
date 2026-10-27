# Pin panel actions, detailed records and daily report dates - 2026-10-26

## Requested changes

- Move the first screenshot's creation/report controls and Next actions block out of Issues & NCRs into another tab.
- Replace the second screenshot's large record cards with a detail view.
- Open the panel's Daily progress reports on today only and provide calendar filtering.

## Implementation

- Added **Next actions** after Issues & NCRs (My reports for clients) to the role-scoped section model. Engineer, Foreman and Client receive only their existing permitted actions; read-only Admin receives no operational tab. `?pintab=actions`, panel navigation and Full view use the same model/body.
- `PinActionsSection` uses the canonical record component in actions-only mode. Creation/report buttons, role guidance and Next actions appear there; record filters and lists appear only under Issues & NCRs/My reports. Existing NCR, inspection, issue, client-report and field-problem dialogs retain their role/assignee guards and exact permanent record ids. Empty actions have explicit feedback.
- Record lists now use the existing detailed row/column table layout in both panel and Full view. Narrow panels scroll the table horizontally without making the entire panel overflow. The table region is labelled and keyboard-focusable; headers, full descriptions/correction notes, available dates/class/source/person, own-open highlighting and View details remain.
- Daily reports uses the shared calendar range control, initialized to the current Manila day. Ranges apply to the report's `report_date` (the work date), not submission or image upload timestamps. Today, Last 7 days, this week/month, previous month, custom ranges and All dates are available. Date-filtered empty states explain how to find history.
- Date changes remount the report results, details and photo slideshows. Switching pins or reopening the tab starts Today again. Invalid/reversed ranges do not silently show all data. Existing all-history tab counts, client submitted-only privacy, exact project/pin linkage, permitted staff drafts and Add this pin to today's report behavior are preserved.

The Sites skill informed reuse of the existing section model, detailed table, dialog and calendar controls. No database migration, hosted data write, commit or push was performed. Unrelated working-tree changes are preserved.

## Verification

- Focused `pnpm test:pin-records` and `pnpm test:client-portal` pass. Coverage includes actions/records separation, record/modal rights and callbacks, focusable detailed table structure, full notes, today initialization/reset, range changes, invalid dates, stale detail/slideshow remounts, report work-date vs submission date, older/all dates, foreign-pin/project exclusion and client draft privacy.
- Updated model tests for role-scoped section order and allowed/forbidden actions deep links.
- Full `pnpm check` passed: TypeScript, all application/component/model suites, isolated SQL cases and the production build. Scoped `git diff --check` passed (LF/CRLF notices only).
- No live authenticated visual acceptance/screenshot test was performed in this session.

## Follow-up: limited summary rows, details only after opening

The owner clarified that the table must stay compact. Main columns remain; summary text is limited to two lines. Full descriptions, severity/raised/due/correction/prevention/closure notes are no longer inserted below the Problem cell. Mouse-click, Enter/Space and View details open the existing canonical record dialog; nested button/key events do not open twice. Those dialogs retain full records and their existing role/assignee permissions. Records with summary-only read access have a read-only details dialog, not new operational rights; removing a visible record clears that fallback dialog.

The focused actual-component tests cover hidden metadata in summary rows, text limits, row/keyboard/button handlers, canonical NCR detail payload/rights and read-only fallback open/close. Other tabs and report-date filtering are unchanged. TypeScript, `pnpm test:pin-records`, `pnpm test:client-portal`, production build and scoped `git diff --check` passed. No live browser visual check, migration, hosted write, commit or push was performed.

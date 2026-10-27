# Foreman Corrections filters and QA opening tabs - 2026-10-26

## Request and implementation

The owner identified the Sheet, Pin and Checklist item filters on Foreman Corrections, asked for Completed, and requested that pages not open on All.

- Shared QA boards (Engineer Review inbox, Foreman QA requests and Corrections) now start on their first available nonempty work list, then an actionable extra list, then an available empty/history list. All stays last and is only selected explicitly. Removing a selected list falls back to an available list, not All. Project changes reset board state.
- Added an always-available Completed checklist tab to Corrections. Only manually Engineer-completed checklists belong here. QA Pass or NCR closure alone is not completion.
- Fixed correction grouping: resubmitted Requested / In progress / Passed requests stay In review even when no NCR has For verification status. To fix takes precedence when some findings still require Foreman action, preventing duplicate entries.
- Sheet / Pin / Checklist item and search now apply consistently to correction work rows, Other NCRs and Site issues. Extras opt into the shared board filter contract and supply location ids. The existing NCR table retains status, class, trade, assignment and CSV controls, combined with the outer location/search scope.
- Filter choices use permanent ids, including distinct items with identical names on different pins. Sheet changes clear incompatible pin/item selections; pin changes select its parent sheet and clear item. Clear filters also clears the search. Whole-pin/project-wide records do not masquerade as checklist-specific findings; issue item + search must match the same observation.
- Board totals include the matching filterable extras under narrowed All. Empty filters have explicit feedback. Other NCRs remains reachable for closed history with no open NCRs. Completed stays visible at zero without stealing the default from actionable lists.
- Open NCR, linked inspection, issue Details / photos and Fix and report dialogs are controlled outside filtered list content. NCR/inspection/issue notification links open independently of the default tab, including issue-report-id to pin resolution. Invalid project links show an error and clear stale dialogs. Pending-QA pins say View work / QA instead of promising an editable progress report.
- Added Refresh for QA, pins/sheets, work items and issue history; loading/errors from all these sources are surfaced. Existing record components retain role/assignee checks and database validation.

The Sites skill informed reuse of the shared board/filter components; the Supabase skill informed the read-path and authorization review. No database migration, hosted data mutation, commit or push was performed. Earlier unrelated worktree edits are preserved. This change does not alter dashboard activity filters, project-list dropdowns, or the underlying QA/NCR lifecycle.

## Verification

- Expanded `pnpm test:qa-board-layout` exercises the actual board, WorkFilters, Foreman page and NCR table with synthetic records: dependent selectors, duplicate names, work/extra counts, search/clear, independent tabs/defaults, Completed, lifecycle grouping, actual record callbacks, notification links, refresh/loading/error handling, status/class filtering and scoped NCR CSV.
- `pnpm test:qa-board-layout` and full `pnpm check` passed: TypeScript, all application/component/helper suites, isolated SQL cases and the production Vite build. `git diff --check` also passed (LF/CRLF notices only).
- No signed-in browser surface is available in this session; no live authenticated visual/end-to-end acceptance is claimed. Tests do not write production data.

## Follow-up: correction submission confirmation layout

The owner supplied a screenshot with a truncated confirmation heading and an oversized primary action below the right-aligned Cancel button. The correction confirmation now requests the existing medium modal width, uses the compact title **Submit correction?** and action **Submit request**, and retains the full reinspection/NCR explanation. Both actions keep the shared equal-height padding and fit together at standard mobile widths. `ConfirmOptions.size` is optional; other dialogs retain their existing small default. No QA submission behavior or backend rule changed.

`pnpm test:qa-reinspection` now exercises the actual correction form and confirmation provider: requested size/title/labels, equal vertical padding, unchanged default sizes, Cancel performing no submission and confirmation submitting once. TypeScript, `pnpm test:qa-reinspection`, `pnpm test:direct-qa` and the production build passed. No live browser screenshot verification was performed.

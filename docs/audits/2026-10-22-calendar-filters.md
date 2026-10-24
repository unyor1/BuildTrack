# Calendar filters: QA register and Progress by zone — 2026-10-22

UI only; no migration, RLS or query change. All filtering works on records the pages already load.

## What changed

- **Shared control** `src/components/ui/DateRangeFilter.tsx`:
  - The same look as the Photo documentation date filter: a dropdown of quick choices plus "Pick dates…" with From / To, validation, and "Clear dates".
  - Rules live in `src/lib/dateRangeModel.ts`, which is pure and tested:
    - Asia/Manila calendar days, both ends included; timestamps count on their Manila day, due dates as written.
    - Weeks run Monday to Sunday, as in the defect trends.
    - A record without a date never matches a set range.
    - An invalid range hides nothing; the control shows the error.
    - The range is kept in `?from=&to=` so a refresh or a shared link keeps it. Made-up or reversed dates in a link are ignored.
- **QA register** (Engineer `qa`, `QaView dateFilter`):
  - One filter above Inspections (by date requested), NCR register (by date raised) and Client reports (by date reported). The dates carry over between those tabs, and the label names the date being read.
  - The panels apply it inside their existing filtering, so search, status / class / trade filters, empty states ("Change the dates, the filters or the search") and the CSV exports all follow it.
  - The Overview keeps its whole-project figures (from `get_qa_summary`) and shows no filter, so it never mixes filtered and unfiltered numbers.
  - Tab badges stay whole-project ("waiting" / "open" counts).
  - Foreman QA pages (QA requests, Corrections) are unchanged.
- **Progress by zone** (`EngineerProgress`):
  - Filters work pins by due date, with choices This week, This month, Last month, Next 30 days, Last 30 days or any dates.
  - The stat cards, the "Work due …" bar, zones (sheets with nothing due are hidden and counted), disciplines, deadlines and the CSV (the file name includes the dates) follow the filter.
  - A note shows how many work pins were verified on those dates (whatever their due date) and how many have no due date and are left out.
  - With nothing due, there is a clear empty state with "Show all dates".
  - The S-curve and the schedule card stay whole-project.

## Verification

- `pnpm test:lib`: 116 passed. The 3 new calendar tests cover:
  - Presets, including week boundaries, a leap February and the January → December year rollover.
  - Manila-day conversion around midnight UTC; inclusive ends; open ends; undated records; invalid ranges.
  - Wording; reading and writing the address while keeping other parameters.
- New `pnpm test:date-filters` (`scripts/test-date-filters.mjs`, part of `pnpm check`):
  - The real filter control.
  - Progress by zone: filtered counts and percentages, hidden zones, verified-on-these-dates and undated notes, CSV contents and name, address updates, shared-link start, the empty state and Show all dates, whole-project S-curve.
  - The QA register view: labels per tab, dates shared across tabs, address, no filter on Overview or Foreman pages.
  - The NCR, inspection and client-report panels with Manila-day boundaries and CSV.
  - A deliberate mutation (NCR register ignoring the dates) failed the test; the source was restored byte-for-byte.
- Full `pnpm check` passed (TypeScript, all suites, 425 SQL cases, production build).
- Not checked in a real browser (none available): the layout of the filter bar on phones should be checked once.

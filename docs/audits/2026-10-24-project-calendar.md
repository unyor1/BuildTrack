# Per-project calendar - 2026-10-24

## Request and scope

User requested a Google Calendar-style layout, then explicitly selected all roles, inside each project, with only the contents each role needs. Implemented an internal BuildTrack calendar; no Google account connection, OAuth scopes, outbound event publication, new event table or external deployment.

## Interface

- Shared lazy-loaded page, scoped responsive CSS, and BuildTrack semantic theme tokens.
- Six-week Sunday-first month grid, mini calendar, Today, previous/next period, Month/Week/Day/Schedule views, search and category checkboxes.
- Completed records hidden by default with an explicit toggle. Crowded month cells open their complete day list. Current day and selected day are distinct; phone users can expand filters or use Day/Schedule views. Month/week grids scroll horizontally instead of squeezing events unreadably.
- Accessible named buttons, native form controls, calendar table semantics and the shared focus-trapping Modal for event details. Date/view retained in the address and restored on browser history navigation.
- Event details contain actual source dates/status, project, location and responsible person where appropriate, plus original record and blueprint-pin links when available.

## Data and access

| Role | Calendar contents |
| --- | --- |
| Admin | Project milestones and work deadlines for management; no QA/NCR approval actions |
| Engineer | Project work deadlines, inspection targets, reinspections, NCR deadlines, milestones |
| Foreman | Assigned work/NCRs, inspections requested by them or linked to assigned work, milestones |
| Client | Project milestones and work deadlines; no internal QA/NCR details, staff identity, private notes or evidence |

- Admin project-tab route `/admin/projects/<uuid>/calendar`; field/client calendar routes carry `?project=<uuid>`. No global project-combining calendar. Existing role guards, MFA requirements and project-access policies remain unchanged.
- Events are projections of `pins.due_date` (excluding notes), `qa_inspections.target_at`, `qa_defects.due_date`, and project start/end dates. Only Engineer/Foreman hooks enable internal inspection and NCR reads. Restricted projections ignore those arrays even if accidentally supplied.
- No invented appointments, report reminders, meeting durations or use of request dates as scheduled inspection dates. Records without a scheduling date are counted separately. Events are read-only; scheduling changes occur in original records through their existing permissions/workflows.
- Reuses existing authenticated, project-scoped and paginated read hooks with Realtime and reconnect/visibility/periodic refresh. No direct Supabase query, schema/migration, RLS, evidence, biometric or workflow mutation was introduced.
- Pure projection rejects other-project rows and only derives data when the canonical project matches the selected ID. Page checks actual role and active status. UI hides records while loading or after read failure rather than displaying stale event details.
- Read the Sites skill for the existing local-checkout workflow and the Supabase skill; checked current changelog and RLS documentation. No dependency installation or new hosting project.

## Verification

- `pnpm test:project-calendar` passed: role/project filtering, restricted Client/Admin contents, null Foreman identity, Manila midnight conversion, leap-month/year navigation, month/week/day/schedule ranges, filters/search/completed records, URL history, event/blueprint links, crowded days, mini-calendar selection, phone filter control, loading/error/retry, page role/status gates, restricted read-hook arguments, project-switch masking, and all-role project navigation.
- TypeScript passed.
- Full regression attempt reached the existing Client portal suite, then stopped at `scripts/test-client-portal.mjs:113`: it directly renders the changed Inspector without its newly extracted pin-panel content and expects “In progress.” This mismatch is in other already-modified pin-panel work, not calendar code; those edits/tests were preserved rather than reverted.
- Production build passed. Remaining suites were run separately: Valencia, public navigation, QA photo markup and date filters passed; local SQL regressions passed 438 cases. Assignment tests also hit a stale expectation at `scripts/test-assignments.mjs:111` (it expects a direct pin-link href after the other work extracted `OpenOnBlueprint`). No calendar code edits either failing surface or test.
- Full `pnpm check` is therefore not green in the combined working tree; both unrelated test mismatches are disclosed rather than hidden. Calendar-specific tests, TypeScript and production compilation pass.
- Browser inventory returned no apps or browsers. No authenticated browser, desktop/mobile visual or production-data verification was performed. CSS responsiveness and semantics have automated/source coverage, not screenshot verification.

Pre-existing changes, including the concurrently edited pin-panel integration and its migrations, were preserved. No commit or push requested/performed.

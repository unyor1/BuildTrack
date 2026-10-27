# Records connected to blueprint pins — 2026-10-24

## Request

Issues, NCRs, QA records, daily progress reports, evidence and other location records must connect to the right blueprint pin, appear in its panel, and open from anywhere on that pin. Reuse the existing workflows and records, with detailed columns where useful. Role rules for Engineer, Foreman, Client and Admin stay as they are.

## What already worked (kept, reused)

- **Permanent pin links** already existed on site issues (with checklist item and saved name), inspections (`pin_id`, `work_item_ids`), NCRs (`pin_id`, inspection link), client reports and client questions (`pin_id`), daily reports (`linked_work` pin + item), and checklist / correction photos (`pin_id`, `checklist_item_id`, `qa_attempt_id`).
- **The work item record** (`WorkItemWorkspace`, opened from the Checklist tab) already holds inspection, corrections and NCRs, evidence, attempts and history, plus the manual **Complete checklist** button. It is reused unchanged: no Accept action, same completion rules.
- **Correction evidence** already goes to the existing NCR (the NCR form or the work item correction package). Client acceptance into an NCR already kept the pin and the original evidence.

## What changed

### Database (`20261024152151_pin_record_links.sql`, applied; see `sql/20261024152151_pin_record_links.md`)

- An NCR raised directly can name its checklist item: the id plus the name saved at the time. A trigger validates the project, pin and item of every NCR.
- `report_field_problem` lets the assigned Foreman report a field problem. It goes on the pin timeline and notifies the project Engineers.

### Pin panel (`editor/Inspector.tsx`, `editor/PinDetailsModal.tsx`, new `editor/PinRecordSections.tsx`)

**Sections by role** (`pinSectionsFor`):

| Role | Sections |
|---|---|
| Engineer | Details, Checklist & QA, Issues & NCRs, Daily reports, Photos, Activity, Communication |
| Foreman | Details, Checklist & QA, Issues & NCRs, Daily reports, Photos, Activity |
| Client | Details, Checklist & QA, My reports, Daily reports, Communication |
| Admin | As Foreman, read-only |

Tabs show counts of what needs attention. "For review" stays a checklist state: the pin header shows the work status.

**Issues & NCRs** (one loader, `lib/pinRecords.ts`):
- Lists NCRs, inspections and QA requests, site issues and client reports, each with status, responsible person, dates and checklist item. NCRs also show their source.
- Next actions per role:
  - Engineer: inspect, verify, assign, decide.
  - Foreman: correct, or wait for the Engineer.
  - Client: follow their own reports.
- Opens the existing detail views with the same rights as before:
  - Engineer: NCR verify and close, inspection, issue record, client report decision.
  - Foreman: correct the NCR, request inspection.
  - Admin: read only.
  - Client: their own report.

**Create from the pin** (opens already on this project, sheet and pin):
- Engineer: **Log an issue**, **Raise NCR**.
- Assigned Foreman: **Report a field problem**.
- Client: **Report a problem here**.

**Other sections:**
- **Daily reports:** reports linking the pin. Staff also see the Foreman's own drafts, marked as drafts. The assigned Foreman can **Add this pin to today's daily report**.
- **Photos:** original submission evidence shown apart from correction evidence.
- **Communication:** the Engineer answers the pin's client questions here; the client sees only their own.

**Full view:** the same sections, records in detailed columns, and a summary strip (assigned Foreman, deadline, checklist completed, open NCRs). It opens on the section the side panel was showing.

### Linking records from other pages

- **New shared picker** `ui/PinLinkPicker.tsx` (rules in `lib/pinPickerModel.ts`): sheet → searchable work pin → checklist item.
  - Only this project's work pins are offered; a wider choice clears narrower ones that no longer fit.
  - **Project-wide** is offered only where the record may be project-wide.
  - Saving waits for the pin's checklist to load.
- **Log an issue** (pin required), **Raise NCR** (Project-wide allowed, now with checklist item) and the client's **Report a problem** (pin or Project-wide) use the picker.

### Open on blueprint

- `components/OpenOnBlueprint.tsx` and `pinPlanPath` replace the separate "Open on the plan" links in the NCR, inspection, work item, client report, review inbox, issue register, assignments and site log views.
- The link carries project, sheet, pin and panel section (`?pintab=`).
- The editor opens that section of the linked pin once, then removes `pin` / `pintab` / `worktab` from the address.

### Daily report link

`?linkpin=` (and `linkitem`) on Daily progress report adds the pin to today's draft once today's report is known:
- An existing draft keeps its linked work.
- A submitted report and a pin of another project are refused.

### Other changes

- Engineer Reports' question list moved to `components/ProjectQuestions.tsx`, shared with the pin's Communication section.
- The client report dialog moved to `qa/SnagParts.tsx` (`ClientSnagModal`), shared with the client's pin panel.
- The bell has a "Field problem" label for `pin.problem`.

## Follow-up 2026-10-25: Issues & NCRs filters and the issue / NCR difference

- **Filter bar** (`RecordFilterBar` in `PinRecordSections.tsx`, rules in `pinRecordsModel.ts`: `recordMatches`, `recordKindCounts`) sits above the lists in the side panel and the full view:
  - type chips (All, NCRs, Inspections, Site issues, Client reports, as the role sees them) with how many each shows under the other filters;
  - All / Open / Closed;
  - checklist item (or "Whole work pin");
  - search (numbers, titles, descriptions, people, status, source);
  - "Showing X of Y" and Clear filters.
- **"Open" means still waiting for someone:**
  - an NCR not closed;
  - an inspection requested or under way;
  - a client report waiting or being fixed;
  - a site issue until its work pin is completed (the issue register's Resolved).
- **Other behaviour:**
  - Next actions are never filtered.
  - A type chip shows only that list.
  - Another pin starts unfiltered.
  - Clients get only Open / Closed and search.
  - In the side panel the checklist and search fields take a full row.
- **The Engineer sees a one-line explanation under Log an issue / Raise NCR** (also as button tooltips):
  - an issue flags the pin and shows the Foreman what is wrong, without number or deadline;
  - an NCR is numbered, has class, deadline and responsible Foreman; the Engineer verifies and closes it, and it blocks completion.
- **Font fix:** `index.css` has an unlayered `button, input { font: inherit }` that overrides Tailwind's layered text / font utilities. Buttons and fields in these sections and in `PinLinkPicker` now use `!` utilities, as the app does elsewhere.
- **Tests:**
  - `pnpm test:lib` 124 (filter rules);
  - `pnpm test:pin-records`: filtering by type, state, item, whole pin and search; chip counts; clear; reset on another pin; client bar; closed site issue on completed work.
  - A deliberate break of the open / closed rule failed both suites; source restored byte-for-byte.
- **Visual check:** the panel at 390 px and 1280 px on a temporary demo page, deleted. `pnpm check` passed.

## Not changed (by design or not done)

- **Daily report photos** still belong to the whole report: the report links pins and items, its photos do not have their own pin link.
- **Client reports** link a pin only, not a checklist item.
- **Site issues** still require a pin; there is no Project-wide issue.
- **Who may raise an NCR** in the database is unchanged (Engineer or Foreman project members); only the Engineer's screens offer it.
- **Admins** get no inspection or NCR approval rights.

## Verification

- **Test totals:**
  - `pnpm test:sql`: 438 passed (6 new).
  - `pnpm test:lib`: 123 passed (6 new: sections per role, link paths, NCR checklist labels, counts and next actions, picker rules).
- **New `pnpm test:pin-records`** (in `pnpm check`):
  - picker;
  - Issues & NCRs per role, including detail rights and the field problem;
  - reports and communication sections;
  - Open on blueprint;
  - photo split;
  - loader (tables skipped per role, pin-scoped queries, submitted-only client reports, stale answers dropped, failures reported);
  - the Foreman daily report link.
- **Updated tests:**
  - `test:issue-editor` (Log an issue with the picker, preselected pin, wrong-pin and checklist guards);
  - `test:client-portal` (client sections, `pintab`, client report picker);
  - `test:assignments` (plan link).
- **Deliberate breaks:**
  - Removing the stale-answer guard, and showing client reports to Foremen: both failed the tests; sources restored byte-for-byte.
  - The stale-answer test first passed the break, so it was reordered to deliver the new answer before the old one.
- **Load test:** `pnpm test:load` passed; the new per-pin queries take about 1–2 ms on the seeded project (5,000 pins, 500 NCRs).
- **Full check:** `pnpm check` passed (TypeScript, all suites, SQL, build).
- **Visual check:** a temporary demo page with sample records was rendered in headless Chrome, then deleted:
  - full view in light and dark at 1280 px;
  - side panel at 390 px for Engineer, Foreman and Client, with no horizontal overflow;
  - the picker.
- **Not verified:**
  - The real editor with signed-in accounts and live data (opening a link with `pintab`, the dialogs from the panel, phone drawer behaviour) was not tested in a browser.
  - The field problem notification was verified in SQL tests only, not in a live account.

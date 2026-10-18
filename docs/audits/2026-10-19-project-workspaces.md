# Engineer and Foreman project workspaces — 2026-10-19

UI-only structural change; no migration, no RLS or Edge Function change.

## What changed

- **Start on the project list.** After sign-in, Engineers land on `/engineer/projects` and Foremen on the new `/foreman/projects` (`components/FieldProjects.tsx`). The list shows only their assigned projects (Row Level Security decides). Each card shows what waits there: Engineer = to review, QA to action, open issues; Foreman = assigned to you, to correct.
- **One project at a time.** Opening a project lands on that project's dashboard. The sidebar then shows only that project's sections, starting with the project (code, name, phase) and "← All projects" (`AppShell` prop `onAllProjects`). Admin and Client shells are unchanged.
- **Separation is carried in the URL.** `navigateEngineer` / `navigateForeman` add `?project=<id>` to every page except the list (`fieldPagePath`). A page opened without a project, or with a project that is missing or no longer assigned, shows the project list instead of the page (`fieldShellMode`). The list page forgets the session selection; sign-out clears it.
- **Project-scoped numbers.** The Engineer dashboard now covers only the selected project (pins, QA items, setup steps, progress, quick links). The Foreman dashboard already filtered by project; its cross-project "My projects" list was removed. Sidebar badges (`usePinCounts`, `useQaBadge`) take the selected project.
- Existing links keep working: notification, QR (`/pin`) and search links already carry `?project=`, so they open straight inside that project.

## Files

New: `components/FieldProjects.tsx`, `pages/Foreman/ForemanProjects.tsx`. Changed: `components/shell/AppShell.tsx`, `pages/{Engineer,Foreman}/*Shell.tsx`, `pages/Engineer/{EngineerProjects,EngineerDashboard}.tsx`, `pages/Foreman/{ForemanDashboard,types}.tsx` and the Foreman pages' "My projects" link, `components/AssignedProjects.tsx` (`cardExtra`), `lib/{projects,projectRoutes,pinCounts,qaLite,auth}.ts(x)`, `components/RouteGuard.tsx`, `App.tsx`, `scripts/test-lib.mjs`.

## Verification

TypeScript, 99 library tests (new: project path and sidebar mode rules) and the production build passed. No signed-in browser walkthrough was possible in this session; the screens are type-checked and built, not visually verified.

## Rollback

Revert the files above; role home back to `/engineer/dashboard` and `/foreman/dashboard` in `lib/auth.tsx` and `RouteGuard.tsx`.

## Follow-up (same day): dashboards and photo documentation

- Engineer project dashboard: the first-run "Set up <project>" card was removed.
- Foreman dashboard: 8 equal stat cards (two rows of four); the Daily report card opens today's report (separate button removed). Quality tasks and the pin groups are one detailed "My tasks" list with short filters (All, Sent back, Overdue, Issues, NCRs, Doing, To start, Waiting); pure `foremanTasks` / `taskCounts` in `lib/foremanDashboardModel.ts` (tested, each task in exactly one filter). Clicking Sent back / Overdue / Waiting sets the filter.
- Foreman photo documentation: kind tabs (Daily report, Work items, Progress) and date buttons (Today, Yesterday, Last 7 days, This month, All dates, Pick dates) in one toolbar; Daily report opens on today, other tabs on all dates (`photoRangeDates` / `defaultPhotoDates` in `lib/photoGalleryModel.ts`, tested).
- "Work progress photos" were kept (renamed Progress): they are the pin photos not attached to a work item, uploaded from the Report dialog and the pin Photos tab, and they are exactly what clients see in Site logs (`useProjectPhotos`). Removing them would empty the client photo section. They are not QA evidence.
- Checks: TypeScript, 101 library tests and the production build passed. Not visually verified in a signed-in browser.
- Photo documentation, second pass: the date buttons are one Upload date dropdown (Today, Yesterday, Last 7 days, This month, All dates, Pick dates… which opens From / To). Work items and Progress tabs add Sheet → Pin → Work item filters (work item on the Work items tab only), applied in the database before the newest-200 limit (`useEvidencePhotos` scope: `pins!inner` + `pins.blueprint_id`, `pin_id`, `checklist_item_id`), kept in the URL (`sheet`, `pin`, `item`). Rules in `readPhotoScope` / `changePhotoScope` (tested): a new sheet clears pin and work item; a pin selects its sheet. Daily report photos have no pin, so these filters are hidden there. TypeScript, 102 library tests and the build passed.

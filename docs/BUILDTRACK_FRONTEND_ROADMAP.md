# BuildTrack Frontend Roadmap (step by step)

Panels: Admin, Engineer, Foreman, Client. Company: Valencia Construction Services (sub-contractor of William Brothers Manila).
Each step ends with something you can run and demo. Do not start a step before the previous one works.

## Step 0 — Foundations (1–2 days)
- Move colors to the Valencia palette (see `BUILDTRACK_COLOR_PALETTE.md`): swap `--purple`/`--gold` tokens in `src/index.css`.
- Adopt a router (React Router) to replace the custom `pushState` routing in `src/App.tsx`, so route guards are possible.
- Create a Supabase project; add env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- Done when: app runs with new colors and routes still work.

## Step 1 — Login (start here)
Current: `src/pages/LoginPage.tsx` only shows a demo notice.
1. Install `@supabase/supabase-js`; create `src/lib/supabase.ts`.
2. Controlled form with validation (email format, password required), loading state, clear error messages (wrong password, unapproved account).
3. Sign in with Supabase Auth (email + password).
4. After login, read the user's profile row (role + approval status) and redirect:
   Admin -> `/admin/dashboard`, Engineer -> `/engineer/dashboard`, Foreman -> `/foreman/dashboard`, Client -> `/client/overview`.
5. Block users whose status is `pending` or `rejected` with a "waiting for approval" screen.
6. "Remember me" -> persist session; "Forgot password" -> Supabase reset email flow.
7. Logout button in each shell (Admin/Engineer/Foreman/Client).
8. Route guard: visiting `/admin/*` without being an Admin redirects to login or "not allowed".
- Database: `profiles` table (id, full_name, role, status, discipline, created_at) with Row Level Security.
- Done when: all four roles can log in and land on their own panel; a wrong role cannot open another panel's URL.

## Step 2 — Register and Admin approval
1. Register form creates the auth user + `profiles` row with status `pending`.
2. Admin `User Management` lists pending users, Admin picks the role (Engineer/Foreman/Client) and approves or rejects.
3. Discipline field for engineers (Civil & Structural, Architectural, MEP).
- Done when: new user registers -> appears in Admin list -> approved -> can log in.

## Step 3 — Projects
1. `projects` table: name, code, location, client, phase (Plan Review, Team Briefing, Mobilization, Execution), status.
2. Admin Project Management: create/edit projects, assign Engineer(s), Foreman, Client.
3. Each panel only lists the projects assigned to that user (RLS).
- Done when: project created by Admin shows up only for assigned users.

## Step 4 — Blueprint upload and viewer (Engineer)
1. Upload PDF/PNG (exported from CAD) to Supabase Storage; save record in `blueprints` (project, level, revision, file path).
2. Viewer with pan and zoom (React + pointer events).
3. Revision history: new upload = new revision, old ones kept.
- Done when: engineer uploads a plan and can pan/zoom it; Client sees it read-only.

## Step 5 — Pins (the core feature)
1. Click to place a pin (stored as x%/y% on the blueprint).
2. Pin detail panel: title, description, discipline, status (Not Started / In Progress / Issue / Verified), assigned foreman.
3. Photos on a pin (camera or file), notes with author + timestamp, history log.
4. Drag to move, edit, delete (Engineer only); Foreman can add photos/progress; Client read-only.
5. Layers per discipline with show/hide, color, and lock; filters by status/discipline.
- Done when: engineer builds a full annotated plan; foreman adds progress photos; client sees verified pins.

## Step 6 — Foreman field work
1. Daily work assignments linked to pins.
2. Daily progress report generated from pins + photos.
3. Issue tracking and corrective action loop: issue -> assign -> fix -> re-inspect -> close.
- Done when: one issue travels the whole loop with a full history.

## Step 7 — Attendance and payroll
1. Biometric/fingerprint device integration (pick device and SDK first).
2. Attendance records feed a simple payroll export.
- Done when: a day's attendance produces a payroll summary.

## Step 8 — Client portal
1. Overview of progress %, verified pins, site logs.
2. Ticket (snag) submission and communication thread.

## Step 9 — Offline mode (PWA)
1. Service worker caches the app shell (Workbox).
2. IndexedDB (Dexie) stores blueprints for the project, pins, photos.
3. Sync queue sends offline changes when online; last-edit-wins with history.
4. "Make available offline" button per project.
- Done when: airplane-mode test — open project, add pin and photo, reconnect, data appears for others.

## Step 10 — CAD conversion, security, polish
1. Backend endpoint (FastAPI) converts DWG/DXF to PDF/tiles.
2. Audit log, rate limiting, backup, error monitoring.
3. User testing with Valencia staff, fixes, deployment.

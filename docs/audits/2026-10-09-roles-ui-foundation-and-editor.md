# 2026-10-09: Self-service roles, UI foundation, workspace editor (Milestones 1-3)

Category: auth/RBAC change, UI architecture, core feature. Migrations 0012, 0013, 0014 and Edge Function `admin-users` v2 applied by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz` first). Details: `sql/0013_access_requests.md`, `sql/0014_editor_data.md`, `migrations-log.md`.

## Milestone 1: registration and roles
- New sign-ups (email + OTP, or Google) become an **active basic `user`**: no admin approval. Role in sign-up metadata is still ignored.
- `user` sees no project data (RLS) and lands on `/user/home`: welcome, profile (edit), **Request elevated access** (Engineer / Foreman / Client, discipline, message), request status with cancel, history. Page polls every 20 s while a request is pending so an approval takes effect without a refresh.
- Admins only handle requests: **Users & Access Requests** page with an "Access requests" tab and a review dialog (adjust role/discipline, note, approve / decline). All decisions go through Edge Function `admin-users` (`approve_request`, `reject_request`): atomic claim, rolled back if the profile update fails, audited (`access.approve` / `access.reject`).
- Google: "Continue with Google" on Register and Login; name and avatar are copied from the Google profile. Requires the Google provider to be enabled (done earlier).
- OTP email: designed templates in `supabase/email-templates/` (`confirm-signup.html`, `reset-password.html`) with the steps to keep the code at 6 digits (`README.md`). These are Supabase Auth settings, so the owner pastes them in the dashboard.
- Shells now show the signed-in person (the hard-coded "Marcus Vance", "Ramon Santos", "Client Representative" and a frozen date were removed).

## Milestone 2: UI foundation
- `components/ui/Skeleton.tsx` (shimmer skeletons: text, cards, KPI row, table rows, lists, page) used on every data page: Admin dashboard, users, projects, overview, blueprint management, assigned projects, context bar, editor sheet strip, pin checklist/timeline.
- `components/Modal.tsx` rebuilt: portal, `role="dialog"`, labelled, Esc closes (top-most only), focus trap and restore, page scroll lock that restores the previous state, sizes sm..2xl, footer slot, animation (respects reduced motion). Used for user details, access review, edit / create user, permissions, new pin/note, calibrate, pin details.
- `lib/toast.tsx` toasts (success / error / info, auto-dismiss with pause on hover, aria-live) and `lib/confirm.tsx` (promise-based confirm dialog replacing `window.confirm`).

## Milestone 3: workspace editor (`components/editor/`)
Full-window layout: top **toolbar** (Back, titles, revision, tools Select / Pin / Note / Shape / Measure / Stamp with shortcuts V P N S M T, upload), left **sheet sorter** (thumbnails, "Sheet 01 - Title", pin counts, arrow-key navigation), central **stage** (pan / wheel zoom / pinch, pins, notes, shapes, measuring tape), right **inspector** with tabs (nothing selected: Pins, Layers, Sheet; pin: Details with progress tracker, Timeline, Checklist, Photos; note/shape editor) and a **Pin details dialog** (all fields, photos, checklist, timeline and comments).
- Roles: Engineer/admin edit; Foreman may report progress (RPC), tick checklist items, stamp In progress / For review, comment and add photos; Client is read-only (no timeline).
- Pages: Engineer "Pins and annotations" and Client "Blueprint" are the editor; Engineer Project Blueprint, Foreman Daily Work and Admin Blueprint Management show a sheet gallery with "Open the editor".
- Removed: `BlueprintWorkspace`, `PinPanel`, `PinCanvas`, `ProjectPinsTable` (replaced).

## Testing
- Database: `pnpm test:sql` 103/103 (new: 0012/0013 user role and requests 14, 0014 editor data 17).
- Live database: advisor re-run after each migration (no anonymous exposure; only the intentional access helpers remain); `admin-users` v2 answers preflight 200 and rejects calls without a session (401).
- Browser (temporary demo harness with an in-memory fake backend running the REAL app code, deleted afterwards): select, new pin dialog and validation, pin created exactly where clicked, note, shape draw, shape resize and move, measuring tape (771 px measured; calibrated 24 m -> 49.8 m sheet), status stamp, sheet switching, real Delete key with confirmation, Esc closes dialogs, Foreman and Client restrictions, phone-width layout, light and dark themes, designed emails.
- Bugs found and fixed by that testing: toolbar overflow on phones (inspector button unreachable), sheet fitted at 5% after a window resize, dialog closing released the editor's scroll lock, Delete handler assumed an element target.

## NOT tested (needs real accounts / devices)
- The same flows against the real Supabase (sign-up with OTP, Google, access-request approval through the deployed Edge Function, real uploads to Storage, PDF upload through the dialog).
- Touch pinch zoom on a phone; large plans with many pins.
- Email rendering in real inbox clients (Gmail, Outlook).
- Skeleton states were checked in code, not visually on a slow connection.

## Owner actions
1. Supabase Auth: set OTP length to 6 and paste the two email templates (`supabase/email-templates/README.md`).
2. Turn on leaked-password protection (Auth setting) if your plan allows it.
3. Run the test plan in the final message of this session.

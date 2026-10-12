# 2026-10-09: Fix project-creation error + "who takes care of the project"

Category: bug fix (database), feature, test infrastructure.

## 1. Bug: `record "new" has no field "user_id"`
- Cause and fix: see `sql/0005_fix_project_audit_trigger.md` (shared audit trigger read a column only `project_members` has).
- Proof: the bug was reproduced locally first (5 failing tests with the exact message), then fixed (all pass).

## 2. New test infrastructure
- `supabase/tests/run-sql-tests.mjs` + `10-projects.cases.mjs`; run with `pnpm test:sql`.
- Uses `@electric-sql/pglite` (in-memory Postgres, dev dependency) with a small stand-in for Supabase's `auth` schema, applies every migration in order, then checks RLS and triggers as different users (Super Admin, Admin with/without permission, Admin without MFA, Engineer, Foreman, Client, pending user, anonymous). 22 tests.
- Limits: it is Postgres + RLS only. It does not exercise Edge Functions, the browser UI or real Supabase Auth, and it uses a stand-in `auth.uid()` / `auth.jwt()`.
- Rule going forward: every new migration gets tests here before it is handed over.

## 3. Feature: designation on project creation (migration 0006)
- Form fields: Person in charge (free text, no login needed), Engineer in charge, Foreman in charge (dropdowns of active users), Scope of work (Civil & Structural, Architectural, MEP).
- The chosen engineer/foreman are validated (active, right role) and added to the team automatically; removing them from the team clears the lead; disabling or changing the role of a lead clears it.
- Cards show "In charge" and scope chips. Workspace pages (`ProjectContextBar`) show the person in charge, scope and the team with names/roles/"in charge" via `get_project_team` (no emails exposed).

## 4. Other hardening
- Foreign keys to `auth.users` no longer block deleting users (set null); `created_by` / `assigned_by` filled by the database.
- UI guards for a not-yet-migrated database (`disciplines ?? []`).
- After any Manage access change the project grid reloads, so "in charge" never shows a removed person.

## Apply order (owner, SQL Editor)
`0004` (if not yet) -> `0005` -> `0006`. Then reload the app.

## Not verified
UI flows with live accounts (Supabase Auth, Edge Functions, browser) - the SQL layer is covered by `pnpm test:sql`, the React layer by type-check/build only.

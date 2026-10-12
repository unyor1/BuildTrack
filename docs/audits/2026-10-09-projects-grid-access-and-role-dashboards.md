# 2026-10-09: Project grid, Manage access, role dashboards (Milestones 2, 3, 4)

Category: feature. Database: migration 0004 written (not yet applied). Design polish deferred on purpose.

## Decisions
- Admin access stays **permission-based** (`projects.manage`), not global, to keep the least-privilege model. Migration 0004 gives every new Admin `users.view`, `projects.manage`, `blueprints.manage` by default so they can work immediately; Super Admin can change it.
- `client_name` (text) is kept instead of a `client_id`: the real client (e.g. William Brothers Manila) may have no login. Client *users* are linked through `project_members`.

## Milestone 3 (data access)
- Schema and RLS already exist from `0003_projects.sql` (junction table `project_members`; Engineer/Foreman/Client can only SELECT projects they are linked to; only `projects.manage` holders write). Documented in `sql/0003_projects.md`.
- New: `0004_default_admin_permissions.sql` + `sql/0004_default_admin_permissions.md`, row added to `migrations-log.md`.

## Milestone 2 (Admin UX) - `Admin/ProjectManagement.tsx`
- Drive-style card grid (`components/ProjectCard.tsx`) with search, status filter, sort, avatar stack of people with access, empty and error states with Retry.
- New/Edit project modal: name, code, location, client, phase, status, dates, description. Client-side validation (code pattern, name length, end >= start) with per-field messages; database errors mapped to readable text (duplicate code, no permission, network). Saves are checked for "0 rows affected" (RLS silently blocking) and reported.
- **Manage access** modal (Drive share style): search-as-you-type to add Engineers/Foremen/Clients, role badges, Remove; every change saves immediately. Assignees are validated again in the database trigger (active engineer/foreman/client only).

## Milestone 4 (role dashboards)
- `components/AssignedProjects.tsx`: same card grid for Engineer, Foreman and Client with search/filter; data comes straight from RLS (only assigned projects). Used on Engineer Projects (mock data removed), Foreman Dashboard, Client Overview.
- Opening a card calls `openProject(role, id)` (`lib/projects.ts`): Engineer -> `/engineer/project-blueprint?project=<id>`, Foreman -> `/foreman/daily-work?...`, Client -> `/client/blueprint?...`. Selection is also kept in sessionStorage so sidebar links keep the project.
- `components/ProjectContextBar.tsx` on those three workspace pages shows the selected project, or "pick a project" / "not assigned to you" states (a project hidden by RLS looks identical to a missing one).

## Verification
- `tsc --noEmit` and `pnpm build` pass.
- NOT tested with live accounts yet (needs migration 0004, a Super Admin, an Admin, and one Engineer/Foreman/Client). Test script:
  1. Admin creates a project (try an invalid code, duplicate code, end date before start).
  2. Manage access: add an Engineer and a Client, remove one.
  3. Engineer signs in: sees only that project; opens it; context bar shows it. Another Engineer sees an empty list.
  4. Paste the project URL into an unassigned user's browser: "not assigned to you".

## Follow-ups
- Blueprint pages still show mock content below the context bar; next feature step is real blueprint upload + pins per project.
- Foreman has no dedicated blueprint view yet (lands on Daily Work).

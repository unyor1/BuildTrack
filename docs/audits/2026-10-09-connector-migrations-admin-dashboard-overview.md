# 2026-10-09: Connector-applied migrations, security hardening, real Admin Dashboard and Project Overview

Category: database (0005 completion, 0007, 0008), security, feature. Applied by the agent through the BUILDTRACK_MIGRATIONS connector.

## 1. Connector verified before use
- `get_project_url` returned `https://ruimjlhsfpaezkgfphsz.supabase.co` (BuildTrack). The ebalik connector stays disabled.
- Live state found (read-only queries): 0001-0004 applied by hand; 0006 fully applied by hand; **0005 only partly applied** (audit-trigger function fixed, but `projects_actor` / `project_members_actor` triggers missing and six FKs still without a delete rule).

## 2. Migrations applied (details in `sql/` and `migrations-log.md`)
| Migration | Result |
|---|---|
| 0005 completed (`fix_project_audit_trigger_and_actor_columns`) | verified: both actor triggers exist, six FKs `on delete set null` |
| 0007 `lock_down_function_execute` | security advisor findings 23 -> 5 (remaining 5 intentional, documented) |
| 0008 `activity_feed` | `get_activity()` live; anon cannot execute |

## 3. Live proof of the original bug fix
A transaction that always rolls back (deliberate exception) simulated the Super Admin creating a project on the real database: insert succeeded, `created_by` = caller, audit row written, `get_project_team` callable. Afterwards 0 projects and 0 project audit rows remained.

## 4. Tests
`pnpm test:sql`: 28/28 (added: function-execute lockdown, triggers still firing, activity feed access rules and limits). New tests were shown to FAIL without their migration.

## 5. Frontend
- `src/lib/admin.ts`: `useActivity`, `useUserStats`, labels and Philippine-time formatting.
- **Admin Dashboard** now shows real numbers (projects by status, active engineers/foremen/clients, pending approvals), a "Projects needing attention" list (no person in charge / engineer / foreman / team) and the real activity feed. Invented figures (112 users, "Marcus Vance", workers present, open issues, verified progress) were removed; the cards that need future modules say so. Admins without the needed permission see "—" instead of a misleading 0.
- **Project Overview** (Admin) is now real: who takes care of the project, dates, scope, description, team, project activity; project picker when none is selected; cards in Project Management open it (Edit and Manage access are separate buttons). The old designed panels (blueprint, verified progress, workforce) were moved to `ProjectOverviewSample.tsx` and appear in a collapsed, clearly labelled "sample data" section.
- `project-overview` now requires `projects.manage` (same as Project Management).

## 6. Not done / owner actions
- Leaked-password protection (Auth setting; may need the Pro plan): see `sql/0007_lock_down_function_execute.md`.
- UI flows were verified by type-check, build and a browser load without errors; they were NOT clicked through with signed-in accounts (needs real Admin/Engineer logins).
- The Engineer / Foreman / Client dashboards still show sample content below the real "assigned projects" grid; those sections are replaced as their modules are built (blueprints, daily work, QA).

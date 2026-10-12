# 0003: Projects and team assignment

| Field | Value |
|---|---|
| File | `supabase/migrations/0003_projects.sql` |
| Written | 2026-10-09 |
| Applied | by 2026-10-09 (verified: `projects`, `project_members` and `is_project_member()` respond via API) |
| Depends on | 0001, 0002 |
| Status | Applied |
| Reversible | Yes (deletes all projects and assignments) |

## Purpose
Roadmap step 3. Admins create projects and assign Engineers, Foremen and Clients. Everyone else sees only the projects assigned to them, enforced by RLS, not by the UI.

## Objects
| Type | Name | Notes |
|---|---|---|
| Enum | `project_phase` | `plan_review`, `team_briefing`, `mobilization`, `execution` (Valencia's process stages) |
| Enum | `project_status` | `planning`, `active`, `on_hold`, `completed`, `cancelled` |
| Table | `projects` | id, code (unique, 2-30 chars), name, location, client_name, description, phase, status, start_date, end_date, created_by, timestamps |
| Table | `project_members` | (`project_id`, `user_id`) primary key, `member_role` (copied from the profile), assigned_by; index on `user_id` |
| Function | `check_project_member()` | trigger: assignee must be an active engineer/foreman/client; sets `member_role` |
| Function | `is_project_member(pid)` | caller is active and assigned to the project (security definer, avoids RLS recursion) |
| Function | `log_project_change()` | trigger: writes every insert/update/delete to `audit_log` |
| Triggers | `projects_touch`, `project_members_check`, `projects_audit`, `project_members_audit` | |

## Security and RLS (both tables have RLS on)
| Table | Operation | Rule |
|---|---|---|
| `projects` | select | `has_permission('projects.manage')` OR assigned (`is_project_member`) |
| `projects` | insert / update / delete | `has_permission('projects.manage')` (Super Admin, or Admin granted it, with MFA) |
| `project_members` | select | manage permission, own row, or member of the same project |
| `project_members` | insert / update / delete | manage permission only |
| `profiles` | select (added policy) | project managers can list active engineers/foremen/clients without needing `users.view` |

Result: an Engineer/Foreman/Client querying `projects` gets only their assigned rows; a pending, rejected or disabled user gets none.

## Verification
```sql
select count(*) from public.projects;
select tablename, policyname, cmd from pg_policies
  where schemaname = 'public' and tablename in ('projects','project_members');
-- after creating a project and assigning someone in the app:
select action, details->'row'->>'code' from public.audit_log
  where action like 'projects.%' order by id desc limit 5;
```
App test: log in as an assigned Engineer (sees the project), then as an unassigned Engineer (empty list).

## Rollback
```sql
drop table if exists public.project_members, public.projects cascade;
drop function if exists public.log_project_change(), public.check_project_member(), public.is_project_member(uuid);
drop policy if exists "project managers view assignable profiles" on public.profiles;
drop type if exists public.project_status, public.project_phase;
```

## Notes
- Deleting a project cascades to its assignments; the deletion is recorded in `audit_log`.
- Later tables (blueprints, pins) must follow the same pattern: readable only via `is_project_member(project_id)` or `has_permission(...)`.

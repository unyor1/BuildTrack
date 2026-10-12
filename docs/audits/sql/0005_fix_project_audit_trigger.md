# 0005: BUG FIX - `record "new" has no field "user_id"` when creating a project

| Field | Value |
|---|---|
| File | `supabase/migrations/0005_fix_project_audit_trigger.sql` |
| Written | 2026-10-09 |
| Applied | partly by hand (audit-trigger function), completed 2026-10-09 by the agent via the connector (idempotent re-run: `create or replace` / `drop trigger if exists`) |
| Depends on | 0001-0004 |
| Status | Applied and verified (triggers exist, six FKs on delete set null) |
| Reversible | Yes (see Rollback) |

## The bug
Creating a project returned `record "new" has no field "user_id"`.

**Root cause:** migration 0003 attached one audit trigger function, `log_project_change()`, to both `projects` and `project_members`. It read `NEW.user_id`, a column that exists only on `project_members`. Postgres evaluates that field reference even inside a `CASE` branch that is never taken, so every insert / update / delete on `projects` failed (and nothing was audited).

**Reproduced** with the local harness before the fix (`pnpm test:sql -- --upto 4`): 5 tests failed with the exact message. After 0005: all pass.

## Fix
- `log_project_change()` now reads the row as `jsonb` (`to_jsonb(new)` / `to_jsonb(old)`), so no table-specific column is referenced. Behavior is unchanged: it writes `projects.insert|update|delete` and `project_members.*` rows to `audit_log`.

## Related hardening found during the review
| Problem | Change |
|---|---|
| `audit_log.actor_id/target_id`, `profiles.approved_by`, `admin_permissions.granted_by`, `projects.created_by`, `project_members.assigned_by` referenced `auth.users` with no delete rule: deleting any user who ever approved/created/was logged would be refused | all six FKs recreated with `on delete set null` (history stays, actor becomes null) |
| `created_by` / `assigned_by` were never filled | new triggers `projects_actor`, `project_members_actor` set them from `auth.uid()` (not trusted from the client) |

## Objects
| Type | Name |
|---|---|
| Function (replaced) | `log_project_change()` |
| Function (new) | `set_actor_columns()` |
| Triggers (new) | `projects_actor`, `project_members_actor` (before insert) |
| Constraints (replaced) | `audit_log_actor_id_fkey`, `audit_log_target_id_fkey`, `profiles_approved_by_fkey`, `admin_permissions_granted_by_fkey`, `projects_created_by_fkey`, `project_members_assigned_by_fkey` |

## Security
- No RLS change. Audit rows still cannot be written by users directly (only by the security-definer trigger).

## Verification
```sql
-- as an Admin in the app: create a project, then in the SQL Editor
select action, details->'row'->>'code' as code, actor_id from public.audit_log
where action = 'projects.insert' order by id desc limit 3;
select code, created_by from public.projects order by created_at desc limit 3;
```

## Rollback
```sql
drop trigger if exists projects_actor on public.projects;
drop trigger if exists project_members_actor on public.project_members;
drop function if exists public.set_actor_columns();
-- restoring the broken log_project_change() is NOT recommended; FK rules can stay.
```

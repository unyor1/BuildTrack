# 0004: Default permissions for new Admins

| Field | Value |
|---|---|
| File | `supabase/migrations/0004_default_admin_permissions.sql` |
| Written | 2026-10-09 |
| Applied | by hand before 2026-10-09 (verified through the connector) |
| Depends on | 0001, 0003 |
| Status | Applied |
| Reversible | Yes |

## Purpose
Completes Milestone 3. An Admin with no permissions cannot open Project Management (RLS requires `projects.manage`). Every account that becomes an `admin` now automatically receives a minimal set; the Super Admin can still change it in User Management > Permissions.

## Objects
| Type | Name | Notes |
|---|---|---|
| Function | `grant_default_admin_permissions()` | security definer; on insert or role change to `admin` inserts `users.view`, `projects.manage`, `blueprints.manage` (idempotent) |
| Trigger | `profiles_default_admin_permissions` | after insert or update of `role` on `profiles` |
| Data | backfill | existing Admins with zero permissions receive the same defaults |

## Security
- Defaults deliberately exclude `users.create/edit/approve/disable/impersonate` and `biometrics.manage` (least privilege).
- Role changes only happen through the `admin-users` Edge Function (service role) or the SQL Editor, so the trigger cannot be triggered by ordinary users (they cannot update `role`, see 0001).

## Verification
```sql
select pr.email, array_agg(ap.permission order by ap.permission) as permissions
from public.profiles pr left join public.admin_permissions ap on ap.user_id = pr.id
where pr.role = 'admin' group by pr.email;
```
App test: Super Admin creates an Admin; that Admin signs in (with MFA) and can open Project Management but sees no Create/Disable buttons in User Management.

## Rollback
```sql
drop trigger if exists profiles_default_admin_permissions on public.profiles;
drop function if exists public.grant_default_admin_permissions();
-- permissions already granted stay; remove manually in User Management if wanted.
```

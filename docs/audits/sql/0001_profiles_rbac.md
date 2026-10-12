# 0001: Profiles, RBAC, admin permissions, audit log

| Field | Value |
|---|---|
| File | `supabase/migrations/0001_profiles_rbac.sql` |
| Written | 2026-10-08 |
| Applied | 2026-10-08 via SQL Editor (verified 2026-10-09: `profiles` queryable) |
| Depends on | Supabase Auth (`auth.users`) |
| Status | Applied |
| Reversible | Yes (see Rollback; deletes all profiles) |

## Purpose
Gives every sign-up a `profiles` row with a role and approval status, so the app can enforce Role-Based Access Control in the database. Adds per-admin permissions (least privilege) and an audit log.

## Objects
| Type | Name | Notes |
|---|---|---|
| Enum | `app_role` | `super_admin`, `admin`, `engineer`, `foreman`, `client` |
| Enum | `user_status` | `pending` (default), `active`, `rejected`, `disabled` |
| Table | `profiles` | `id` = `auth.users.id`; email, full_name, phone, company, position, discipline (`civil_structural`/`architectural`/`mep`), role (null until approved), status, approved_by, approved_at, timestamps |
| Table | `admin_permissions` | (`user_id`, `permission`); allowed: `users.view/create/edit/approve/disable/impersonate`, `biometrics.manage`, `projects.manage`, `blueprints.manage` |
| Table | `audit_log` | actor_id, target_id, action, details (jsonb), created_at |
| Function | `is_active()` | caller's profile is `active` |
| Function | `is_super_admin()` | active Super Admin (replaced by 0002) |
| Function | `has_permission(p)` | Super Admin, or active Admin holding permission `p` (replaced by 0002) |
| Function | `handle_new_user()` | trigger body: creates a `pending` profile from auth metadata. Role is never read from metadata |
| Function | `touch_updated_at()` | sets `updated_at` |
| Trigger | `on_auth_user_created` | after insert on `auth.users` |
| Trigger | `profiles_touch` | before update on `profiles` |

Helper functions are `security definer` with `search_path = ''` so RLS policies can call them without recursion.

## Security and RLS (all three tables have RLS on)
| Table | Who | Allowed |
|---|---|---|
| `profiles` | any signed-in user | read own row; update only `full_name, phone, company, position` of own row |
| `profiles` | holder of `users.view` | read all rows |
| `profiles` | anyone via API | no insert/delete; role/status/approval changes only through Edge Function `admin-users` (service role) |
| `admin_permissions` | user | read own rows |
| `admin_permissions` | Super Admin | read all; nobody can write via API (Edge Function only) |
| `audit_log` | Super Admin | read; nobody can write via API |

## Verification
```sql
select count(*) from public.profiles;
select tgname from pg_trigger where tgname = 'on_auth_user_created';
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'profiles';
```
After a test sign-up: a new `profiles` row exists with `status = 'pending'` and `role is null`.

## Rollback
```sql
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.audit_log, public.admin_permissions, public.profiles cascade;
drop function if exists public.handle_new_user(), public.touch_updated_at(),
  public.has_permission(text), public.is_super_admin(), public.is_active();
drop type if exists public.user_status, public.app_role;
```

## Notes
- First Super Admin is created only by `supabase/seeds/seed_super_admin.sql`.
- Google sign-ups also land as `pending`.

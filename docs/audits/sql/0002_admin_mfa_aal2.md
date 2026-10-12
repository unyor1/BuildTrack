# 0002: Admin privileges require authenticator MFA (aal2)

| Field | Value |
|---|---|
| File | `supabase/migrations/0002_admin_mfa_aal2.sql` |
| Written | 2026-10-09 |
| Applied | by 2026-10-09 (verified: `is_aal2()` exists via API) |
| Depends on | 0001 |
| Status | Applied |
| Reversible | Yes (restore the 0001 versions of the two functions) |

## Purpose
Admin and Super Admin powers must only work in a session that passed the TOTP (Google Authenticator) challenge. Supabase marks such sessions `aal2` in the JWT; a password-only session is `aal1`.

## Objects
| Type | Name | Change |
|---|---|---|
| Function | `is_aal2()` | new: `auth.jwt() ->> 'aal' = 'aal2'` |
| Function | `is_super_admin()` | replaced: now also requires `is_aal2()` |
| Function | `has_permission(p)` | replaced: Admins need `is_aal2()`; Super Admin path via `is_super_admin()` |

## Security
- Every policy using `has_permission` / `is_super_admin` (profiles, admin_permissions, audit_log, projects, project_members) returns nothing to an admin until MFA is verified.
- Users can always read their own profile (policy "own profile" does not use these functions), so the app can show the MFA screen.
- Matches the app (`RouteGuard` / `MfaPage`) and the Edge Function guard, which also reject non-aal2 admin calls.
- `is_aal2()` is executable by anon (Postgres default) and returns `false`; it exposes nothing.

## Verification
```sql
select public.is_aal2();   -- false in the SQL Editor (no JWT)
select proname from pg_proc where proname in ('is_aal2','is_super_admin','has_permission');
```
In the app: an admin who has not entered the TOTP code sees an empty user list (and the MFA screen); after verification the list loads.

## Rollback
```sql
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active' and role = 'super_admin');
$$;
create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select 1 from public.profiles pr join public.admin_permissions ap on ap.user_id = pr.id
    where pr.id = auth.uid() and pr.status = 'active' and pr.role = 'admin' and ap.permission = p);
$$;
drop function if exists public.is_aal2();
```
Drop `is_aal2` only after nothing references it.

## Notes
- Requires TOTP enabled in Supabase Auth settings.
- Locked out? Remove the factor: Dashboard > Authentication > Users > the user > remove MFA factor.

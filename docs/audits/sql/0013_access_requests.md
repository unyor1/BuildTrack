# 0012 + 0013: Base `user` role, self-service sign-up, and "Request elevated access"

| Field | Value |
|---|---|
| Files | `supabase/migrations/0012_user_role.sql`, `supabase/migrations/0013_access_requests.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration names | `user_role` (0012), `access_requests` (0013) |
| Depends on | 0001-0011 |
| Status | **Applied** and verified (role list includes `user`, RLS on, trigger functions not executable by anon/signed-in) |
| Reversible | Partly: the table and function changes can be undone (below); a Postgres enum value cannot be removed |

## New state machine
```
sign-up (email + 6-digit OTP, or Google) -> profile: role `user`, status `active`   (NO admin approval)
user -> "Request elevated access" (engineer | foreman | client) -> request `pending`
admin with users.approve: approve (role becomes the requested one) | reject (user stays `user`, may ask again)
user may cancel their own pending request
```
Before this change a sign-up was `pending` with no role until an admin approved it. A `user` sees no project data (RLS only exposes projects to assigned members and admins).

## 0012
`alter type app_role add value 'user'` (separate migration because Postgres cannot use a new enum value in the transaction that adds it).

## 0013 objects
| Type | Name | Notes |
|---|---|---|
| Column | `profiles.avatar_url` | https only, max 500 chars (Google profile picture) |
| Function (replaced) | `handle_new_user()` | role `user`, status `active`; copies name (`full_name` or Google `name`), phone, company, position, avatar; text trimmed (120/40); a role/status in sign-up metadata is still ignored |
| Data | backfill | profiles with no role and status `pending` became `user`/`active` (none existed on the live project) |
| Table | `access_requests` | requested_role in (engineer, foreman, client) only; discipline; message (500); status pending/approved/rejected/cancelled; decided_by/at/note |
| Index | `access_requests_one_pending` | one pending request per user |
| Triggers | `access_requests_prepare` (database sets user_id/status, only active `user` accounts may ask), `access_requests_guard` (user may only cancel own pending request), `access_requests_audit` | |

## Access rules
| Action | Who |
|---|---|
| Create a request | the signed-in basic user, for themselves |
| Cancel a request | the owner, while pending |
| Read requests | the owner; admins with `users.approve` or `users.view` (MFA) |
| Approve / reject | **only** the `admin-users` Edge Function (actions `approve_request` / `reject_request`), which needs `users.approve` + MFA, claims the request atomically (no double decision), only accepts Engineer/Foreman/Client, rolls the claim back if the profile update fails, and writes `access.approve` / `access.reject` to the audit log |
| Admin or Super Admin role | can never be requested or self-assigned |

## Edge Function `admin-users` (version 2, deployed through the connector, verify_jwt on)
New actions `approve_request`, `reject_request`; `user` added to the allowed role list (so an admin can create or demote to `user`). Existing actions unchanged. Verified: preflight 200, call without a session 401.

## Tests (`supabase/tests/50-user-role.cases.mjs`, suite 86/86)
Sign-up becomes an active user; injected role ignored; Google-style metadata and avatar rules; basic user sees no project data and cannot change own role/status; request creation with spoofed fields; forbidden roles; only basic active accounts may ask; one pending request; cancel; users cannot approve/edit/delete; privacy of requests; admins cannot decide through the API; audit rows; approved user can be assigned and sees the project.

## Rollback
```sql
drop table if exists public.access_requests cascade;
drop function if exists public.prepare_access_request(), public.guard_access_request_update();
alter table public.profiles drop column if exists avatar_url;
-- restore 0001/0011-era handle_new_user() (pending, no role) if the old flow is wanted again.
-- The enum value 'user' stays (Postgres cannot drop enum values).
```

## Live verification (2026-10-09, transaction rolled back)
Inserted a real `auth.users` row with `{"role":"super_admin"}` in its metadata: profile became `user` / `active`. As that user: request created (spoofed `user_id` replaced by the caller), second pending request blocked (`access_requests_one_pending`), self-approval blocked, self role change blocked (role stayed `user`). No rows left behind.

# 0008: Activity feed for administrators

| Field | Value |
|---|---|
| File | `supabase/migrations/0008_activity_feed.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz` first) |
| Connector migration name | `activity_feed` |
| Depends on | 0001-0007 |
| Status | **Applied** and verified (anon cannot execute, signed-in users can; checks run inside) |
| Reversible | Yes |

## Purpose
The Admin Dashboard and Project Overview showed invented activity. `audit_log` is readable only by the Super Admin (it stores raw row snapshots), so Admins could not see real activity. This adds a safe summary instead of loosening that table.

## Object
`get_activity(pid uuid default null, lim integer default 20)` returns `id, created_at, actor_name, actor_role, action, subject` (newest first, limit clamped 1..50). `security definer`, `search_path = ''`.
- Rows are returned only when the caller has `users.view` or `projects.manage` (both require MFA, see 0002); everyone else gets an empty result.
- `pid` limits the feed to one project (project rows and team changes).
- `subject` is derived text (project code + name, "person on CODE", email, or target name); raw `details` JSON is never returned.
- EXECUTE revoked from public/anon; granted to authenticated.

## Tests (`pnpm test:sql`, 28/28)
Admin sees summaries (project creation with its code, no raw details), project filter excludes other projects, empty for engineer / admin without MFA / admin without permission, blocked for anon, limit clamped.

## Verification
```sql
select proname, has_function_privilege('anon', oid, 'execute') as anon,
       has_function_privilege('authenticated', oid, 'execute') as signed_in
from pg_proc where proname = 'get_activity';   -- anon false, signed_in true
```

## Rollback
```sql
drop function if exists public.get_activity(uuid, integer);
```

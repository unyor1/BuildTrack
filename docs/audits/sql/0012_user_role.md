# 0012: Base `user` role

| Field | Value |
|---|---|
| File | `supabase/migrations/0012_user_role.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `user_role` |
| Depends on | 0001-0011 |
| Status | **Applied** and verified (`app_role` now lists `user`) |
| Reversible | No. Postgres cannot remove an enum value; the value is harmless when unused |

## Purpose
Adds the value `user` to the `app_role` enum. It is a separate migration because Postgres cannot use a new enum value in the same transaction that adds it. Everything that uses the role (sign-up behavior, access requests, RLS) is in 0013.

## Object
`alter type public.app_role add value if not exists 'user';`

## Verification
```sql
select array_agg(e.enumlabel order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'app_role';
-- super_admin, admin, engineer, foreman, client, user
```

## Rollback
None needed. To stop using the role, restore the previous `handle_new_user()` (see `0013_access_requests.md`).

See `0013_access_requests.md` for the behavior change and its tests.

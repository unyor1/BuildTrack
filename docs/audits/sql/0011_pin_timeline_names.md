# 0011: Pin timeline with names

| Field | Value |
|---|---|
| File | `supabase/migrations/0011_pin_timeline_names.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `pin_timeline_names` |
| Depends on | 0010 |
| Status | **Applied** and verified (anon cannot execute, signed-in users can; checks run inside) |
| Reversible | Yes |

## Purpose
`pin_events` stores only actor ids, and project members cannot read each other's profiles. The pin panel needs "who did what", so this function returns the timeline with names and roles, never emails.

## Object
`get_pin_timeline(p_pin uuid)` returns `id, created_at, kind, from_status, to_status, note, actor_name, actor_role`, oldest first. `security definer`, `search_path = ''`. Same visibility as the timeline itself: Engineers, Foremen and admins who can see the project (MFA for admins); Clients, outsiders, pending users and anonymous callers get nothing.

## Tests (`supabase/tests/40-timeline.cases.mjs`, suite total 72/72)
Names/roles/status change returned; ordering; no emails; empty for Client, outsiders, pending, admin without MFA; anon blocked; project manager can read.

## Rollback
```sql
drop function if exists public.get_pin_timeline(uuid);
```

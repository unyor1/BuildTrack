# 0020: Notification centre, invitation codes, audit log reader, pin severity, avatars

| Field | Value |
|---|---|
| File | `supabase/migrations/0020_notifications_invites_audit.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `notifications_invites_audit` |
| Depends on | 0001-0019 |
| Status | **Applied** and verified (rolled-back live check, advisor reviewed) |
| Reversible | Yes, see Rollback |

## Purpose
Phase 1 of `docs/BUILDTRACK_PRODUCT_ROADMAP.md`: people are told when something needs them (bell), a basic user can become Engineer / Foreman / Client with an invitation code, admins can read the audit trail, pins carry a severity for the issue register, and profile photos can be uploaded.

## Objects
| Type | Name | Notes |
|---|---|---|
| Table | `notifications` | per user: kind, title, body, link (regex-checked, internal paths only), project, entity, `dedupe_key` (unique, partial), `read_at`. RLS: a user selects and deletes only their own; inserts only through definer functions |
| Table | `invite_codes` | 12 hex characters, role engineer / foreman / client (never admin), discipline, note, `max_uses` 1-100, `uses`, `expires_at`, `disabled` |
| Tables | `invite_redemptions`, `invite_attempts` | who used which code; failed attempts for the rate limit (RLS on, no policy on purpose: only definer functions touch them) |
| Triggers | `access_requests_notify`, `profiles_role_notify`, `pins_notify` | new request -> Super Admins and admins with `users.approve`; decision -> requester; role granted -> user; pin for review / issue -> project engineers; verified -> assigned foreman and project clients; sent back -> assigned foreman; new assignee -> assignee |
| RPC | `generate_due_notifications()` | engineers / foremen: pins due soon or overdue, once per pin per day (dedupe key) |
| RPC | `mark_notifications_read(uuid[])` | own rows only |
| RPC | `create_invite`, `set_invite_disabled` | need `users.approve` and aal2; audited |
| RPC | `redeem_invite(code)` | basic active user with confirmed email; 8 misses per hour; applies the role, approves a pending request, audited; returns `{ok, reason}` |
| RPC | `get_audit_log(search, action, from, to, limit, offset)` | needs `users.view` |
| Column | `pins.severity` | low / medium (default) / high / critical; edits are recorded in the pin timeline |
| Storage | public bucket `avatars` | 2 MB png / jpeg / webp; each user writes only inside their own `<uid>/` folder; `profiles.avatar_url` is the only profile column users may update directly |

## Tests (`supabase/tests/96-notifications-invites.cases.mjs`, suite 171/171)
Notification fan-out per trigger, actor excluded, reminders once per day, privacy and link validation, invite lifecycle (create, limits, expiry, disabled, admin role refused, rate limit, readability), severity logging, audit log permissions, avatar column grant.

## Verification (2026-10-11, live, rolled back)
As the Super Admin: invite created (12 hex characters), `get_audit_log` returned the `invite.create` row, a new pin defaulted to severity `medium`. Nothing left behind. Advisors: the six new RPCs are intended SECURITY DEFINER functions that check the caller inside; `invite_attempts` "RLS enabled, no policy" is deliberate (internal). Still open from earlier: leaked-password protection in the Auth settings (owner action).

## Rollback
```sql
drop trigger if exists pins_notify on public.pins;
drop trigger if exists profiles_role_notify on public.profiles;
drop trigger if exists access_requests_notify on public.access_requests;
drop function if exists public.get_audit_log(text, text, timestamptz, timestamptz, int, int);
drop function if exists public.redeem_invite(text), public.set_invite_disabled(uuid, boolean), public.create_invite(app_role, text, text, int, int);
drop function if exists public.mark_notifications_read(uuid[]), public.generate_due_notifications();
drop table if exists public.invite_attempts, public.invite_redemptions, public.invite_codes, public.notifications;
alter table public.pins drop column severity;
```
(The helper functions `notify_user`, `display_name`, `role_home` and the `avatars` bucket / policies are removed the same way if a full rollback is needed.)

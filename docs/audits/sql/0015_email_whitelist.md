# 0015: Email whitelist (pre-approved roles)

| Field | Value |
|---|---|
| File | `supabase/migrations/0015_email_whitelist.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `email_whitelist` |
| Depends on | 0001-0014 (0016 fixes the access-request guard this migration relies on) |
| Status | **Applied** and verified (RLS on, one read policy, functions not callable by API roles, advisor: no new findings, live rolled-back check passed) |
| Reversible | Yes (see Rollback) |

## Purpose
Admins can pre-register trusted emails with a role. When the owner of that email confirms their address (OTP code or Google), they receive the role immediately: no pending state, no access request, no review.

## Objects
| Type | Name | Notes |
|---|---|---|
| Table | `whitelisted_emails` | `email` (unique, lowercase, valid format), `assigned_role` (`engineer`/`foreman`/`client`/`admin`), optional `discipline`, `note` (<= 200), `created_by`, `used_at`, `used_by` |
| Function | `apply_whitelist(uuid)` | SECURITY DEFINER. Applies a matching, unused entry to an active basic (`user`) account whose email is confirmed. Sets role/discipline/approved_by, marks the entry used, closes a pending access request ("Pre-approved by the whitelist"), writes audit `whitelist.apply` |
| Triggers on `auth.users` | `on_auth_user_whitelist_insert`, `on_auth_user_whitelist_confirm` | insert with a confirmed email (Google) and the `email_confirmed_at` null -> not null transition (OTP) |
| Trigger | `whitelisted_emails_added` | adding an email whose owner already has a confirmed basic account applies it immediately |
| Trigger | `whitelisted_emails_audit` | every insert/update/delete is audited |

## Security and RLS
- **No pre-hijack:** the role is applied on email *confirmation*, never at account creation. Someone who registers with a trusted address cannot obtain the role without access to that inbox.
- Single use; used entries remain as history. Disabled accounts and accounts that already have a role are never touched. `super_admin` and `user` cannot be whitelisted (check constraint). `admin` may only be added by a Super Admin (enforced in the Edge Function).
- Read: admins with `users.approve` or `users.view` (MFA). Insert/update/delete are revoked from API roles: writes only through the `admin-users` Edge Function (service role).
- The three functions have execute revoked from `public`, `anon`, `authenticated`.

## Tests (`supabase/tests/70-whitelist.cases.mjs`)
Role only on confirmation; pre-hijack blocked; Google-style sign-up and email case; single use; immediate apply for an existing account; pending access request closed; existing roles and disabled accounts left alone; entry validation; read access and no API writes; functions not callable; audit rows.

## Verification (live, rolled back)
Real `auth.users` insert with a whitelisted address stayed `user`; confirming the email made it `engineer` and marked the entry used; a pending access request was approved; adding an entry for an existing confirmed account made it `foreman`. Afterwards: 0 entries, 3 profiles, 0 requests.

## Rollback
```sql
drop trigger if exists on_auth_user_whitelist_insert on auth.users;
drop trigger if exists on_auth_user_whitelist_confirm on auth.users;
drop table if exists public.whitelisted_emails cascade;
drop function if exists public.apply_whitelist(uuid), public.trg_apply_whitelist(), public.trg_whitelist_added();
```

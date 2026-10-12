# 0032: Right to erasure ("delete my data")

| Field | Value |
|---|---|
| File | `supabase/migrations/0032_data_requests.sql` |
| Applied | 2026-10-12, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Depends on | 0001-0031 |
| Status | **Applied** and verified (SQL tests 256/256, function privileges checked live, security advisors: no new kind of finding) |
| Reversible | Yes (drop the table and four functions); erased data cannot be restored |

## Purpose
Under RA 10173 a person may ask for their personal data to be deleted. The person asks; an administrator carries it out or declines with a reason.

## Objects
| Type | Name | Notes |
|---|---|---|
| Table | `data_requests` | one open request per person; read-only to the API (owner, and admins with `users.approve` / `users.view`) |
| RPC | `request_data_erasure(reason)` | not for Super Admin / Admin accounts; audits `privacy.erasure_requested`; notifies admins who can approve |
| RPC | `withdraw_data_request`, `decline_data_request` | owner withdraws; `users.approve` declines with a reason (5+ chars) and the person is told |
| RPC | `erase_user_data(user, request, actor)` | **service role only**. Deletes identity rows, notifications, access requests, invite redemptions, the whitelist entry; sets name to "Deleted account", clears phone / company / position / avatar, email to `deleted-<id>@erased.invalid`, status `disabled`; closes the request; audits `privacy.erased`; ends all sessions; returns the storage paths to delete |

## Edge Function
`admin-users` v6, action `erase_user` (users.approve + MFA): calls `erase_user_data`, removes the ID photos (`identity-docs`) and avatar files, replaces the Auth email, bans the account, audits `privacy.erase_files`.

## What stays, and why
The account row (anonymised) and the work records pointing at it (reports, pins, inspections) belong to the project; the audit trail and `privacy_consents` stay as the legal record. The notice and modal say so.

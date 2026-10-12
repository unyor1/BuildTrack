# 2026-10-09: Email whitelist, access-request fix, confirmation dialogs (Milestone 3)

## What changed
- **DB 0015** `whitelisted_emails` + `apply_whitelist()` + triggers: a whitelisted email gets its role when the address is confirmed (OTP or Google). Docs: `sql/0015_email_whitelist.md`.
- **DB 0016** bug fix: the access-request guard from 0013 blocked the Edge Function (service role) from approving or declining requests. Now limited to API roles. Docs: `sql/0016_fix_access_request_guard.md`.
- **Edge Function `admin-users` v3** (deployed via connector, `verify_jwt` on, aal2 guard unchanged): new actions `whitelist_add` (1-50 emails, role, discipline, note; `admin` role only for Super Admin; existing Admin/Super Admin accounts skipped; duplicates reported) and `whitelist_remove` (unused entries only). Both need `users.approve` and are audited (`whitelist.add`, `whitelist.remove`).
- **UI** `UserManagement.tsx`: new "Whitelist" tab (list, status "Waiting for sign-up"/"Used", add dialog with multi-email input, remove). `ProjectManagement.tsx`: removing a member now asks first.
- **Confirmation dialogs** for: role change, creating an Admin/Super Admin, approve/reject (legacy and access requests), saving permissions, adding to / removing from the whitelist, removing project access. Already confirmed before: delete project, disable account, log in as user, delete pin/item/photo.

## Security notes
- The role is applied on email confirmation, never at account creation (no pre-hijack). Single use. `super_admin` cannot be whitelisted. Browser clients cannot write the table.
- Tests: `pnpm test:sql` 118/118 (new: `55-access-approval`, `70-whitelist`). Live rolled-back check passed; advisor shows only the intentional helpers and the owner-side leaked-password setting.

## Still open (owner)
Paste the email templates and set OTP length 6 in Supabase Auth; enable leaked-password protection; rotate secrets shared in chat.

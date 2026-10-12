# 0029: Strict Google gate, registration details, audit and session revocation

| Field | Value |
|---|---|
| File | `supabase/migrations/0029_google_registration_gate.sql` |
| Applied | 2026-10-12, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Depends on | 0001-0028 (`handle_new_user` from 0013, `apply_whitelist` from 0015, `notify_user` from 0020) |
| Status | **Applied** and verified (SQL tests + live end-to-end run on throwaway accounts) |
| Reversible | Yes, see Rollback |

## The defect and the fix
Before: any Google account that signed in was given a profile with role `user` and status `active` straight away (and could ask for elevated access). Now a Google sign-up creates a profile that is **`pending` with no access**, and only a completed registration plus an administrator decision (or a whitelist entry) activates it. The email + password flow is unchanged (6-digit code, basic `user`, active).

| Layer | What it does |
|---|---|
| Database (the guarantee) | `handle_new_user`: provider `google` -> status `pending`, `registration_completed_at` null, `signup_provider` google. Every RLS policy serves only `active` accounts, so a pending account reads nothing and cannot act, even if the browser is bypassed. |
| `complete_registration(...)` | The details a Google sign-up must send (full name, phone, access wanted, discipline for engineers, optional company / job title). Validated; stays pending; writes `oauth.enroll` to the audit log; notifies Super Admins and admins with `users.approve` (kind `registration.new`). Callable once. |
| Whitelist | `apply_whitelist` also frees a pending Google sign-up: whitelisted email -> pre-assigned role and `active` at once (registration marked complete). |
| Edge Function `oauth-gate` | Called right after Google sign-in from the LOGIN page. If the account is an unregistered Google account (google, pending, role user, no registration, never approved) it deletes the half-created account, audits `oauth.blocked` (with the email) and returns `removed: true`; the browser signs out and shows "No BuildTrack account found for this Google email. Please register first or contact your administrator." Anything else (an established or already registered account) is left untouched. The caller can only affect themselves (id from the verified token). |
| Browser | `lib/oauthIntent.ts` remembers whether Google was pressed on Login or Register (Google returns to `/login` either way, so no new redirect URL is needed in Supabase). `RouteGuard` runs the gate before showing anything and fails closed. |
| Audit | `profiles_audit_changes` trigger: every status or role change is logged (`profile.status_changed`, `profile.role_changed` with from / to), whoever made it. Also `oauth.enroll`, `oauth.blocked`, `user.reopen`, and the admin function adds `sessions_revoked`. |
| Sessions | `revoke_user_sessions(uuid)` (service role only) deletes `auth.refresh_tokens` and `auth.sessions`. The `admin-users` function calls it on **suspend** and **reject** (suspend also bans). The browser re-reads the profile every 30 s and on focus, so the screen switches to "Account suspended" quickly, and data access stops at once because RLS needs `active`. |

## Columns
`profiles.registration_completed_at`, `profiles.requested_role` (engineer / foreman / client), `profiles.signup_provider` (email / google / admin). All profiles that existed before are marked registered.

## Tests (`supabase/tests/99-google-gate.cases.mjs`, suite 237/237)
Unknown Google sign-up is pending (email sign-up unchanged); a pending account reads nothing and cannot self-activate; registration validation, one-time submission, administrators notified, `oauth.enroll` audited; approval audited with from / to and plain edits not logged as status changes; whitelisted Google email active with role at once; full status trail pending > active > disabled > active; only the service role can revoke sessions and it removes sessions and tokens; deleting a half-created account leaves no profile and keeps the audit rows.

## Live verification (throwaway accounts, all removed)
No token 401; anon key 401; unregistered Google profile removed by `oauth-gate` with the audit row; established account untouched; a Google account that registered stays pending, untouched, and reads no project data. One honest limit: the Supabase admin API labels created users "email", so the "google, pending" starting state was applied by hand in that live run; the trigger that produces it is covered by the SQL tests and the live function body check. A real Google sign-in with a real Google account is the final acceptance test (see the audit note).

## Rollback
```sql
drop trigger profiles_audit_changes on public.profiles;
drop function public.trg_audit_profile_changes(), public.revoke_user_sessions(uuid), public.complete_registration(text, text, text, text, public.app_role, text);
alter table public.profiles drop column registration_completed_at, drop column requested_role, drop column signup_provider;
-- then restore handle_new_user from 0013 and apply_whitelist from 0015 (they are `create or replace`)
```

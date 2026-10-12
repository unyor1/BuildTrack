# 2026-10-12: Google OAuth gate, Google registration, admin hardening

Migration 0029 (`sql/0029_google_registration_gate.md`), Edge Functions `oauth-gate` (new) and `admin-users` (v5), UI: `lib/oauthIntent.ts`, `components/RouteGuard.tsx`, `pages/Auth/{LoginPage,RegisterPage}.tsx`, `pages/Admin/UserManagement.tsx`.

## Policy change (CLAUDE.md updated)
Previously "Google -> profile `user`/`active` immediately (NO admin approval)". Now Google accounts need an administrator decision (or the whitelist). Email + password sign-up is unchanged on purpose (the directive named Google); if you want email sign-ups to wait for approval too, it is a one-line change in `handle_new_user`.

## 1. Login with Google no longer creates access
- Login page: "Sign in with Google" remembers the intent `login`. After Google returns, `RouteGuard` shows a skeleton and runs the gate: an unregistered Google account is deleted (no profile left behind) and the person lands on `/login` signed out with: "No BuildTrack account found for this Google email. Please register first or contact your administrator." If the check itself fails, the person is also signed out (fail closed) with a "could not check your account" message.
- A registered account continues by status: active -> role dashboard; pending -> "Awaiting administrator approval" (shows the access they asked for); rejected -> "Registration not approved"; disabled -> "Account suspended".

## 2. Registration with Google autofill
Register page: "Register with Google". Google provides the verified email and name; the person then completes a form (phone, access wanted, discipline for engineers, company, job title, terms) and submits. Status stays `pending` and administrators are notified, unless the email is on the whitelist (then the role is applied at once and no form is needed). "Use a different account" removes the half-created account.

## 3. Admin and user management
- Waiting registrations banner with a "Review now" filter; the list shows what each person asked for ("Asked for Engineer", "Details not sent yet"); the details view shows how they signed up and offers Approve as <asked role> (highlighted) / other roles / Reject. Approve is hidden for people who have not sent their details.
- Rejected registrations can be reconsidered (back to pending). Suspended accounts can be re-enabled. Filters by role and status, search, and the whitelist remain.
- Audit: every status / role change is written by the database; OAuth enrollment, blocked Google logins, reconsideration, whitelist use and admin decisions have readable labels in the Audit log.
- Sessions: suspend and reject end the person's sessions on the server; the person's browser notices within about 30 seconds, and data access stops immediately.

## Verification
SQL 237/237 (new `99-google-gate.cases.mjs`: 9 cases), lib 56/56, type-check clean, build ok. Live: function privileges, deployed functions, and an end-to-end run with throwaway accounts (all removed). Browser (temporary mock backend, removed afterwards, `.env.local` untouched): login intent with an unregistered Google account (signed out + message), gate failure (signed out, fail closed), registered pending account (awaiting screen, no removal), suspended and rejected screens, registration form validation and submission, admin queue banner, approve, reject, reconsider, re-enable.

## Not tested, honestly
A real Google sign-in with a real Google account (needs the owner's Google Cloud setup): please try once: (1) Login with an unknown Gmail -> blocked message; (2) Register with Google -> form -> awaiting screen; (3) approve it as admin -> the person's screen changes within ~30 s. In Supabase Auth settings no new redirect URL is needed (Google still returns to `/login`).

## Limits
Abandoned Google registrations (signed in on Register, never submitted) stay as pending-without-details until an admin rejects them or the person tries Login (which removes them). They have no access and are visible in User Management as "Details not sent yet".

# BuildTrack Auth & Admin Backend Setup (new Supabase project)

RULE: BuildTrack uses its OWN new Supabase project, Brevo sender, and Google OAuth client.
Nothing from "ebalik" (project, keys, SMTP, OAuth client) is reused or referenced.

## Architecture decisions

| Topic | Decision | Why |
|---|---|---|
| Auth | Supabase Auth (email+password, Google) | Built in, secure, no custom password code |
| OTP on sign-up | Supabase email OTP (6-digit `{{ .Token }}` in the Confirm-signup template), delivered through **Brevo SMTP** | Brevo sends mail, Supabase generates/verifies/expires codes. No custom OTP code to get wrong |
| Roles | `super_admin`, `admin`, `engineer`, `foreman`, `client` stored in `profiles.role` (never trusted from the browser) | RBAC enforced by Postgres Row Level Security |
| Approval gate | `profiles.status`: `pending` -> `active` / `rejected` / `disabled` | Matches the Admin approval flow in the UI |
| Least privilege | `admin_permissions` table: an Admin only gets the permissions a Super Admin grants (e.g. `users.view`, `users.create`, `users.edit`, `users.disable`, `users.impersonate`) | Admins are not all-powerful |
| Impersonation ("login as") | Edge Function using the service-role key, Super Admin only by default, every use written to `audit_log`, visible banner in the UI | Service-role key never reaches the browser |
| Disable user | `profiles.status = 'disabled'` + Auth admin `ban_duration` | Blocks login and existing sessions refresh |

## Phase A — You do these (about 30 min)

### A1. New Supabase project
1. https://supabase.com/dashboard -> **New project**. Use a NEW organization or at least a project named `buildtrack`. Do not pick the ebalik project.
2. Region: closest to the Philippines (Singapore). Set and save a strong DB password in your password manager.
3. Project Settings -> API: copy **Project URL** and **anon (publishable) key**. Do NOT share or commit the `service_role` key.

### A2. Brevo (email)
1. Create a Brevo account (or a new sender dedicated to BuildTrack). Verify a sender: use a BuildTrack address, e.g. a new Gmail or a domain address. Prefer a domain with SPF/DKIM/DMARC set in Brevo -> Senders & IP -> Domains, otherwise OTP mail lands in spam.
2. Brevo -> SMTP & API -> **SMTP** tab: note host `smtp-relay.brevo.com`, port `587`, login (shown there), and generate an **SMTP key** (this is the password).
3. Supabase -> Authentication -> **SMTP Settings** -> enable Custom SMTP: sender name `BuildTrack`, sender email = your verified sender, host/port/login/password from above.
4. Supabase -> Authentication -> **Email Templates -> Confirm signup**: replace the link with the code:
   `Your BuildTrack verification code is {{ .Token }}. It expires in 1 hour.`
5. Authentication -> Providers -> Email: enable "Confirm email". Set OTP expiry to 600 seconds (Authentication -> Sign In / Providers -> email OTP expiration).
6. Raise rate limits knowingly: Authentication -> Rate Limits (default email limits are low).

### A3. Google Auth
1. https://console.cloud.google.com -> create a NEW project `BuildTrack`.
2. APIs & Services -> OAuth consent screen: External, app name BuildTrack, support email, add yourself as test user.
3. Credentials -> Create **OAuth client ID** -> Web application:
   - Authorized JavaScript origins: `http://localhost:8443` (and your production URL later)
   - Authorized redirect URI: `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback`
4. Copy Client ID + Client Secret -> Supabase -> Authentication -> Providers -> **Google** -> enable and paste.
5. Supabase -> Authentication -> URL Configuration: Site URL `http://localhost:8443`; add redirect URLs `http://localhost:8443/**`.
6. Rule: Google sign-in creates a profile with `status = 'pending'`; it still needs Admin approval and a role.

### A4. Send me
- Project URL and the anon key (safe for frontend).
- Confirm Brevo SMTP and Google are enabled (never paste secrets in chat).

## Phase B — I build (after A1)

1. `supabase/migrations/0001_profiles_rbac.sql`: `profiles`, `admin_permissions`, `audit_log`, enum types, trigger that creates a `pending` profile on sign-up, helper functions `is_super_admin()`, `has_permission(text)`, RLS policies for every table.
2. `supabase/functions/admin-users`: create user, edit, enable/disable, set role, approve/reject (checks caller's permission server-side).
3. `supabase/functions/impersonate`: Super Admin (or permitted admin) gets a one-time session for a target user; writes `audit_log`; blocks impersonating Super Admins.
4. `.env.local` with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; `src/lib/supabase.ts`.
5. Frontend: real Login (email/password + Google), OTP screen on Register, role-based redirect, route guards, pending/disabled screens, logout.
6. Admin User Management wired up: list, search/filter, create, edit, enable/disable, approve with role, impersonate with banner + "return to my account".
7. Seed: first Super Admin created manually via SQL (documented), not through the app.

## Security checklist
- Service-role key only in Supabase Edge Function secrets, never in `src/` or git.
- `.env.local` in `.gitignore`.
- RLS on every table; role read from `profiles`, never from client metadata.
- Impersonation: logged, time-limited, cannot target Super Admin, banner always visible.
- Password policy: min 10 chars; enable leaked-password protection (Supabase Auth settings).
- Rate-limit OTP resend (60 s cooldown).

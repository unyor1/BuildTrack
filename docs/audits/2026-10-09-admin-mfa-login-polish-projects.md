# 2026-10-09: Admin TOTP MFA, login polish, Projects with RBAC

Category: security feature, UX, new feature. Database: migrations 0002 + 0003 written (not applied yet, see migrations-log).

## Edge Function deployment diagnosis (task 1)
- Re-tested `/functions/v1/admin-users` and `/functions/v1/impersonate`: still `404 Requested function was not found`. Not deployed.
- Frontend is correct: `supabase.functions.invoke(name)` resolves to `VITE_SUPABASE_URL/functions/v1/<name>`, URL matches the BuildTrack project. Function code exists in `supabase/functions/admin-users/`.
- Blocker: Supabase CLI is not logged in on this machine (`AccessTokenRequiredError`). Deploy must be run by the user. Added `pnpm functions:deploy` (package.json) for both functions.

## MFA (Google Authenticator / any TOTP app)
- `src/pages/Auth/MfaPage.tsx`: enroll (QR + manual key) on first admin login, challenge afterwards. Uses `supabase.auth.mfa.{listFactors,enroll,challengeAndVerify,unenroll}`.
- `src/lib/auth.tsx`: tracks assurance level; `mfaRequired` = active admin/super_admin without an aal2 session; `can()` is false until MFA is passed.
- `src/components/RouteGuard.tsx`: shows MfaPage before any panel for admins.
- Server side: `_shared/guard.ts` rejects admin calls without `aal2`; migration 0002 makes `is_super_admin()`/`has_permission()` require aal2.
- Impersonation of Admin accounts is now blocked (they cannot pass MFA). Engineer/Foreman/Client still allowed.

## Login polish
- Brand tokens in `src/index.css`: `--purple #9e1f93`, `--purple-dark #68135f`, `--gold #f18b00`; magenta login button with hover/disabled states; error/info notice styles.
- Pending ("Waiting for approval"), rejected ("Access denied"), disabled and missing-profile screens; network, rate-limit, disabled and unverified-email messages on login.

## Projects (roadmap step 3)
- `0003_projects.sql`: `projects`, `project_members`, RLS (assigned-only reads), audit triggers.
- Admin `ProjectManagement.tsx`: create/edit/delete projects, assign engineers/foremen/clients.
- `AssignedProjects.tsx` shown on Engineer Projects, Foreman Dashboard and Client Overview.
- Shared `components/Modal.tsx`; `lib/projects.ts` (types + `useProjects`).

## Manual steps required
1. Enable TOTP in Supabase (Authentication > Sign In / Providers > Multi-Factor).
2. Run migrations 0002 then 0003 in the SQL Editor.
3. `npx supabase login`, `npx supabase link --project-ref <ref>`, `pnpm functions:deploy`.

## Follow-up (same day): deploy still pending
- Re-tested: both functions still 404, CLI still has no token.
- `pnpm functions:deploy` now includes `--project-ref ruimjlhsfpaezkgfphsz --use-api` (no `link`, no Docker needed). Authentication via `SUPABASE_ACCESS_TOKEN` env var (personal access token created by the user at supabase.com/dashboard/account/tokens, set only in their own terminal, never shared or stored in the repo).

## Deployment completed (2026-10-09)
- `pnpm functions:deploy` run with the owner's personal access token (passed as an env var for that one command, not stored). Both functions deployed to project `ruimjlhsfpaezkgfphsz`.
- Verified: functions answer (no longer 404) and reject calls without an admin session.
- Action for owner: revoke the token at supabase.com/dashboard/account/tokens (it was shared in chat).

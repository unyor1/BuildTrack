# 2026-10-09: Edge Function error fix + folder restructure

Category: bug fix, structural change. Database changes: none.

## Problem
User Management showed "Failed to send a request to the Edge Function" on every action.

## Investigation (findings)
- `GET /rest/v1/profiles` on the BuildTrack project returned `200 []`: migration 0001 is applied.
- `OPTIONS` and `POST` to `/functions/v1/admin-users` and `/functions/v1/impersonate` returned **404 NOT_FOUND** from the Supabase gateway. Root cause: **the functions were never deployed**.
- The gateway's 404 preflight reply does not allow the `content-type` header, so the browser blocks the call and supabase-js reports a generic fetch error.
- Not a key problem: the frontend uses only the anon/publishable key plus the user's session JWT; the service-role key is only used inside the functions (injected by Supabase).
- Secondary issue found: on 4xx replies the app showed a generic message instead of the server's real message (e.g. "Missing permission: users.edit").

## Changes
- Added `src/lib/functions.ts` (`invokeFunction`): attaches the session, and maps failures to readable messages (not deployed/offline, expired session, server message, relay error). `UserManagement.tsx` and `lib/auth.tsx` (impersonation) now use it.
- `Auth/LoginPage.tsx`: friendly messages for disabled (banned), unverified email, rate limiting.
- Rejected on purpose: a `config.toml` with `verify_jwt = false` (would weaken the gateway auth check). Functions keep Supabase's default JWT verification on top of their own checks.

## Restructure
| From | To |
|---|---|
| `src/pages/LoginPage.tsx`, `RegisterPage.tsx` | `src/pages/Auth/` |
| `src/pages/LandingPage.tsx` | `src/pages/Public/` |
| `supabase/seed_super_admin.sql` | `supabase/seeds/seed_super_admin.sql` |
| `BUILDTRACK_*.md` (repo root) | `docs/` |
Imports updated in `src/App.tsx` and the moved files. `CLAUDE.md` layout section updated. `tsc --noEmit` passes.

## Required manual step
Deploy the functions: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase functions deploy admin-users`, `npx supabase functions deploy impersonate`.

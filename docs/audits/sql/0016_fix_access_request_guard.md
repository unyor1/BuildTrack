# 0016: Fix access-request guard (BUG FIX)

| Field | Value |
|---|---|
| File | `supabase/migrations/0016_fix_access_request_guard.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector |
| Connector migration name | `fix_access_request_guard` |
| Depends on | 0013 |
| Status | **Applied** and verified |
| Reversible | Yes (re-create the 0013 version of the function) |

## Problem
`guard_access_request_update()` (0013) rejected every update except "the user cancels their own pending request", for every caller. The `admin-users` Edge Function (service role) approves and declines requests with such an update, so **approving or declining an access request would have failed** with "You can only cancel your own pending request". The whitelist (0015) also closes pending requests and was blocked the same way. The bug was not visible earlier because no test exercised the server-side path.

## Fix
The restriction now applies to `authenticated` and `anon` (the roles reachable from the browser). Server-side code (service role, SECURITY DEFINER functions) can decide requests. Users still cannot approve, edit or reopen their own request (guard + the "cancel own pending request" RLS policy).

## Tests (`supabase/tests/55-access-approval.cases.mjs`)
Service role approves (user becomes the requested role) and declines (user stays basic and can ask again); a request can be decided only once (atomic claim); users cannot approve, edit or reopen their own request but can cancel it. The harness now has a `service_role` stand-in.

## Verification (live, rolled back)
A pending request was approved by a non-API context; the user-side restrictions remain in the function body. Advisor: no new findings.

## Rollback
Restore the 0013 definition of `guard_access_request_update()` (unconditional check).

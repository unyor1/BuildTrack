# 20261027110000_enrollment_progress

- **File:** `supabase/migrations/20261027110000_enrollment_progress.sql` (SHA-256 `01a4220aafb522e3429c8fe5ef1f0bbcd08a6194e086a0abd5fbc22d9dcdc38e`)
- **Status:** **Applied 2026-10-27** by the owner in the Supabase SQL Editor (inside `begin`/`commit`, with its `schema_migrations` row), after the connector `apply_migration` call was declined repeatedly. Verified read-only: history row, columns, one 7-argument signature (service_role only, invoker), function body identical to the file (line endings aside). `biometric-enrollment` v2 deployed (verify_jwt false as before; 401 without a device token). Security advisors unchanged apart from the expected entries. `pnpm test:sql` 457 passed.
- **Audit:** [ESP32 connection fix and registration steps](../2026-10-27-fingerprint-registration-steps.md)

## What it changes

- `worker_enrollment_requests`: `stage` (`''`, `place_first`, `lift`, `place_second`, `storing`, `confirm`; check constraint) and `stage_at`. Read by the existing Admin policy (`biometrics.manage` + project access); no new grant, still no API writes.
- `process_worker_enrollment` is dropped and re-created with a 7th parameter `p_stage text default ''`. Six-argument calls (the deployed receiver, existing tests) resolve to it; there is no overload. Grants: execute for `service_role` only (revoked from public, anon, authenticated), as before. Body is the applied 20261020090300 version (live md5 `0040b7b34bcaf8c37dc4748c4ab5477b` matched the local file on 2026-10-27) plus:
  - action `progress`: device credential and job ownership checked as for `completed`; unknown/null step refused (`Invalid enrollment stage`); a job that is no longer `capturing` answers `{acknowledged, discarded}` (the device stops and removes a template it stored); an expired job is failed; otherwise `stage` / `stage_at` are saved and `expires_at` moves to at most now + 90 s, never beyond `created_at + 10 minutes`.
  - claiming a job (`poll`) resets `stage` to `''`.
  - A step never links a worker. Linking stays on `completed` only.

## Tests

`supabase/tests/99-zzzzzzzzzzzzzzzzzzzzz-enrollment-progress.cases.mjs` (4 cases): steps saved and Admin-readable without linking; wrong step / device / token and website users (Admin, Foreman) refused, Foremen read nothing; cancelled job answers discarded, deadline extension and its 10-minute cap, expired job fails; six-argument call still works and there is exactly one function signature.

## After applying

1. Verify read-only: columns present, one signature `process_worker_enrollment(uuid,text,text,integer,uuid,text,text)`, ACL `postgres, service_role` only, `prosecdef = false`.
2. Deploy `biometric-enrollment` (handler accepts `progress`; keep `verify_jwt = false` as deployed: the device token is its authentication).
3. `get_advisors` (security): no change expected (invoker function, service_role only).
4. Rename the local file if the recorded version differs, and update this note, `migrations-log.md` and the README row.

## Rollback

Additive. Re-create the six-parameter function from 20261020090300 and drop the two columns only after no device sends `progress`. Not needed for data safety.

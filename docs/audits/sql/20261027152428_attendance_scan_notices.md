# 20261027152428_attendance_scan_notices

- **File:** `supabase/migrations/20261027152428_attendance_scan_notices.sql`. Originally prepared as `20261027150000`; renamed to match the connector-generated version, without changing the SQL. Do not apply the old filename again.
- **Status:** **Applied 2026-10-27** through the Supabase connector after explicit owner approval and 461 passing SQL tests. Verified migration history, RLS, project-staff SELECT policy, service-role-only invoker functions and both Realtime publications. `biometric-attendance` v3 is ACTIVE; device-token authentication is unchanged. See [rollout audit](../2026-10-27-scan-queue-rollout.md).
- **Audit:** [attendance scan pop-ups](../2026-10-27-attendance-scan-popups.md)

## What it changes

- **`attendance_unregistered_scans`:** scans that cannot count, with reason, scanner slot and worker when known. Unique per project, device and source event. RLS: project staff read; insert only by `service_role` through the functions.
- **`log_unregistered_scan`** (service_role): inserts once per source event and returns `{event_id: null, status: "unregistered", reason, occurred_at}`. A reused event ID with another time is refused.
- **`ingest_biometric_scan`** (same signature):
  - same device check and rate limit (now also counting unregistered scans);
  - a retried event gets its first answer;
  - an unknown slot (`not_linked`), an inactive worker (`inactive`) or a finger enrolled on another scanner (`other_device`) is logged and answered instead of raising. Before, those raised a 422, so the scanner kept the scan pending and stopped scanning.
- **`report_unregistered_scan`** (service_role, device-authenticated): the scanner found no matching finger. Logged as `no_match`, at most 30 per device per minute.
- **`supabase_realtime`:** adds `attendance_ignored_scans` and `attendance_unregistered_scans`, so the attendance screen hears about repeat and unregistered scans live. RLS applies. `99-evidence-lock` allowlist updated.

## Tests

- `99-zzzzzzzzzzzzzzzzzzzzzzz-scan-notices.cases.mjs` (4 cases):
  - unknown finger: logged, idempotent, never attendance, token and time checks;
  - unlinked / inactive / other scanner answered and logged; a recorded scan keeps its answer after deactivation;
  - rate limit of 30 per minute, with retries still answered;
  - staff read, clients and web users cannot read or write; publication contents.
- Updated: two expectations in `99-…-attendance-schedule` (now answered, not raised) and the publication allowlist.

## After applying

1. Read-only checks: table, policy, grants (`log_unregistered_scan` / `report_unregistered_scan` service_role only), publication.
2. Security advisors.
3. Deploy `biometric-attendance` v3 (routes `"result":"no_match"` to `report_unregistered_scan`, returns `status: "unregistered"`; `verify_jwt` false as deployed). Then flash the firmware.

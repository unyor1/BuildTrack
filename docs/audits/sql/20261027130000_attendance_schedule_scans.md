# 20261027130000_attendance_schedule_scans

- **File:** `supabase/migrations/20261027130000_attendance_schedule_scans.sql` (SHA-256 `276f2e1583c304f6f1b08fdf2e58e7a7b937ae402e9a85783d3516e8a6021c4f`)
- **Status:** **Applied 2026-10-27** by the owner in the Supabase SQL Editor (inside `begin`/`commit`, with its `schema_migrations` row), after the connector `apply_migration` call was declined repeatedly. Verified read-only: history row, both tables with RLS and their read policies, new event columns, function grants (`record_biometric_scan` / `ingest_biometric_scan` service_role only, `set_attendance_schedule` authenticated only, definer), all six function bodies identical to the file (line endings aside). Security advisors: 4 info / 94 warn (incl. the expected `set_attendance_schedule`) / 1 auth. `biometric-attendance` v2 deployed (calls `ingest_biometric_scan`, verify_jwt false as before; 401 without a device token). `pnpm test:sql` 457 passed.
- **Audit:** [attendance schedule and scan accuracy](../2026-10-27-attendance-schedule-scans.md)

## What it changes

- **`attendance_schedules`:**
  - one row per project: `time_in`, `time_out` (day shift: out later than in), `grace_minutes` 0–120 (default 15), `repeat_guard_minutes` 1–120 (default 15), `updated_by`, `updated_at`;
  - RLS: project staff read (`is_staff()` + `viewable_project_ids()`); no direct writes;
  - audited by `log_row_change`.
- **`set_attendance_schedule(project, time_in, time_out, grace, repeat)`:** security definer, `biometrics.manage` (MFA) + project access, validates every value and drops seconds. Granted to `authenticated` only.
- **`biometric_attendance_events`:**
  - `schedule_flag` (`on_time`, `late`, `early_out`, `returned`, `no_schedule`) and `minutes_off` (1–1440);
  - existing rows stay null and are not rewritten.
- **`attendance_ignored_scans`:**
  - received scans that did not become attendance (`repeat`, `out_of_order`), with the attendance row they point to;
  - unique per project/device/source event, so retries are idempotent;
  - staff read (same pattern); insert only by `service_role` through the functions.
- **`record_biometric_scan`** (new, invoker, `service_role` only) is the decision:
  - locks the worker row, so concurrent scans from several devices cannot both become the next IN;
  - a retried source event gets the same answer;
  - inactive workers are refused;
  - per worker and Manila day, against the latest accepted scan:
    - older than it: `out_of_order` (ignored);
    - closer than the repeat window (no schedule = 15 min): `repeat` (ignored);
    - otherwise the opposite of it (none, or OUT, gives IN).
  - Flags:
    - first IN after `time_in + grace`: `late`, minutes counted from `time_in`;
    - later INs the same day: `returned`;
    - OUT before `time_out`: `early_out`;
    - no schedule: `no_schedule`.
- **`record_biometric_attendance`** (old signature): accepts `in` / `out` / `auto` but ignores it and returns the counted row's id. The deployed receiver keeps working, with correct IN/OUT.
- **`ingest_biometric_device_event`** (old device entry point): same body as 20261020090300, but the rate limit (120/min/device) also counts ignored scans.
- **`ingest_biometric_scan`** (new device entry point, `service_role` only):
  - same device-token check, enrolled-device check and rate limit;
  - returns the jsonb decision (`event_id`, `status`, `direction`, `occurred_at`, `schedule_flag`, `minutes_off`).
- **`attendance_day_summary`:** same keys plus `late` and `ignored`.

## Tests

- `supabase/tests/99-zzzzzzzzzzzzzzzzzzzzzz-attendance-schedule.cases.mjs` (6 cases):
  - schedule rights and validation; staff read, clients cannot; audit;
  - IN, repeat ignored twice, early lunch OUT, back on site, on-time OUT, out-of-order ignored;
  - retries idempotent for recorded and ignored scans; reused IDs refused; late minutes; grace boundary; new Manila day starts IN;
  - old entry point ignores an `out` switch; no-schedule flag; Admin window respected;
  - token, not linked, enrolled device, rate limit counting ignored scans, no web access;
  - day summary `late` / `ignored`, ignored scans hidden from clients.
- Updated older cases (`99-zzzzzzzzz-attendance`) to the new rules:
  - a retry with another switch value is the same scan;
  - the old "late import" is now `out_of_order` and ignored;
  - summary keys.
- **Deliberate break:** disabling the repeat rule failed 3 cases; restored byte-for-byte.

## After applying

1. Read-only checks:
   - tables, columns, policies;
   - function grants: `record_biometric_scan` / `ingest_biometric_scan` `service_role` only, `set_attendance_schedule` `authenticated` only.
2. `get_advisors` (security): one more "authenticated can execute security definer" warning is expected for `set_attendance_schedule` (checks permission, MFA and project inside, like the enrollment RPCs).
3. Deploy `biometric-attendance` (handler calls `ingest_biometric_scan`; keep `verify_jwt = false` as deployed, the device token is its authentication).
4. Then flash the firmware that sends `"direction":"auto"`.
5. Rename the file if the recorded version differs; update this note, the log and the README.

## Rollback

Additive:
- re-create the 20261019104906 `record_biometric_attendance` and the 20261020090300 `ingest_biometric_device_event`;
- point the receiver back to `ingest_biometric_device_event`.

Keep the new columns and tables (they hold the audit of ignored scans). Never delete attendance rows without the owner's approval.

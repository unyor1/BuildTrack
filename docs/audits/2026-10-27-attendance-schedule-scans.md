# Attendance schedule and accurate fingerprint scans — 2026-10-27

## Request

Fix the fingerprint scanning logic to avoid double or inaccurate records. On Admin, add a setup where the Admin sets the site's (project's) time in and time out.

## What was wrong

- The scanner's IN/OUT switch (GPIO25) decided the direction and the database trusted it:
  - a switch left on IN recorded the evening scan as another IN;
  - one on OUT recorded a morning OUT.
- Every new scan became an attendance row. Only the identical retried event was de-duplicated.
- **Seen in live data:** the same worker recorded **IN twice, 39 seconds apart** (19:21:08 and 19:21:47 Philippine time, 2026-10-27). These two rows were not changed: deleting attendance needs the owner's approval.
- There was no schedule, so nothing could say late or early.

## Changes

### Database: `20261027130000_attendance_schedule_scans.sql` (NOT APPLIED, see below)

Details: [sql/20261027130000_attendance_schedule_scans.md](sql/20261027130000_attendance_schedule_scans.md).

- **The database decides Time IN / Time OUT** (`record_biometric_scan`). Per worker and Philippine day:
  - first accepted scan = IN, then OUT, then IN again;
  - the worker row is locked, so two devices cannot both create the next IN;
  - a retried event always gets the same answer.
- **Repeat scans are ignored:**
  - a scan within the project's repeat window (default 15 min) of the worker's last accepted scan;
  - a scan older than that last scan (late delivery).
  - Both go to `attendance_ignored_scans` (kept for checking), never to attendance.
- **Schedule** (`attendance_schedules`, `set_attendance_schedule`): time in, time out, grace, repeat window. Admins with `biometrics.manage` + MFA only; audited; project staff read it.
- **Each new attendance row carries a flag** (`schedule_flag` / `minutes_off`):
  - **Late:** first IN after time in + grace, minutes counted from time in;
  - **Early out:** OUT before time out;
  - **Back on site:** a later IN the same day;
  - **On time** otherwise;
  - **no_schedule** when none is set.
- **Old entry points still work but ignore the switch value**, so the receiver deployed today becomes correct as soon as the migration is applied. Their rate limit also counts ignored scans.
- **Day summary** adds `late` and `ignored`.

### Receiver (`biometric-attendance`, NOT DEPLOYED)

- Calls the new `ingest_biometric_scan`. `direction` is optional (`in`, `out` or `auto`) and never forwarded.
- The reply adds `status` (`recorded`, `repeat`, `out_of_order`), the decided direction and time, and the flag and minutes.
- `recorded: true` and `event_id` stay first, so older firmware that checks the reply prefix still accepts it.
- An unexpected database answer is a 503, never "recorded".

### Firmware (both sketches, compiled, NOT FLASHED)

- Sends `"direction":"auto"`; the GPIO25 switch is no longer read.
- Reads the reply and prints, for example:
  - "Time IN recorded at 07:58 (Late 12 min)";
  - "Already recorded: Time IN at 07:58. Repeat scan ignored.";
  - "Older scan ignored".
- The same matched finger within 60 s is not sent again (local guard; the server is still the authority).
- The durable single pending event, retries and TLS are unchanged.

### Admin and reports (web, local until deployed)

- **Admin → Biometric Registration → Attendance schedule** (new 4th tab, `components/attendance/AttendanceSchedule.tsx`, rules in `lib/attendanceScheduleModel.ts`):
  - time in, time out, grace period, "Ignore repeat scans within";
  - validation identical to the SQL limits, summary line ("late after 08:15"), Save only when changed, toasts, skeleton while loading;
  - a clear error when the table is not there yet;
  - a "How scans are counted" explanation.
- **Page text:** the setup steps now mention the schedule and the confirmation scan; the device note says the database decides IN/OUT.
- **Foreman attendance records:** new **Schedule** column (Late / Early out / On time / Back on site; "—" for older scans).
- **Attendance reports (print and CSV):**
  - Arrival (first IN flag) and Departure (last OUT flag) columns;
  - a Schedule column on every scan;
  - "Late arrivals" count and an explanatory note.
- Report data reads all event columns, so it also works before the migration.
- The standalone attendance screen was deliberately not changed (`codex.md`).

## Deploy order (important)

1. Apply `20261027130000_attendance_schedule_scans.sql` (owner approval). The current receiver and firmware then already get correct IN/OUT and repeat protection.
2. Deploy `biometric-attendance` (keep `verify_jwt = false` as deployed: device token authentication).
3. Flash the new firmware. **Not before step 2:** the receiver deployed today rejects `"auto"`, and the scanner would keep every scan pending.
4. Deploy the web app.
5. The Admin sets each project's schedule.

`20261027110000_enrollment_progress` (registration steps) is independent and also still waiting for approval.

## Verification

- `pnpm test:sql`: 457 passed (6 new; 4 older attendance cases updated to the new rules, each with a comment). **Deliberate break:** disabling the repeat rule failed 3 cases; restored byte-for-byte.
- `pnpm test:attendance`: receiver passes the optional / `auto` direction, never forwards a switch value, keeps the old-firmware reply prefix, returns repeat answers, and turns any unexpected answer into 503.
- `pnpm test:worker-enrollment`: 4 tabs, and the schedule tab gets the project. Schedule form:
  - defaults;
  - out-before-in blocked;
  - save arguments and success toast;
  - unchanged form cannot save;
  - refused save shows an error toast;
  - load failure shows the error and no form.
- `pnpm test:attendance-reports`: schedule rules and labels; arrival = first IN, departure = last OUT, late count.
- `pnpm test:foreman-attendance`: Schedule column labels.
- `pnpm check` passed (TypeScript, all suites, SQL, build). Both sketches compile for `esp32doit-devkit-v1` (82–83% flash).
- **Not verified:** nothing is live yet (no migration, no receiver deploy, no flash). No physical scan was made with the new logic; no browser visual check of the new tab.

## Applied (later on 2026-10-27)

- **Migration:** the owner ran `20261027110000` and `20261027130000` in the Supabase SQL Editor (each inside `begin`/`commit` with its `schema_migrations` row). The connector `apply_migration` call had been declined every time.
- **Verified read-only:**
  - history rows, tables, RLS and policies, columns, function grants;
  - all seven function bodies identical to the files once line endings are normalized;
  - security advisors as expected.
- **Receivers:** `biometric-enrollment` v2 and `biometric-attendance` v2 deployed, `verify_jwt` false as before; both answer 401 without a device token.
- **Local file restored:** `supabase/migrations/20261027130000_attendance_schedule_scans.sql` had been overwritten with a single character in the editor. It was restored from the session copy and its SHA-256 matches the recorded `276f2e15…` again.

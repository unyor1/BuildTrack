# ESP32 connection fix and fingerprint registration steps — 2026-10-27

## Request

Check the AS608 / ESP32 fingerprint registration and the Admin biometrics registration (and `codex.md`). Registration must have a UI for registering and confirmation, connected to the owner's ESP32 and the database, and the connection must work.

## What was found

- **Already built (kept):**
  - Admin → Biometric Registration (Register worker / Worker profiles / Devices).
  - Admin-only `request_worker_enrollment` / `cancel_worker_enrollment`, and the device-token receiver `biometric-enrollment` (deployed, ACTIVE).
  - Automatic slot assignment, and firmware that polls, captures twice and reports.
- **Live state before the fix:**
  - One device registered ("esp32- test") with `last_seen_at` **empty**.
  - Every enrollment request stayed `queued` (no slot claimed) until it timed out or was cancelled.
  - Function logs had no request from the device, only one manual curl `GET` (405).
- **Root cause (read from the board on COM5, CP210x):**
  - Wi-Fi, NTP time and the sensor were ready, but every POST returned **HTTP -1**.
  - The private sketch trusted only *GlobalSign ECC Root CA - R4*. The server actually sends supabase.co → WE1 → GTS Root R4 cross-signed by *GlobalSign Root CA* (RSA).
  - `openssl s_client -CAfile <that root>` failed the same way (`unable to get local issuer certificate`). The earlier Windows check had built a different chain.

## Changes

### Connection (no database change)

- `hardware/esp32-as608/tls-root-ca.pem` is now three public roots. Each fingerprint was checked; the table is in the hardware README:
  - GTS Root R4 and GTS Root R1, from pki.goog;
  - GlobalSign Root CA, from the Windows root store.
- OpenSSL verifies the live server with only this bundle on both chains:
  - ECDSA: WE1 → GTS Root R4;
  - RSA: WR1 → GTS Root R1.
- The private sketch embeds the bundle (the file stays Git-ignored and no secret was printed). `config.example.h` says which roots to paste.
- Enrollment errors now say why:
  - TLS / connection text for negative codes;
  - token problem for 401;
  - rejection for 422.

### Registration with confirmation

- **Firmware** (`attendance/attendance.ino` and the private sketch):
  - The device reports each step: first scan, lift, second scan, saving, confirmation scan. It stops when the server answers `discarded` (Admin cancelled, or the request expired).
  - After saving, it asks for a **third scan**, which must find exactly the new slot before it reports `completed`.
  - The slot is persisted before `storeModel`. A failed or cancelled confirmation, a discarded result or a reboot mid-registration removes that unconfirmed template. Otherwise it would match later scans and block the terminal with a 422 attendance rejection.
  - Pre-existing templates are still never touched.
  - Rejected step reports (for example before the migration) never stop a capture.
- **Receiver** (`biometric-enrollment/handler.ts`):
  - accepts `action: "progress"` with `request_id` and one known `stage`;
  - `stage` is refused on other actions;
  - `p_stage` is passed only for `progress`, so the receiver also works before the migration.
- **Migration `20261027110000_enrollment_progress.sql` (NOT APPLIED, see below):**
  - adds `stage` / `stage_at` on `worker_enrollment_requests`;
  - `process_worker_enrollment` gains action `progress`: same device/token checks, extends the deadline 90 s per step (max 10 minutes), answers `discarded` for a job that is no longer capturing;
  - a step never links a worker.
  - Details: [sql/20261027110000_enrollment_progress.md](sql/20261027110000_enrollment_progress.md).
- **Admin screen** (`components/attendance/WorkerFingerprint.tsx`, rules in new `lib/enrollmentModel.ts`):
  - **Scanner online / offline** badge from `last_seen_at`; the device list shows online or offline.
  - **Confirmation before starting** (`useConfirm`): worker name, scanner, worker present, only they touch the sensor, same finger three times.
  - **Live step list**: request sent, scanner ready, first scan, lift, second scan, saving, confirmation scan, registered. The step being done now is marked `aria-current`, with the instruction for the worker in the polite live region.
  - **Results:**
    - Timed out: Cancel.
    - Failed / cancelled: the step where it stopped, the device's reason, and **Try again**.
    - Success: "Fingerprint registered and confirmed", with the scanner slot and time.
  - Polls every 2 s.
  - Reads the job row with `*`, so before the migration the screen still works: its steps stop at "Scanner ready".
  - Semantic colour tokens; registration is never shown as done before the database links the worker.

## Not applied / not deployed

- The connector `apply_migration` call was declined three times (once before and twice after the owner chose "Apply the migration"). The `pnpm db:apply` fallback was not used without explicit approval. Nothing changed in the live database.
- The `biometric-enrollment` function was **not** redeployed. Deploy it after the migration, keeping `verify_jwt = false` as already deployed: the device token is its authentication.
- Nothing committed or pushed. The web change is local until deployed.

## Verification

- **Device (real hardware):**
  - The fixed firmware was compiled and uploaded to the ESP32 DevKit V1 on COM5 twice: the CA fix, then the confirmation and step firmware.
  - Serial output shows only "Scanner/network/time ready"; the HTTP -1 errors are gone.
  - Live `attendance_devices.last_seen_at` now updates every few seconds (1–3 s ago when checked).
  - The stale queued request was closed by the device's first poll ("Enrollment timed out").
- **Not tested:** a physical finger enrollment, a confirmation scan or an attendance scan. No worker was enrolled during this work. Also untested: the step reports against the live server (they need the migration and the redeploy).
- `pnpm test:sql`: 451 passed, 4 new for progress (see the SQL note).
- `pnpm test:worker-enrollment`:
  - receiver `progress` validation and argument passing (none for other actions);
  - step model (every stage, timeout, failure point, cancelled, success, never registered early) and device online status;
  - screen: confirm declined starts nothing, confirm accepted requests, live step and instruction, no second request while capturing, Try again, success.
- `test:biometric-access`, `test:worker-camera` and `test:admin-worker-profiles` pass.
- **Deliberate break:** skipping the confirmation dialog failed the test; the source was restored byte-for-byte.
- Both sketches compile for `esp32:esp32:esp32doit-devkit-v1` (81% flash, 14% RAM).

## Applied (later on 2026-10-27)

- **Migration:** the owner ran `20261027110000_enrollment_progress` in the Supabase SQL Editor, with its `schema_migrations` row.
- **Verified read-only:** columns, one 7-argument function (service_role only), body identical to the file once line endings are normalized.
- **Receiver:** `biometric-enrollment` v2 deployed (verify_jwt false as before; 401 without a device token). See [attendance schedule and scans](2026-10-27-attendance-schedule-scans.md).

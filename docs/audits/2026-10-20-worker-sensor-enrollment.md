# Worker registration tabs and automatic sensor enrollment

2026-10-20 · BuildTrack only (`ruimjlhsfpaezkgfphsz`).

## Delivered

- Admin → Biometric Registration has Register worker, Worker profiles and Devices tabs. Registration is full width with separate first/last names, optional MI, contact number, optional email, worker code, trade, active status and camera portrait. Worker profiles no longer has Open attendance screen or Refresh profiles; it updates automatically. Editing a profile opens the registration tab.
- No manually entered AS608 ID. A saved worker can request fingerprint registration on an active project device. The browser shows waiting, capture instructions, timeout/failure/cancellation and registered states. A new worker remains unmapped until the trusted device confirms successful enrollment.
- `20261020090300_worker_sensor_enrollment.sql` is applied to the hosted database. Its CLI-generated filename was aligned to the hosted migration version without changing the SQL. Existing worker names/mappings are preserved; new split-name/contact fields are additive and new biometric IDs may be null.
- `biometric-enrollment` Edge Function v1 is ACTIVE. It uses project-scoped, hashed, revocable device credentials, strict bounded payloads and safe errors. No browser/service-role key is installed on a device.
- Updated combined ESP32 firmware polls for jobs, gets an automatic slot, captures two matching impressions with finger removal, checks duplicates/occupied slots, persists a result for retry and acknowledges it. Templates/images never leave the sensor. This firmware still requires flashing and physical hardware acceptance.

## Database and access

The job table enables RLS and is read-only to Admins with `biometrics.manage`, MFA and project access. Ordinary clients cannot write job state/slots/success or enrollment timestamps/device mappings. The two explicitly authorized, fixed-search-path Admin RPCs request/cancel enrollment; device processing is an invoker function executable only by `service_role`. No Foreman delegation was added. Device processing rechecks the requesting Admin's active role/permission and the worker's active status. Device→project scope is derived from credentials, never supplied by a caller.

Lock order is device → project advisory lock → request/worker. Partial unique indexes enforce one pending request per worker/device. Claimed slots are permanently reserved, including failed/cancelled jobs, because a hardware template could exist after interruption. Capacity exhaustion requires supervised maintenance, not automatic reuse/deletion. Newly linked attendance is restricted to the enrolling device; legacy mappings remain compatible.

Security advisors: existing four INFO no-policy findings and one leaked-password warning remain. The authenticated definer advisory count rises from 87 to 89 for the two intentional Admin-only queue RPCs. Unlike a direct table grant, these RPCs cannot set completion or choose arbitrary slots. Authorization/no-MFA/Foreman denials are regression-tested. See [function-security guidance](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker) and the existing [password-protection remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No auth settings were changed.

## Verification

- 412 SQL cases passed, including split/contact fields, null new IDs, Admin/MFA scope, blocked direct writes, automatic slot allocation, idempotent polling/completion, cross-device rejection, cancellation, expiry, reserved slots, revoked permissions, inactive workers and capacity exhaustion.
- `test:worker-enrollment` covers the actual tabs, enrollment controls/state/errors, field validation and Edge handler authentication/schema/error contracts. Camera-save and biometric-access suites pass. Existing helper/component tests pass; TypeScript passes.
- Production build succeeds outside the sandbox. The sandbox-only Vite dependency loader still reports `require is not defined` before compilation; no dependency changes were made for that environment issue.
- Hosted authenticated smoke passed: real Admin creates a synthetic profile/device and requests enrollment; real Foreman is denied; service-role polling allocates a slot but does not map it before confirmation; confirmation links the worker and attendance ingest succeeds. Everything was rolled back. No worker, device, job, attendance event or token was left behind.
- Deployed receiver rejects a credential-free HTTP request with 401. No physical fingerprint capture/enrollment or microcontroller toolchain compile/flash was performed. Browser visual QA was not available.

## Hardware handoff / limits

Follow [ESP32 setup](../../hardware/esp32-as608/README.md), using the updated combined attendance sketch, ArduinoJson 7.x and the new ENROLLMENT_URL constant in private config. Register a device, configure verified TLS/WiFi/token/pins and flash it. No real device is registered yet. Verify the exact AS608 module's UART protocol, empty-slot result, voltage/baud and capacity before use. Restrict physical/serial access to Admins. A web deployment cannot secure a reflashed controller or prove who physically touched its sensor.

Cancellation/power loss can leave an orphan template; its slot is deliberately not reused automatically. The single durable event/result queue pauses further captures until acknowledgement. Existing enrolled fingers cannot be silently moved to another worker. Re-enrollment, template removal/multi-device template replication and unsupervised offline enrollment are not implemented.

Rollback is additive compatibility: restore the older UI/firmware only after reconciling pending enrollment jobs. Do not drop new columns/jobs or revert ID nullability while un-enrolled workers exist; preserve attendance and hardware reservations. No destructive rollback was run.

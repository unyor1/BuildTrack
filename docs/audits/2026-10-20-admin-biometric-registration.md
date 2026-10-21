# Admin-only worker biometric registration

Date: 2026-10-20. UI/access hardening only; no database migration required.

- Admin → Biometric Registration manages project worker profiles, private portraits, AS608 enrollment IDs and ESP32 credentials. An active Admin with `biometrics.manage` and MFA, or a Super Admin with MFA, is required.
- Shared guards protect the page and both management components, even if a future page imports them outside the Admin route.
- Foreman attendance remains read-only for assigned projects. No delegation or temporary Foreman enrollment authorization exists.
- The Admin page and hardware README explain physical fingerprint enrollment. Saving a worker profile does not enroll the sensor. Physical access to the enrollment helper/controller must be restricted operationally; web permissions cannot secure a reflashed ESP32.
- Existing live worker/device RLS policies were read and verified: mutations require `has_permission('biometrics.manage')` and project access. That helper requires the Admin role (not just a permission row), active status and MFA. No live records, schema or grants were changed.

Regression coverage: `scripts/test-biometric-access.mjs` renders the actual page and management components for Admin/Super Admin, missing permission, Foreman, Engineer, Client and anonymous callers. `supabase/tests/99-zzzzzzzzzzzzz-admin-biometrics.cases.mjs` exercises Admin worker/device writes and denied non-MFA/no-permission/Foreman writes, private photo upload denial, and a deliberately stray Foreman permission row in the isolated test database. The existing attendance suite checks staff/project read access and trusted-only event ingestion.

No hardware enrollment or physical scan was performed during this change.

## Camera portrait capture

The worker form now uses Open camera → Capture photo → Retake photo instead of a file picker. Camera permission is requested only after clicking Open camera. Preview, cancellation, discarded captures and errors are handled locally; JPEG portraits are capped to a 1024-pixel longest edge and validated against the existing 2 MB limit. Capturing does not upload anything until Save worker profile is pressed. Existing private upload/link logic and Admin-only permissions remain unchanged. Streams are stopped on capture, cancel, save, worker switch or unmount, including late permission/encoding results; preview object URLs are revoked.

`test:worker-camera` covers the actual controls and worker form integration with isolated media/storage mocks. TypeScript, biometric-access tests, camera tests and production build passed. Live read-only verification confirmed the existing worker-photos bucket remains private with a 2 MB JPEG/PNG/WebP limit. No database changes or real camera captures/uploads were performed. Real-device camera permission and image-quality checks still require a webcam/phone on HTTPS or localhost.

Verification: TypeScript, 109 helper tests, all component/handler suites and 405 SQL cases passed. The sandbox build hit a dependency-loader `require is not defined` error; rerunning `pnpm build` outside the sandbox succeeded. No browser visual or physical hardware verification was performed.

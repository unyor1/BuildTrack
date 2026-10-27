# Attendance scan queue and ESP32 rollout — 2026-10-27

## Scope and authorization

Owner approved fixing the review findings, applying the pending scan-notices migration, deploying the receiver/app, preparing the ESP32 upload, and including all pending app changes in pushes to both repositories. The saved Admin schedule was explicitly left unchanged.

## Fixes

- `useScanNotices` now retains a queue. A batch enqueues every message; later arrivals do not replace the current message. OK/auto-close advances one message, and a stale timer cannot dismiss the next worker.
- Catch-up reads use ordered 100-row pages and independent overlapping cursors. A failed table retries without hiding other scan types; concurrent polls do not race; project changes invalidate reads and clear/mask the old queue.
- Both public and private ESP32 sketches validate timestamp length before indexing, check separators/digits/ranges, and safely return `?` for malformed timestamps. The standalone private sketch retains the owner's settings and stays Git-ignored.

## Live backend

- Confirmed project URL: `https://ruimjlhsfpaezkgfphsz.supabase.co`.
- Applied `attendance_scan_notices` through the connector. Generated migration version: **20261027152428**. Renamed the originally prepared `20261027150000` SQL/doc to match history; SQL unchanged. Do not apply the old version separately.
- Verified RLS, project-staff SELECT policy, Realtime publication of ignored/unregistered scans, and service-role-only EXECUTE on the three invoker functions. SQL function bodies match the local migration after newline normalization.
- `biometric-attendance` **v3 ACTIVE**. Existing device-token authentication retained (`verify_jwt=false`); unauthenticated POST verified **401**. No service-role key is present in firmware or browser source.
- Security advisor findings unchanged from the pre-migration snapshot; no new findings. Existing advisory guidance: [SECURITY DEFINER API functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Saved schedule verified, not changed: TESTING BUILDTRACK, 08:00–17:00, grace 5 minutes, repeat window 1 minute. Automatic IN/OUT still alternates outside that window; schedule times label lateness/early departure, not scan intent.

## Verification

- TypeScript and every application test passed; **461 SQL tests passed**. The sandbox-only Vite dependency error was resolved by running the production build outside the restricted Windows sandbox; build passed without changing configuration.
- Queue regression cases: simultaneous workers, arrival while a message is displayed, repeated delivery, stale dismissal callback, 105-row catch-up, failed table, and project/unmount late responses.
- Load test passed: 50 sheets / 5,000 pins / 300 inspections / 500 NCRs in isolated PGlite; no production test data created.
- Both sketches compiled for `esp32:esp32:esp32doit-devkit-v1`: standalone 1,075,436 bytes flash / 49,032 RAM; reference 1,066,260 flash / 49,000 RAM. One pre-existing constant-certificate compiler warning remains in the standalone setup check.
- Browser surfaces were unavailable, so visual/browser acceptance is not claimed. No firmware was flashed and no physical finger scan was performed by the agent.

## Upload / handoff

Open `hardware/esp32-as608/private_upload/buildtrack_as608/buildtrack_as608.ino` in Arduino IDE. Select DOIT ESP32 DEVKIT V1 and the board's USB port (last known COM5), close Serial Monitor, upload without Erase All Flash, then monitor at 115200. No config header is required. Do not commit/share the private sketch.

Physical acceptance still needed: existing enrolled finger; repeat inside the configured one-minute window; unregistered finger; Admin registration with two captures plus confirmation; and reconnect. Test attendance only with an approved test worker or normal arrival/departure. The firmware keeps one pending matched scan, not a multi-worker offline queue.

Website Git/deployment outcome is recorded after pushing. Local machine cache and the alternate untracked npm lockfile are not application changes and are excluded from the commit.

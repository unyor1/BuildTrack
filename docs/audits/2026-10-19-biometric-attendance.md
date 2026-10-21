# Standalone biometric attendance

## Delivered

- `/attendance?project=<uuid>` is a standalone, authenticated staff display with the existing landing-page header/brand and no header navigation, login/register actions or workspace sidebar.
- Recent 50 scans by selected Manila date, search and IN/OUT filter; whole-day summary calculated in SQL, not from the 50-row preview. No absent/late labels are inferred without a roster or shift rules.
- Side profile automatically follows the latest chronological scan. Clicking a worker inspects an older record; the next latest scan resets that selection. Saved profile photo (not fingerprint image), name, worker code, trade, direction, scan time, received time and terminal are displayed.
- Realtime subscriptions plus 15-second fallback refresh, refresh-on-reconnect/visibility and an initial subscribed refresh; scope/request guards prevent cross-project/date responses. Errors remove stale scan confirmations. Default Today advances at Manila midnight; a deliberately selected historical day stays selected.
- Foreman → project → Biometric Attendance reads the same data and links to the standalone screen.
- Admin → Biometric Registration now manages real project workers: name, code, biometric/template ID, trade, optional profile photo and active status. Removed mock enrollment/attendance, fictitious names, totals and dates. Saving a worker does not enroll a fingerprint.

## Database / security

Applied migrations: `20261019104906_biometric_attendance_board.sql` and `20261019105837_biometric_device_receiver.sql` (local filenames aligned to hosted versions).

- `attendance_workers` and immutable `biometric_attendance_events`; composite worker/project FK, unique worker and biometric IDs within a project, unique `(project_id,device_id,external_event_id)` for retries, project/date and worker/time indexes.
- RLS: active project staff read; only `biometrics.manage` admins with project access can add/edit workers. Clients, anonymous visitors, outsiders and disabled accounts cannot read these records. Workers are separate from website user accounts.
- Profile photos use private `worker-photos`, JPEG/PNG/WebP up to 2 MB. Project staff read through signed URLs; authorized biometric managers upload to the existing worker's project/worker folder. Random paths, no overwrite/public URL. Superseded objects are not deleted by this implementation.
- Both RPCs are security-invoker. `attendance_day_summary(uuid,date)` obeys caller RLS. `record_biometric_attendance(uuid,text,text,timestamptz,text,text)` is executable only by the trusted server `service_role`, not by browser users. Invalid directions, missing identifiers, unknown/project-mismatched/inactive workers, infinite/future timestamps and conflicting duplicate source IDs are refused. Retries return the existing event, including after a worker is deactivated. Late uploads do not override a newer chronological attendance status.
- Never put a service-role/secret key in frontend code, controller firmware or a public repository. No scanner/device credential has been generated or provisioned.
- No raw fingerprint image or template is stored or transferred by the web app. Profile photos are ordinary uploaded worker portraits. No biometric matching is performed by the browser.
- Existing imported `biometric_daily_totals` are preserved; scan events do not silently overwrite Engineer-imported totals or populate payroll/workforce assignments. The board's own metrics use event data only.

## AS608 + ESP32 hardware handoff (not physically connected yet)

User confirmed **AS608 + ESP32**. Exact module pinout, voltage, serial protocol/library compatibility and enrollment capacity must be confirmed against its supplier datasheet before wiring. Example pins are documented as classic ESP32 DevKit examples, not universal wiring instructions.

Implemented flow: successful sensor match → ESP32 → token-authenticated `biometric-attendance` Edge Function → project/device-scoped receiver RPC → attendance record → realtime display. The AS608 itself is not assumed to send HTTPS. The Edge Function was deployed ACTIVE with platform JWT verification disabled because its handler/database validate a dedicated device credential on EVERY submission; it is not an anonymous attendance-write endpoint. No other function's JWT settings were changed.

Admin device setup generates a random 256-bit token in the browser and submits only its SHA-256 digest. Plaintext is shown once in memory and is not stored by the web app. `attendance_devices` exposes only non-secret columns to authorized biometric managers; its digest is not selectable by `authenticated`, and the table is not published to Realtime. Managers can revoke or rotate tokens but not reassign a device's project. The service-only security-invoker `ingest_biometric_device_event` derives project/device identity, locks the device and enforces 120 new events/minute while allowing exact retries. Failed token checks use generic errors and do not reveal project/worker data. It never accepts arbitrary project IDs from a device.

For an AS608 enrolled slot `1`, save `1` as that worker's Biometric / sensor template ID. Keep IDs consistent across project readers or normalize device-specific IDs in the trusted bridge. Use explicit IN/OUT intent (e.g. selected mode or separate readers); never blindly toggle on retries. A source event ID must remain stable across retries; capture timezone-aware actual scan time, not upload time.

The trusted server should invoke, after authenticating its device and deriving its project/device scope (not trusting arbitrary caller project IDs):

```js
// Server-side ONLY; serverClient is created using a protected server credential.
await serverClient.rpc("record_biometric_attendance", {
  p_project: authorizedProjectId,
  p_biometric_uid: String(matchedSensorSlot),
  p_direction: explicitDirection, // "in" or "out"
  p_occurred_at: deviceScanIsoTimestamp,
  p_device: authorizedDeviceId,
  p_event: persistedSourceEventId,
})
```

See [hardware setup](../../hardware/esp32-as608/README.md) for the receiver payload, reference enrollment/attendance sketches and acceptance checklist. Reference firmware uses NTP, certificate-verified HTTPS, an explicit physical IN/OUT selector, finger-removal latching and one NVS-persisted pending event. It blocks further captures until acknowledgment instead of silently discarding/overwriting scans. It is not a multi-record offline queue. No real device or credentials have been provisioned; enrollment/configuration/flashing and electrical/protocol/firmware validation remain physical setup work.

## Verification

- TypeScript, 109 helper tests, comparison/editor/checklist interaction tests, new actual attendance component and receiver control tests, 391 SQL tests and production build passed. Build needs execution outside the restricted Windows sandbox for Vite/native dependency resolution; no build-config change was necessary.
- SQL cases cover manager-only worker changes, scoped staff reads, client/outsider/disabled/anonymous denial, private photo/upload policies, idempotence/conflicting retries, wrong-project/inactive workers, timestamp guards, chronological late imports, Manila boundaries and RPC ACLs.
- Live schema, RLS, private bucket, publication and RPC permissions verified. Rollback-only smoke used a synthetic worker and trusted-server scan, checked idempotence and the actual project Foreman's joined profile/event access and summary, then rolled back worker/event/audit rows. Live workers/events remained 0/0.
- Additional device SQL tests cover protected credential digests, manager-only registration, immediate revocation/rotation, immutable project scope, receiver-derived project/device mapping, wrong-token/project rejection and rate-limit retry behavior. Local HTTP handler tests cover method/token/body size/JSON validation, scope spoofing, credential hashing, acknowledgment and safe 400/401/413/415/422/429/503 responses. Live deployed endpoint returned 405 for GET and 401 for an invalid device token (no website JWT supplied). A second rollback-only live smoke verified receiver authentication, derived scope, idempotence and revocation. Live devices/workers/events remained 0/0/0.
- Security advisor baseline unchanged: 4 pre-existing INFO no-policy internal tables, 86 existing authenticated security-definer advisories, 1 existing leaked-password-protection warning. No new definer or anonymous-grant advisory.
- No enabled browser surfaces were available, so automated component interaction/render checks were used; visual browser review, actual Storage binary upload, Arduino toolchain compilation/flashing and physical AS608 attendance scan were not exercised.
- Existing unrelated worktree changes preserved. No Git commit/push or website-hosting deployment was performed in this task. The database migrations and dedicated device receiver Edge Function were deployed.

## Reference checks

Reviewed current [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Changelog's upcoming [TLS cipher removal](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) reinforces the need to use a maintained server/controller TLS stack; hardware transport compatibility remains unverified.

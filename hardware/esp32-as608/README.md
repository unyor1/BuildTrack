# ESP32 + AS608 attendance setup

**First upload on your ESP32 DevKit V1:** start with [FIRST_UPLOAD.md](FIRST_UPLOAD.md) and `connection_test/connection_test.ino` to check the scanner without Wi-Fi or credentials. Then use `attendance/attendance.ino` for website-controlled enrollment and attendance.

The web screen is `/attendance` (staff sign-in required). Admin → Biometric Registration has Register worker, Worker profiles and Devices tabs. Worker profiles no longer have attendance/refresh buttons. Admin captures portraits with the camera and starts sensor enrollment without entering an ID. The attendance receiver is:

`https://ruimjlhsfpaezkgfphsz.supabase.co/functions/v1/biometric-attendance`

The enrollment receiver is `https://ruimjlhsfpaezkgfphsz.supabase.co/functions/v1/biometric-enrollment`. Both use the same project-scoped device token. Neither accepts a browser claim that a fingerprint was captured.

## Status / limitations

The database, web display and authenticated receiver are implemented. These sketches are reference firmware, not physically verified firmware. The setup check and compile results are recorded in [the hardware audit](../../docs/audits/2026-10-27-esp32-as608-setup.md); no upload or physical sensor test has been performed. Confirm that your exact AS608 module supports the packet protocol used by `Adafruit_Fingerprint` before use. Do not assume all modules sold under this label have the same voltage, cable colors, baud rate or template capacity.

Use this for a supervised hardware acceptance test before operational attendance/payroll. The sensor's matching decision is trusted; the web app cannot prove a real fingerprint was presented. Physical device/token access must be controlled.

## Setup

1. Registration and enrollment are Admin-only. Choose the project, then use Register worker to enter first name, last name, optional middle initial, contact number, optional email, worker code and trade. Capture the portrait using Open camera, then save the worker. No website worker account or manually entered sensor ID is needed. Foremen view assigned-project attendance only; there is no enrollment delegation workflow.
2. Install the Espressif Arduino-ESP32 board package for your exact board, **Adafruit Fingerprint Sensor Library 2.1.4**, and **ArduinoJson 7.x**. The combined attendance sketch now polls for enrollment requests. These sketches use ESP32 HardwareSerial, Preferences/NVS and certificate-validated HTTPS APIs.
3. Confirm the supplier's AS608 wiring and electrical requirements. Example sketch RX/TX GPIOs 16/17 are only for a compatible classic ESP32 DevKit, not a universal pinout. Connect sensor TX to the configured ESP32 RX, sensor RX to configured ESP32 TX and a common ground. Check safe logic levels and required supply against both datasheets; never connect a 5V signal directly to an ESP32 input. Do not rely on cable colors. Adjust pins and baud in both sketches for your board.
4. Use the combined `attendance/attendance.ino` firmware for website-driven enrollment. The old `enroll/enroll.ino` serial helper is a legacy maintenance tool, NOT this registration flow; it can overwrite slots and does not link workers automatically. Restrict physical/serial access; website permissions cannot prevent someone with physical access from reflashing the controller.
5. In the Devices tab register a device for the same project. Copy its UUID and one-time 64-character token privately. Only a digest is saved server-side. The device cannot select another project or read arbitrary project data. Rotating/revoking its token stops the old credential immediately. No device token was created automatically by the coding agent.
6. Copy `attendance/config.example.h` to **`attendance/config.h`** (gitignored), or add the new `ENROLLMENT_URL` constant to an existing private config. Enter WiFi, device ID/token, exact board pins/baud and the VERIFIED root CAs for this endpoint's current HTTPS certificate chain: paste the whole of `tls-root-ca.pem` (see **TLS root certificates** below). Obtain CA certificates from the CA's official source and verify the chain on a trusted machine. The firmware refuses to run without a configured PEM and never calls `setInsecure`. A public database key or service-role key is NOT needed on the ESP32.
7. No IN/OUT switch is needed any more (since 2026-10-27, migration `20261027130000_attendance_schedule_scans`). The firmware sends `"direction":"auto"` and the database decides: a worker's first accepted scan of the Manila day is Time IN, the next Time OUT, then IN again after a break. A repeat scan within the Admin's window (Admin → Biometric Registration → Attendance schedule, default 15 min) or a scan older than the worker's last one is logged as ignored, not recorded. Retries of the same event never toggle. `DIRECTION_PIN` is kept only so old settings compile. **Order matters:** apply the migration and deploy `biometric-attendance` before flashing this firmware; the receiver deployed before that rejects `"auto"` and the scanner would hold every scan as unconfirmed.
8. Flash `attendance/attendance.ino`. Keep the Serial Monitor/operator status visible during testing. Internet, WiFi and NTP time sync are required before new captures. The sensor must report finger removal after startup and between captures. Successful matches generate a fresh random source event ID, snapshot UTC time and direction, persist the payload to NVS BEFORE transmission and retain the exact payload/ID across retries and power cycles.
9. As Admin, save a worker, select the project device (the badge must say **Scanner online**) and click Register fingerprint, then confirm that the worker is at the scanner. The controller polls every three seconds, captures the same finger twice with a lift in between, checks for an existing match, saves it, then asks for a **third confirmation scan** that must find the slot just saved. Only then does it report success; a failed or cancelled confirmation removes the template it just saved. With migration `20261027110000_enrollment_progress` applied, the web form shows each step live (first scan, lift, second scan, saving, confirmation scan); without it the steps stop at Scanner ready and the Serial Monitor shows the prompts. Wait for **Fingerprint registered and confirmed**. A single unprompted scan does NOT create an arbitrary worker.
10. Open Foreman → selected project → Biometric Attendance → Open standalone attendance screen. On an acknowledged attendance scan, its row and saved worker portrait should appear. The browser subscribes to database changes and also refreshes every 15 seconds.

## Automatic enrollment safety and recovery

- The server serializes enrollment per project/device, assigns an unused numeric slot within the reported capacity and sends only one request to a device at a time. Workers are not attendance-linked until the device confirms successful enrollment. New mappings are bound to the device holding the template.
- The firmware checks that a proposed slot is empty before capture and fails closed on unexpected sensor responses. Verify on your exact module that an empty `loadModel()` returns `FINGERPRINT_DBRANGEFAIL`; otherwise stop and adapt to the supplier’s protocol. It never deliberately overwrites occupied slots or silently associates an already-matched finger with a different person.
- Start an enrollment only when the correct worker is physically present. Only that person should touch the sensor. AS608 enrollment uses two impressions plus a confirmation scan, not a single scan. A queued request expires after five minutes; a claimed request has two minutes to finish, extended by 90 s each time the device reports a step (never beyond 10 minutes after the request; needs `20261027110000`).
- Cancel from Admin if needed. Failed, cancelled or interrupted claimed slots are retained as reservations because a template may already exist on hardware. Never automatically delete/reuse them. Admin must reconcile the physical sensor before capacity maintenance.
- The controller persists an interrupted/failure result before capture and persists the final result after storage. Reboots and lost acknowledgements retry that exact result, not enrollment. An unconfirmed result pauses normal attendance; check the Admin status and Serial Monitor. If power fails after sensor storage but before result persistence, the slot can become orphaned; it is not linked to a worker automatically.
- No Admin request means no enrollment. If no device is configured or the old firmware is running, the web form remains Not registered / Waiting for device. Flashing and real hardware acceptance are still required; web deployment cannot update the physical controller.

This minimal firmware intentionally has ONE durable pending slot and blocks further scans until it is acknowledged. It is NOT a multi-worker offline queue. A 401 (token), 422 (worker/time/conflicting source ID) or persistent failure blocks the terminal; the operator must resolve it. It does not silently discard or replace an unconfirmed scan. Do not clear NVS or change project/device identity while a pending event remains unless the event is reconciled first. Full unsupervised operation should add a display/buzzer, physical security, a robust multi-record offline queue/RTC, monitoring and signed firmware updates.

## TLS root certificates

`tls-root-ca.pem` holds three public roots, checked on 2026-10-27 against the chain the server actually sends (`openssl s_client` with only this file: `Verify return code: 0`):

| Root | Why | SHA-256 |
|---|---|---|
| GTS Root R4 | ECDSA chain: supabase.co → WE1 → GTS Root R4 | `349DFA4058C5E263123B398AE795573C4E1313C83FE68F93556CD5E8031B3C7D` |
| GTS Root R1 | RSA chain: supabase.co → WR1 → GTS Root R1 | `D947432ABDE7B7FA90FC2E6B59101B1280E0E1C7E4E40FA3C6887FFF57A7F4CF` |
| GlobalSign Root CA | Signs the cross-signed GTS roots the server sends | `EBD41040E4BB3EC742C9E381D31EF2A41A48B6685C96E7CEF3C1DF6CD4331C99` |

GTS roots come from [pki.goog/roots.pem](https://pki.goog/roots.pem). Do **not** use "GlobalSign ECC Root CA - R4": the server does not chain to it, and every request then fails with `HTTP -1` (the device never reaches the server; `last_seen_at` stays empty). The firmware now prints the TLS error text when this happens. See [the audit](../../docs/audits/2026-10-27-fingerprint-registration-steps.md).

## Receiver contract

`POST` with `Content-Type: application/json` and `x-device-token: <device token>`; no website JWT and no service-role key. Do not include a project ID—the authenticated device supplies its scope server-side.

```json
{
  "device_id": "<registered-device-uuid>",
  "biometric_uid": "1",
  "direction": "in",
  "occurred_at": "2026-10-19T01:00:00Z",
  "event_id": "<new-stable-source-event-uuid>"
}
```

`direction` is optional and never trusted (`in`, `out` or `auto`; older firmware sends its switch value). Use actual scan time, not the example date. Successful response: `200 { "recorded": true, "event_id": "<attendance-row-uuid>", "status": "recorded" | "repeat" | "out_of_order", "direction": "in" | "out", "occurred_at": "…", "schedule_flag": "on_time" | "late" | "early_out" | "returned" | "no_schedule" | null, "minutes_off": <minutes or null> }`. `recorded: true` means the scan was handled (stored, or deliberately ignored as a repeat / out-of-order scan, in which case `event_id` and `direction` are those of the attendance row that counted); the device must not retry it. The same source event retry returns the same answer. Any non-200 response is NOT a confirmed attendance. The receiver allows only the five fields above, at most 4 KB, timezone-aware timestamps and active mapped workers. Wrong/revoked tokens are 401, invalid input 400/415/413, rejected scans 422, device rate limit 429 and transient failures 503. A device is limited to 120 new scans/minute; exact retries do not consume new scan rows.

## Acceptance test on hardware (still required)

- Register a worker through the three tabs, capture the portrait, request enrollment and follow both finger captures. Confirm an automatically assigned ID only after device acknowledgement; no manual ID input is shown.
- Attempt an already-stored finger, occupied slot, mismatched second capture, cancellation, timeout and power loss mid-enrollment. Confirm no false Registered state, overwrite or wrong-worker link; retries reserve a fresh slot.
- Match an enrolled finger for IN: one row and the correct worker portrait; unrecognized finger: no row.
- Leave finger on the sensor: no repeated row. Remove and scan again within the repeat window: "Already recorded … Repeat scan ignored" and no new row.
- Scan again after the window: Time OUT appears; the next scan after another window is Time IN ("Back on site"). Daily totals still count one unique worker.
- Set an attendance schedule and scan after time in + grace: "Late N min"; scan out before time out: "Early out N min".
- Disconnect network immediately after capture or reboot before acknowledgment: original event ID/time retained, retry creates no duplicate.
- Confirm another project's worker ID is not accepted; revoke device token and confirm all submissions are denied until administrator rotation/config update.
- Confirm wrong/missing TLS CA fails closed and no attendance success is shown; confirm sensor not detected, full/unavailable storage and invalid time do not claim success.
- Inspect received scan time versus actual local time, perform midnight boundary tests and test multi-user throughput before operational rollout.

## Primary API references

- [Adafruit fingerprint library](https://github.com/adafruit/Adafruit-Fingerprint-Sensor-Library) and [enrollment documentation](https://learn.adafruit.com/adafruit-optical-fingerprint-sensor/enrolling-with-arduino). These document the library/protocol family, not a guarantee for every AS608-labelled module.
- [Espressif Arduino-ESP32](https://github.com/espressif/arduino-esp32), specifically its HardwareSerial, NetworkClientSecure and Preferences APIs.
- [ArduinoJson 7 JsonDocument](https://arduinojson.org/v7/api/jsondocument/) for the enrollment job/result protocol.
- [Supabase TLS cipher notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated): maintain a supported TLS stack and verify certificates; do not disable verification to work around connection failures.

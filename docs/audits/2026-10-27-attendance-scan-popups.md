# Attendance scan pop-ups — 2026-10-27

## Rollout update

The owner-approved database update is now applied as connector version `20261027152428`, and `biometric-attendance` v3 is ACTIVE. The earlier prepared version `20261027150000` was renamed to match history and must not be applied again. Pop-up queuing and firmware time parsing were subsequently fixed; see [rollout audit](2026-10-27-scan-queue-rollout.md). The original implementation/deployment notes below describe the earlier state, not the current rollout.

## Request

Show a pop-up confirmation / acknowledgement when a worker scans twice:
- they already timed in or already timed out, to avoid double entries;
- and for an unregistered fingerprint.

The owner's Serial Monitor at the same time showed "Attendance NOT confirmed (HTTP 200). Pending event retained." The old firmware was still on the ESP32 and could not read the new receiver's reply.

## Changes

- **Site attendance screen** (`AttendanceBoard`, new `ScanNoticePopup`; live hook `lib/scanNotices.ts`; texts `lib/scanNoticeModel.ts`):
  - A large pop-up for each scan received after the screen opened, shown once, newest first. It has an OK button and closes after 6 s (warnings and errors 10 s).
  - **Recorded:** "Time IN recorded" / "Time OUT recorded", with name, time and Late / Early out (polite status).
  - **Repeat:** "Already timed IN" / "Already timed OUT": "… already timed IN at 07:58. This scan was not recorded again." (alert).
  - **Older scan:** "Scan not recorded" (alert).
  - **Cannot count:** "Fingerprint not registered", "Fingerprint not linked" (with the scanner slot), "Worker inactive", "Wrong scanner" (alert).
  - Data: listens to the three scan tables for the selected project only, plus a check every 3 s. A table it cannot read adds no messages; it hides nothing else.
- **Database** (`20261027152428_attendance_scan_notices.sql`, **APPLIED 2026-10-27**):
  - scans that cannot count are logged and answered, never raised as an error, so the scanner no longer stops on them;
  - the scanner can report a finger it cannot match;
  - realtime for ignored and unregistered scans.
  - Details: [sql/20261027152428_attendance_scan_notices.md](sql/20261027152428_attendance_scan_notices.md).
- **Receiver** (`biometric-attendance`, **v3 NOT DEPLOYED**: the deploy was blocked by Claude Code auto mode):
  - `"result":"no_match"` without a biometric ID goes to `report_unregistered_scan`;
  - the reply for scans that cannot count is `{recorded: false, status: "unregistered", reason}`;
  - an unknown reason is a 503.
- **Firmware** (both sketches, compiled, **not flashed**: COM5 is held by the Arduino IDE Serial Monitor):
  - clear `>>>` lines for "already timed IN/OUT", "not registered", "not linked", "inactive" and "wrong scanner";
  - a 200 "unregistered" reply clears the pending scan instead of blocking;
  - a finger with no match is reported, best effort: at most every 3 s, never stored or retried;
  - an unreadable image only asks to place the finger again;
  - the local "same finger within 60 s" skip is now a 2 s double-touch guard, so a real second scan reaches the server and pops up "Already timed IN".

## Order to go live

1. **Flash the firmware** (close the Serial Monitor first). This alone fixes "NOT confirmed (HTTP 200)" with the receiver live today.
2. **Done:** migration applied through the connector as `20261027152428`; do not run the original prepared version again.
3. **Deploy `biometric-attendance` v3.**
4. **Deploy the web app.**

Steps 1 and 3 are safe in either order: before step 2, unknown-finger reports are simply not logged.

## Verification

- `pnpm test:sql`: 461 passed (4 new).
- `pnpm test:attendance`: receiver routing, unregistered replies, no-match payload rules.
- New `pnpm test:scan-notices` (in `pnpm check`) covers:
  - every message text;
  - newest-first and once-only selection;
  - old scans never pop up; project-scoped queries and channels;
  - an unreadable table tolerated;
  - alert vs status; OK and auto-close.
  - **Deliberate break:** dropping the once-only rule failed the test; restored byte-for-byte.
- `pnpm check` passed. Both sketches compile (82–83% flash).
- **Not verified:** the live pop-up in a browser and a physical scan with the new firmware. The migration, receiver v3 and flash are still pending.

# 2026-10-11: Admin tools (settings, access review, backup, real plan pages)

Database: migrations 0022 (`sql/0022_system_settings.md`) and 0023 (`sql/0023_project_export_audit.md`).

## What admins get
| Page | What it does |
|---|---|
| **System settings** (Super Admin edits, other admins read) | Pass mark and the weights of critical / major / minor items (for the QA module), working hours and days, the list of standards and codes inspections may cite, and the "inactive days" limit. Each card has its own Save; every change is validated by the database and written to the audit log. |
| **Access review** (View users; Disable users to act) | Active engineers, foremen, clients and basic users who have not signed in for N days (default from the settings). Select and disable in one go (through the existing `admin-users` function, so every disable is audited), export to CSV. Admins are never listed. |
| **Backup and export** (Projects permission) | One ZIP per project: data as JSON (members, sheets, revisions, pins, timeline, checklists, photos, drawings, daily reports, client questions), team names, a manifest, and optionally every plan file and photo under its storage path. Progress bar, cancel, list of anything that could not be included, audit log entry. Restore steps: `docs/BUILDTRACK_BACKUP_RESTORE.md`. |
| **Whitelist** | New "Import a file" (.csv or .txt): every email address in it is added to the box; up to 500 at once, sent to the server in batches of 50 with one summary toast. |
| **Blueprint mapping, Progress tracking, Version control** | No longer sample data. Mapping: sheets with pins, notes, drawings and a status bar. Progress: verified share, schedule, per-sheet table. Version control: every revision with uploader, date, size, note and a download of the original. All take a project picker. |

## Engineering
- `lib/zipWriter.ts`: dependency-free ZIP writer (store method, UTF-8 names, CRC-32, safe names, duplicate and size guards). `pnpm test:lib` 44/44 (new: zip structure and checksums, settings parser).
- `lib/settingsModel.ts` (pure) and `lib/settings.ts` (hook): defaults apply when a value is missing or malformed.
- `components/AdminProjectSelect.tsx`: shared project picker for admin screens.
- SampleNotice now shows only on Admin Biometrics (waiting for the biometrics decision).
- Test harness: the `auth.users` stand-in gained `last_sign_in_at`.

## Verification
`pnpm test:sql` 189/189 (6 new tests across 98 and 99), `pnpm test:lib` 44/44, `npx tsc --noEmit`, `pnpm build`. Both migrations were checked live with rolled-back transactions and the security advisor (only the intended new functions). Browser pass with the temporary mock backend (removed afterwards): settings (confirm, save, standards list), access review (list, select, confirm, disable), backup (real ZIP produced; end-of-archive record, 23 entries including files, audit call made), the three plan pages, whitelist file import (120 addresses in batches 50 / 50 / 20); console clean.

## Limits
- The backup is built in the browser, so a very large project (files above about 450 MB) is cut off and the manifest lists what was left out; a data-only backup is the fallback.
- Restoring is a developer procedure on purpose (it touches many tables and needs the same people to exist).
- The settings are stored and shown; the QA module and the attendance rules that will use them are not built yet.

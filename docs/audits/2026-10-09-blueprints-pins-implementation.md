# 2026-10-09: Blueprints and pins (roadmap steps 4 and 5)

Category: feature (database + frontend). Migrations 0009, 0010, 0011 applied by the agent through the BUILDTRACK_MIGRATIONS connector; details in `sql/0009_blueprints.md`, `sql/0010_pins.md`, `sql/0011_pin_timeline_names.md` and `migrations-log.md`.

## What was built
**Database** (all RLS, all tested): blueprints with immutable numbered revisions; private storage buckets `blueprints` (25 MB) and `pin-photos` (8 MB); pins (x/y in percent of the plan, status, category, discipline, assigned foreman, due date); tamper-proof timeline (created / moved / edited / status / comment / photo); photos; `report_pin_progress()` for Foremen; `get_pin_timeline()` for names.

**Frontend**
- `lib/blueprints.ts`: types, loading hooks, signed file links (cached), upload pipeline with browser-side preview (PDF page -> PNG via pdf.js, loaded lazily; big images downscaled to 4000 px; phone photos compressed to 1600 px), validation with readable messages (DWG/DXF -> "export as PDF or PNG").
- `PinCanvas`: pan, wheel zoom, two-finger pinch, click-to-place, drag-to-move for the selected pin; markers keep their size at any zoom.
- `PinPanel`: details/status/assignment (Engineer, Admin), progress report (Foreman), photos, timeline, comments; Client sees a read-only view.
- `BlueprintWorkspace`: plan + revision pickers, upload / new revision, add pin, status filters, pin list, older-revision guard.
- Pages: Engineer Project Blueprint (edit), Engineer Pins list, Client Blueprint (read-only), Foreman Daily Work (progress + photos + comments), Admin Blueprint Management (project picker + edit with `blueprints.manage`).

## Roles in practice
Engineer: uploads plans, places/moves/edits pins, verifies. Foreman: reports "work in progress" / "ready for review", adds photos and notes. Client: sees plans, pins and photos (not the internal timeline). Admin: same as Engineer when granted `blueprints.manage`.

## Testing done
- Database: `pnpm test:sql` 72/72 (RLS for every role, spoofing attempts, immutability, storage rules, cascades, audit, timeline privacy).
- Live database (rolled-back transaction as Super Admin): project -> blueprint -> revision (client sent 77, stored 1) -> pin -> verified -> comment -> photo -> 4 timeline entries; nothing left behind. Security advisor: no anonymous exposure.
- Browser (temporary demo pages, deleted afterwards): plan renders with pins exactly on their coordinates; select / deselect; drag-to-move; click-to-place accurate to 0.05% at 141% zoom; wheel zoom; pan. PDF preview pipeline with a generated PDF (renders text and lines at 2473x3200), wrong page number, DWG, 26 MB, empty file, huge and small images.
- Bug found by that browser test and fixed: tapping a pin did not select it (pointer capture hid the pressed marker).

## NOT tested (needs real accounts / devices)
- The full signed-in flows through the UI (upload to real storage, create / edit pins, foreman report, client view, comments, photos).
- Pinch zoom on a touch screen.
- Large real CAD exports (hundreds of pins, 25 MB PDFs) for performance.
- Offline use (not built yet).

## Known limits / next
- Deleting a blueprint removes rows; stored files are removed by the app on a best-effort basis (engineers cannot delete files, admins can).
- Pin photos of other people can only be removed by the uploader or an admin.
- Pins stay at their coordinates when a new revision is uploaded (no automatic re-alignment).
- Next roadmap steps: Foreman daily report from pins/photos, issue loop, client tickets, then offline sync.

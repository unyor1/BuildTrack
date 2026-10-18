# Daily report fields, linked checklist items, progress photos removed — 2026-10-19

## Changes

- **Daily report form:** the Issues and problems, Delays and Safety boxes were removed. Those columns stay in `daily_reports`; the form no longer writes them, so older reports keep their text and still show / print it (client site logs, Engineer review history and the printed report show those sections only when they have text).
- **Linked work:** each row is now a work pin and the checklist item worked on that day (planned / actual / unit removed). Migration `20261018170444_daily_report_checklist_links.sql` (see [sql doc](sql/20261018170444_daily_report_checklist_links.md)). The Engineer's review shows each link as "LAUNDRY → FLOOR · Accepted / Submitted for QA / Ready / In progress"; the print shows the same labels (`linkedWorkLabel`).
- **Progress photos removed from the app:** pin photos not attached to a checklist item.
  - Photo documentation keeps two tabs: Daily report and Work items.
  - The Report dialog no longer has its Photos section; photos go on each checklist item.
  - The pin panel's Photos tab, the pin details dialog and the Engineer's older review dialog show the pin's **checklist photos** with **Pin** (pins on the same sheet) and **Checklist item** filters (`components/ChecklistPhotos.tsx`). Photos are added per item in the Checklist tab.
  - Clients: their Site logs page keeps the daily logs with each day's photos; the separate Photos tab and the client pin Photos tab, which only ever showed progress photos, were removed (checklist photos are QA evidence and are not shown to clients).
  - Removed code: `useProjectPhotos`, the `PhotoGallery` default export.
- **Database cleanup of existing progress photos:** not done.
  - TESTING PIN (Oct 9, not locked): the delete was declined at the permission prompt; the row and file remain.
  - LAUNDRY (Oct 14): evidence-locked and part of the IR-0001 submission snapshot; deleting it would break that inspection record, so it was not proposed.
  - Neither appears anywhere in the app any more (the LAUNDRY one only inside the IR-0001 request snapshot).

## Verification

TypeScript, 102 library tests, the comparison test, 360 SQL tests and the production build passed. The migration was applied through the connector and its body hash-matches the file. Not visually verified in a signed-in browser.

## Follow-up: photo upload, viewer navigation, one filter bar

- Daily report photos: up to **50** per report (migration `20261018172839_daily_report_photo_limit.sql`). The upload had `capture="environment"`, which on phones forces the camera and takes a single photo; it is now **Choose photos** (gallery, several at once) plus **Take photo** (camera), with "Uploading 3 of 12…" progress, a running "n of 50" count, and a clear refusal before uploading if a selection would pass the limit.
- Photo viewer: **‹ ›** buttons on the photo and the ← → keys step through the same list (respecting the current tab, dates and filters), with a "3 of 12" position. Applies to every photo grid (Photo documentation, daily report photos, pin checklist photos).
- Filters: one shared `components/PhotoFilters.tsx` (Sheet → Pin → Checklist item, Clear filters) on Photo documentation and in the pin panel / pin details / Engineer review dialog, so the layout and labels are identical; fields share a row when there is room and wrap otherwise. In the pin panel it starts on that pin.
- Checks: TypeScript, 102 library tests, comparison test, 360 SQL tests, build; advisors unchanged. Not visually verified in a signed-in browser.

## Follow-up: work item boards as a detailed list

- `components/qa/WorkItemBoard.tsx` (QA requests, Corrections, Review inbox) is now a detailed list instead of tiles: chip filters with counts (short labels per page, e.g. Ready · Waiting · Blocked · Preparing · Accepted), search, and the shared `components/WorkFilters.tsx` (Sheet → Pin → Checklist item, Clear filters; replaces `PhotoFilters.tsx` and is also used by the photo pages). Each row: work item + sheet / requests / open NCRs, stage + status, responsible person, next action and blocker, Open. Filter options come from the items on the board.
- Fixed: an accepted item was labelled "Blocked" (tile) and "Nobody yet (blocked)" (workspace); it now reads "Done: accepted" / "No one: accepted". Removed the unused `WorkItemTile`.
- Checks: TypeScript, 102 library tests, build. Not visually verified in a signed-in browser.

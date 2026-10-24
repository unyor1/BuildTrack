# Foreman Corrections: photo markup before upload — 2026-10-23

## Request

On the Foreman Corrections page, add the same photo editing used elsewhere when uploading photos.

## What changed

- **Correction and work item photos** (`pin_photos`):
  - "Upload photos" / "Take photo" on a work item, in the correction package form (`CorrectionForm`) and in the work item record, now open `components/issues/MarkupUploadDialog.tsx`.
  - The dialog first shrinks the chosen photos (`preparePinPhoto`, JPEG, 1600 px, the same size as before, so the markup sits on exactly the stored pixels). They can then be marked up in the shared picker and editor: text, lines, arrows, shapes, freehand, rotation, a caption, one photo at a time as a slideshow.
  - **Add photo(s)** uploads them one by one. A photo that fails stays in the dialog with the reason; Cancel asks only after markup or a caption.
  - The phone's time and position are taken when the photos are chosen, as before.
- **Upload rules unchanged:** each photo keeps its checklist item and correction (`qa_attempt_id`) link, so evidence never mixes between items, attempts or corrections. The evidence lock, photo stamp and database checks apply as before.
- **Offline:** without signal the photo waits in the offline queue with its caption and markup, and `lib/offlineQueue.ts` sends them when the connection is back. Photos queued before this change still send. `sendQueuedItem` is exported for the tests.
- **Showing the markup:** pin photo thumbnails (`PinPhotos`), `PhotoGrid` thumbnails and `PhotoViewer` draw the markup (with View original).
  - `PhotoGrid` covers submitted evidence, NCR correction packages, checklist photos and the photo documentation galleries.
  - QA submission snapshots copy the whole photo row, so what was submitted keeps its markup.
- **Other NCRs** on the same page already used the QA evidence dialog with markup (`qa_photos.annotations`).
- **Reused parts:** the dialog uses the shared `IssuePhotoPicker` / `IssuePhotoEditor`; `MarkupUploadDialog` can serve other upload flows.

## Database

`supabase/migrations/20261023073942_pin_photo_markup.sql`, applied via the connector (see `sql/20261023073942_pin_photo_markup.md`). It adds `pin_photos.annotations jsonb not null default '[]'`, checked by `valid_issue_markup`. There is no UPDATE policy, so markup is fixed once saved. Existing photos get `[]`.

## Verification

- `pnpm test:sql`: 428 passed (3 new): store and read markup, refuse bad markup, no updates, snapshot keeps markup.
- `pnpm test:qa-photo-markup` additions:
  - The dialog: prepare, a non-image is listed, add with a retained failure and retry, queued photos count as done, Cancel asks after markup.
  - `preparePinPhoto`: JPEG output; refuses non-images.
  - The Corrections upload button: the dialog opens with the chosen files; the upload sends caption, markup, item and correction link and the stamp; a plain photo sends neither caption nor markup; invalid markup is refused; a refused record removes its file; offline queueing carries the markup; toasts and refresh run.
  - The offline sender inserts the caption and markup, and photos queued earlier send as before.
  - A deliberate mutation (dropping markup from the insert) failed the test; the source was restored byte-for-byte.
- Full `pnpm check` passed (TypeScript, all suites, SQL, production build).
- Live, read-only: column, check and policies confirmed; `anon` keeps only Supabase's default table privilege, which no policy allows; advisors unchanged.
- Not checked in a real browser (none available): the camera hand-off on a phone and drawing on touch should be checked by hand.

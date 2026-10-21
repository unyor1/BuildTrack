# QA evidence photo markup — 2026-10-21

## Request

Use the client's photo editing (when uploading an image) for the Engineer when logging an issue and in inspections.

## What changed

- **Logging an issue**: the Engineer's Issue register "Log an issue" (and "Add issue photos") already used the shared picker and editor (`IssuePhotoPicker` + `IssuePhotoEditor`, site issue photos 20261019095439). Unchanged.
- **Inspections and NCR evidence**: the photo button of `EvidenceStrip` (`components/qa/QaBits.tsx`), used on every inspection item (`InspectionDetail`) and on NCR evidence (`DefectDetail`), now opens an "Add photos" dialog with the same picker and editor before anything is uploaded: text, lines, arrows, rectangles, ellipses, freehand, colour, width, undo / redo, zoom, fullscreen and a caption. Up to 6 photos at a time; more can be added inside the dialog. "Add photo(s)" uploads them; a photo that fails stays in the dialog with the reason so it can be retried or removed. Cancel asks first only when something was marked up or captioned. The Foreman preparing a requested inspection gets the same dialog.
- Each chosen picture is shrunk first (`prepareQaPhoto`, the same 2000 px WebP as before) and the editor works on that shrunk file, so the markup lines up with exactly the stored pixels. The upload no longer shrinks a second time. The photo stamp (phone time / position) is taken when the photos are chosen, as before.
- Saved markup is shown over the photo: thumbnails draw it cropped exactly like the photo (`preserveAspectRatio="xMidYMid slice"` for `object-cover`) with a small pen badge; `PhotoViewer` draws it over the full photo (`meet` for `object-contain`) with **View original / Show markup**; `PhotoDetails` lists the number of marks. The before / after comparison still compares the original photos.
- Shared parts: `IssuePhotoEditor` gained optional `title` and `captionLimit` (QA captions are limited to 200 by the database); `IssuePhotoPicker` gained optional `prepare`, `onPreparing`, `captionLimit`, `nameCaptions`, `hint`, `editorTitle`. Without them the client and site issue forms behave as before, except that each draft now shows its number of marks.
- "Raise NCR" keeps no photo field on purpose: the database accepts any photo on a major / critical NCR as the "photo of the corrected work", so a photo attached when raising would satisfy that rule before any repair. Photos are added on the NCR afterwards, now with markup.

## Database

`supabase/migrations/20261021111736_qa_photo_markup.sql` (applied via the connector; see `sql/20261021111736_qa_photo_markup.md`): `qa_photos.annotations jsonb not null default '[]'` checked by `valid_issue_markup`, insert-only (no UPDATE grant), existing photos get `[]`. No policy, trigger or bucket change.

## Verification

- `pnpm test:sql`: 422 passed (3 new cases).
- New `pnpm test:qa-photo-markup` (`scripts/test-qa-photo-markup.mjs`, part of `pnpm check`): the real `uploadQaPhoto` stores the prepared file once and records caption + markup (no `annotations` key for plain photos, invalid markup refused before storage, refused records remove their file); `EvidenceStrip` prepares chosen photos, opens the dialog, uploads with the chosen-time stamp, keeps only failed photos with the reason, closes when all are added, takes the first 6 of 8, Cancel confirms only after markup; thumbnail overlay; picker prepare mode (locks, no 8 MB limit, empty captions, QA caption limit and title in the editor) and the unchanged client mode; `PhotoViewer` overlay waits for the real size and toggles. A deliberately broken copy of the test failed as expected.
- TypeScript, `test:lib` (109), `test:issue-editor`, `test:client-portal`, `test:direct-qa`, `test:work-item-evidence`, `test:qa-board-layout`, `test:project-records`, `test:comparison`, `test:assignments` and the production build passed.
- Not verified in a real browser (no browser session available here): drawing on a phone, the camera hand-off and the look of the overlay should be checked by hand once.

# Photo markup: select, move and rotate — 2026-10-22

## Request

Placed text and shapes in the photo editor must be selectable, movable and rotatable.

## What changed

- **Selecting:**
  - After placing text or finishing a shape, the tool returns to Select and the new mark stays selected, as in the blueprint editor (`afterCreate`).
  - In the editor every mark gets a wide invisible grab area. Thin outlines get a transparent band at least 24 SVG units wide (about 23 px at Fit); text gets a box around the whole text. Read-only views and thumbnails get none.
- **Moving:**
  - Drag a selected mark, as before.
  - Arrow keys nudge it by 0.5% of the photo (Shift = 5%). A run of presses is one undo step.
- **Rotating:**
  - A selected mark shows a dashed frame, turned with it, and a round handle above it, the same arrangement as the blueprint editor. The frame and handle keep their on-screen size at every zoom.
  - Dragging the handle turns the mark around its own centre. It uses the blueprint's `angleFromCenter` / `snapAngle` (`lib/shapes.ts`); Shift snaps to 15°.
  - The properties bar has Rotate left / right 15° and a degrees field; `[` / `]` also rotate by 15°.
  - A handle drag or a typed angle is one undo step; each 15° step is its own.
  - The handle never starts a pan, and its drag ignores the photo edge (angles stay correct beyond it). The editor canvas lets the frame and handle extend past the photo.
- **Data:**
  - Rotation is an optional `rotation` key on a mark: degrees around the centre of `markupBox`, stored -180..180 and dropped when turned back to 0.
  - Text has no browser measurement here, so its box is estimated from the font size and longest line. It only needs to be a stable turning centre and frame.
  - `MarkupLayer` draws the turn everywhere: editor, PhotoViewer, QA thumbnails, picker drafts, the slideshow strip, client report and issue photo views.
  - `markupProblem` and the database both accept it.
- **Model:** `changeMark` (one change, optionally continuing a run) backs nudges and style edits. `restyleMark` also takes `rotation`.

## Database

`supabase/migrations/20261021151557_markup_rotation.sql`, applied via the connector (see `sql/20261021151557_markup_rotation.md`). It is a `create or replace` of `valid_issue_markup` that also accepts a 12th key `rotation`, numeric -360..360. Any other extra key is still refused, and 11-key marks are unchanged. The check constraints on `snag_photos`, `site_issue_photos` and `qa_photos`, and the site issue photo RPCs, use it automatically. Stored markup is never rewritten.

## Verification

- `pnpm test:sql`: 425 passed. The new `99-zzzzzzzzzzzzzzzz-markup-rotation.cases.mjs` checks:
  - Old marks stay valid; rotations within ±360 are accepted.
  - Out-of-range, string and null rotations are refused, as are any other extra key and a missing required key.
  - A rotated mark is stored on QA evidence; an out-of-range one fails the check.
- `pnpm test:issue-editor`:
  - A finished shape and placed text return to Select and stay selected with the frame.
  - The handle drag gives 90°, and 45° with Shift; the mark doesn't move while turning; one undo step.
  - `]` / `[`; the degrees field (typing = one step, ±15° = own steps); text rotation controls; arrow nudge with Shift and one-step undo.
  - Selection is cleared when switching photos.
  - Viewers draw `rotate(30 200 100)` and get no grab areas; the editor gets a 24-unit transparent band and a text grab box.
  - Deliberately breaking the handle rotation made the test fail; the source was restored byte-for-byte.
- `pnpm test:lib`: 113 passed. The new rotation test covers validation, box and centre for shapes, freehand and text, normalisation, dropping at 0, moves keeping the turn, and run coalescing.
- Full `pnpm check` passed (TypeScript, every helper and component suite, SQL, production build).
- Live, read-only: the validator body before the change hash-matched the repo, and after the change it hash-matches the new file. Old-shape and rotated marks are accepted, out-of-range and other keys refused. Every stored client, site issue and QA markup row still validates. `anon` still cannot execute. Security advisors are unchanged (same 4 / 90 / 1).
- Not verified in a real browser (no browser session available): handle feel on touch, and how closely the frame hugs text, should be checked by hand.

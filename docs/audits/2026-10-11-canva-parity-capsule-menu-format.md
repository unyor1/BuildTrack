# 2026-10-11: Canva-style capsule, full context menu, text formatting bar, hard lock

Database: migration 0024 (`sql/0024_annotation_text_format.md`). Front end: `src/components/editor/*`, `src/components/ui/Menu.tsx`, `src/lib/{textFormat,capsule,exportSheet,blueprints}.ts`.

## 1. Locking (strict)
- The pointer already panned instead of moving a locked item; the remaining leaks were around it. The arrow-key nudge and every edit path first changed the item on screen and only then asked the database (which refused), so a locked item visibly jumped and snapped back.
- Now `useAnnotationOps` refuses before anything changes: `patchEach` rejects any edit except the lock itself on a locked item, `applyMoves` rejects any move that includes one (align, distribute, nudge, drag). The keyboard nudge skips locked items and says why.
- A locked item can still be selected (bounding box, lock badge, capsule); the cursor over it is the default arrow; dragging it pans the sheet. Same for locked pins. The database trigger remains the final guard (and now covers `format` too).
- Alt+Shift+L toggles the lock of the selection (pin or items).

## 2. Floating action capsule
A pill above the selection's box (below it when there is no room, kept inside the stage, hidden while moving or resizing): note / label, padlock (pressed when locked), duplicate, delete (disabled when locked), more (opens the context menu at the button). For pins: the note button opens the pin details, no duplicate. Placement maths is pure and tested (`lib/capsule.ts`).

## 3. Context menu
Right-click on an item (the browser's own menu is suppressed): Copy, Copy style, Paste, Paste style, Duplicate, Delete, **Position** submenu (Forward, Backward, To front, To back, align center / middle / left / right / top / bottom on the page), Group / Ungroup, Lock / Unlock, **Pin a task here**, **Report an issue here** (creates a pin at the item's centre; the issue variant starts as an issue), **Alternative text / label** (note text, picture caption, label on shapes, arrows and clouds). Pin menu: details, QR label, lock, delete. The menu component gained real submenus (hover, click, arrow keys; the second list flips left or slides up near the screen edge).

## 4. Text formatting bar
When text boxes or notes are selected the context bar becomes a formatting bar: font, size (- / value / +), text colour, B I U S (Ctrl+B / I / U), case (aA), alignment, list style, line and letter spacing, then Position, lock, transparency, duplicate, delete. Stored in `blueprint_annotations.format`; drawn by the stage and mirrored in PNG / PDF export (alignment including justify, spacing, underline, strike, list markers). Poppins, Inter, Roboto, Playfair Display and Roboto Mono are loaded from Google Fonts.

## 5. Panels
Toggle buttons for the sheets strip and the right panel sit in the top bar (desktop), so the canvas can take the whole width; Focus mode and the floating palette still exist. The selection bar wraps instead of scrolling on narrow windows.

## Verification
`pnpm test:sql` 194/194, `pnpm test:lib` 48/48 (new: text format, capsule placement), `npx tsc --noEmit`, `pnpm build`. Browser pass (mock backend, removed afterwards) with real mouse and keyboard: capsule placement and its buttons; padlock then drag (item unchanged, sheet panned); arrow keys on a locked item (no change, notice); right-click menu with all entries and the Position submenu; unlock by menu and by Alt+Shift+L; a locked picture could not be dragged; text box formatting (font, bold off, italic, underline, centre, bullets, uppercase, size) stored and rendered, and identical in the export preview; label dialog; Pin a task here; Report an issue here; layout at 1024 and 1920 px.

## Limits
- I could not reproduce a locked item moving by pointer drag in the current code (shapes, pictures and pins all stayed put); the leaks found and closed were the keyboard nudge and the optimistic edits described above. If you still see one, tell me which kind of item and how you moved it.
- Notes keep their fixed on-screen size (no font-size control); list markers are typed prefixes, not hanging indents.
- Formatting never changes the words themselves.

## 6. Follow-up: right-click on the sheet itself
Right-clicking the empty sheet (not an item) used to show only Paste / Select all / view items. It now offers: Paste, Select all, **Add here** (Pin, Note, Text box, Picture, placed at the click point), Lock / Unlock the base layer, Hide / Show the blueprint, **Zoom** (fit, in, out), **View** (layers panel, edit history, focus, presentation) and Export. Right-clicking an item or a pin gives the full item menu described in section 3.

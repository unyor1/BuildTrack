# 2026-10-09: Advanced blueprint workspace (Milestone 1)

Database: migration 0017 (`sql/0017_editor_v2.md`). Front end: `src/components/editor/*`, `src/lib/{blueprints,geometry,layers,undoStack}.ts`.

## Tools (toolbar, keyboard shortcut)
| Tool | Key | Notes |
|---|---|---|
| Select | V | move, resize (shapes and text boxes), pan |
| Pin | P | unchanged |
| Pen | D | freehand; stroke is simplified (Ramer-Douglas-Peucker) and capped at 600 points; size slider |
| Highlighter | H | wide translucent stroke (40 % opacity by default), size slider |
| Shape | S | rectangle / ellipse (unchanged) |
| Text | T | text box that scales with the plan; size S / M / L / XL |
| Note | N | callout (unchanged) |
| Polyline | L | click points, double-click or Enter to finish, Esc to cancel; shows length |
| Area | A | click corners, click the first point / double-click / Enter to close; shows area and perimeter |
| Measure | M | measuring tape (unchanged, not saved) |
| Stamp | K | status stamp (was T) |
Lengths and areas read in metres / m² once the sheet scale is set; otherwise in pixels. Palette gained yellow and black.

## Layering, opacity, locks
- Items are stacked by `z_index` (database-owned; new items go on top). Inspector buttons and the Layers panel offer To front / Forward / Backward / To back through `move_annotation_layer()`, which renumbers atomically. The screen applies the same rule first (`lib/layers.ts`), then the database confirms. Pins always stay on top.
- Opacity (5-100 %), color, line thickness, text size are editable per item.
- Locks: per annotation, per pin, whole sheet (lock / unlock every item) and the base layer (no new revisions, no scale change). Enforced by database triggers; the screen mirrors them (blocked drag shows a message, delete disabled).

## Edit history and undo
- History tab (Engineers, Foremen, admins; not Clients): `get_sheet_history()` merges annotation / lock / layer / deleted-pin entries with the existing pin timeline.
- Undo / redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, toolbar buttons): adds, deletes, moves, resizes, edits, color / opacity changes, layer moves, locks, pin moves. Not covered: pin creation or deletion and status changes (they have confirmations and their own timeline). A step the database refuses (item locked, changed by someone else) is reported and dropped from the stack. The stack is cleared when switching sheets.

## Responsive toolbar
Single row from 1280 px (`xl`); below that the tool strip wraps to its own scrollable row so all 11 tools stay reachable on tablets and phones.

## Verification
- `pnpm test:sql` 136/136 (0017: `80-editor-v2.cases.mjs`), `pnpm test:lib` 15/15 (geometry and layer math: translate-within-sheet, simplification, length / area with non-square sheets, area scaling, front/back/forward/backward and edge cases), `npx tsc --noEmit`, `pnpm build`.
- Browser (temporary mock backend, removed afterwards): pen, highlighter, text box dialog, polyline (Enter to finish), area (click first point to close), selection and inspector for each, layer buttons, Ctrl+Z / Ctrl+Shift+Z, per-item lock, base-layer lock confirmation, history list, delete with confirmation and undo; roles: Engineer (all tools), Foreman (drawing tools disabled, history visible, no base lock), Client (only select and measure, no history).
- Live database: rolled-back check after applying 0017 (see migrations log).

## Not done / notes
- Freehand and measurement objects are move-only (no vertex editing); delete and redraw to change the shape.
- Locked-item drags cannot be undone because nothing changed; history rows are written per completed action, not per pointer move.
- The History tab shows the latest 120 entries.

# 2026-10-11: Canvas interaction overhaul (contextual bar, Position flyout, corner handles)

UI only. No migration, no database change. Files: `src/components/editor/{ContextBar,EditorToolbar,LayerStack,StageCanvas,BlueprintEditor,Inspector}.tsx`, `src/components/ui/Popover.tsx`, `src/lib/arrange.ts`.

## What was wrong
Selecting an item only changed the right-hand inspector; the top bar held every tool at once and was cramped; locked items were click-through, so the lock could not be seen or undone from the item itself; only one resize handle existed.

## Changes
1. **Two-row header.**
   - Row 1 (global): Back, project and sheet switcher, revision, zoom (- % + Fit), undo / redo, history, base lock, upload, share (copies a link, opens the pin when one is selected), export, light / dark switch, View menu. Every icon button is at least 36 x 36 px and has a tooltip.
   - Row 2 (`ContextBar`) changes with the selection:
     - Nothing selected: Select, Add pin, Add note, Draw shape, Tape, Upload image and a More menu with the remaining tools; the options row (color, size, scale) sits under it.
     - A pin: status menu, lock, details, delete.
     - Drawn items / images (one or many): **Position** flyout, lock, color, thickness, text size, transparency, duplicate, delete and a More menu (copy, paste, group, copy style, apply style). A Tools menu on the left always reaches every tool.
2. **Position flyout.** Arrange tab: Forward, Backward, To front, To back; align (to the sheet for one item, to each other for several; spread across / down for three or more); rotation in degrees. Layers tab: the full stack with drag to reorder, eye, lock and one-step arrows (same component as the inspector's Layers tab).
3. **Selection handles.** Shapes and images show four corner handles plus the round rotate handle; resizing from any corner keeps the opposite corner fixed, also when rotated, never leaves the sheet and never goes below 1 percent (`resizeFromCorner`, unit-tested). Text and symbols keep their single width handle.
4. **Locking.** A locked item can be selected; it shows a lock badge at the corner of its box (click to unlock) and the bar offers only what is allowed (order, lock, duplicate). Dragging a locked item pans the sheet instead of moving it. Delete, color, thickness and transparency are disabled until it is unlocked. Locked pins behave the same.
5. **Quality.** Popovers close on Esc and on outside press and do not let Esc clear the selection; slider changes are committed once (on release), so one drag makes one undo step.

## Verification
`pnpm test:lib` 42/42 (new: corner resize), `npx tsc --noEmit`, `pnpm build`. Browser pass with the temporary mock backend (removed afterwards) at 1024, 1280 and 1920 px, dark and light: select by real clicks; Position (all four order buttons, align, layers list); lock, disabled controls, pan instead of move, unlock by badge; corner drag (right and bottom edges stayed at 20 / 72); transparency (slider and number), color, duplicate; pin bar (status, lock, delete disabled); Ctrl+A with align; Tools menu to Cloud and back with V; no overlapping labels at 1280 or 1920.

## Limits
- The Position flyout's drag-to-reorder was exercised through the same code as the inspector's list (already tested); the drag itself was not re-driven in this pass.
- Text boxes keep a single width handle (their height follows the text).

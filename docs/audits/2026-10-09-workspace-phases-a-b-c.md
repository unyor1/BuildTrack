# 2026-10-09: Workspace enhancement, phases A, B and C

Database: migration 0018 (`sql/0018_editor_objects_groups.md`). Front end: `src/components/editor/*`, `src/components/ui/Menu.tsx`, `src/lib/{arrange,shapes,symbols,pdf,exportSheet,editorPrefs,undoStack}.ts`.

## Phase A: panels, shortcuts, clipboard
- **Hideable layout (remembered per browser):** the sheets strip, the inspector (docked, floating or hidden) and the tools (top bar or a draggable, collapsible floating palette). View menu in the toolbar, plus Reset layout. Below 1024 px the same panels are drawers.
- **Focus mode (F)** hides every panel and the toolbar; a small pill leaves it. **Command palette (Ctrl+K)** runs any command by name. **Shortcut sheet (?)**. Fit with `0`.
- **Copy / cut / paste / duplicate** (Ctrl+C / X / V / D). The clipboard survives switching sheets, so items can be pasted onto another sheet; repeated pastes step diagonally. **Arrow keys nudge** (Shift = 10x); a burst of key presses becomes one undo step.
- **Style painter:** copy one item's color, opacity, thickness or text size and apply it to others.
- Right-click menu on items, pins and empty space.

## Phase B: objects and arranging
- **New objects:** arrow / leader line (Shift = straight angles), revision cloud (drag a box or click the corners), dimension line (length in metres once the scale is set), and a library of 12 construction symbols (north arrow, hazard, no entry, fire extinguisher, first aid, PPE, equipment, crane, exit, inspect, passed, failed).
- **Multi-select:** Shift-click, Shift-drag (or the Box select option), Ctrl+A; dragging any selected item moves all of them in one database transaction (`move_annotations`). Pressing an unselected item selects it and drags immediately, as in a slide editor.
- **Arrange panel:** align left / center / right / top / middle / bottom, spread across / down (3 or more items), group / ungroup (Ctrl+G), to front / to back, lock all, delete all. Groups select and move as one.
- Notes are callouts drawn at a fixed screen size, so they count as a point when aligning.

## Phase C: review features
- **Compare revisions:** two revisions on top of each other with a draggable slider, a fade overlay, or a difference view; zoom and pan inside the modal.
- **Presentation mode (F5):** read-only full screen, next / previous sheet (arrow keys), layer toggles, status legend, laser pointer. Esc leaves; leaving browser full screen also leaves.
- **Export (PNG or PDF):** the sheet exactly as drawn (pins, drawings, text, symbols, measurements) with an optional title block (project, sheet, revision, scale, date) and status legend, with a live preview. The PDF is written by a small built-in writer (no library), the image is drawn from a downloaded copy so the canvas is never tainted.

## Quality checks
- `pnpm test:sql` 146/146 (new: `90-editor-v3.cases.mjs`), `pnpm test:lib` 30/30 (alignment, distribution, clamping, marquee, groups, angle snapping, arrow heads, cloud arcs, symbol keys matching the database list, PDF structure with exact xref offsets), `npx tsc --noEmit`, `pnpm build`.
- Browser pass with the temporary mock backend (removed afterwards): drawing each new object, Box select of six items, align left + undo + redo, group, copy + paste (group id remapped), multi-drag (all six moved by the same amount in one request), nudge coalescing, lock from the context menu, command palette, export dialog with live preview and a real 173 KB PDF, focus mode, presentation mode (sheet change, legend), compare modal, floating / hidden inspector and sheets chips, layout reset, phone width (390 px).

## Notes and limits
- Layout preferences and the clipboard live in the browser only (localStorage / sessionStorage); clearing site data resets them.
- Drawings and measurements are still move-only (no vertex editing).
- Presentation mode needs the browser's full-screen permission to go full screen; without it the clean view still works.
- Paste places copies at a small offset, not at the mouse position.

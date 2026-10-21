# Photo editor: blueprint-style toolbar and multi-photo slideshow — 2026-10-21

UI only; no migration, RLS, storage or Edge Function change.

## Request

Make the uploaded-photo editor match the blueprint editor's navigation, toolbar and editing feel; fit the whole image first; add a manual slideshow for several photos with per-photo state; apply it to every editable-photo flow without changing evidence, permissions or upload rules.

## What changed

- **Structure** (`src/components/issues/`):
  - `IssuePhotoEditor.tsx` (state, canvas, gestures);
  - `PhotoEditorToolbar.tsx` (toolbar + `MarkupProperties`, presentational);
  - `PhotoSlides.tsx` (thumbnail strip);
  - `MarkupLayer.tsx` (moved out of the editor, still re-exported).
  - Pure rules live in `src/lib/photoEditorModel.ts`: per-photo docs, bounded undo history, coalesced style runs, changed-photo detection, manual stepping. They are tested in `test:lib`.
- **Toolbar like the blueprint editor:**
  - Compact icon buttons with tooltips and shortcuts, in the same control style as `ContextBar`. The active tool is brand-filled.
  - Order: Select, Pan | Text, **Shapes** dropdown (Line, Arrow, Rectangle, Ellipse, Freehand) | Undo, Redo | View original | zoom − % + Fit Fill | fullscreen.
  - It reuses the blueprint `Icon` set (plus a few photo glyphs) and `ui/Popover`. There are no pins, tape or other sheet-only actions.
- **Properties** appear only while a drawing tool is active or a mark is selected:
  - Colour: eight swatches plus a custom colour.
  - Line width (1-12), or text size S/M/L/XL for text.
  - The text itself, and Delete.
  - With a mark selected, changes apply at once. A slider drag or typing run is one undo step; each swatch or size pick is its own step. Text can't be emptied.
- **Shortcuts:** V H T L A R E D, Del, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Page Up / Page Down. They are ignored inside text fields.
- **Canvas:**
  - Every photo opens with **Fit**: the whole image, the same padding as the sheet editor, never cropped or stretched.
  - Fill is applied only when chosen, and is kept for the next photo.
  - The canvas is 56vh on phones and 64vh beside the thumbnails; fullscreen gives it all remaining height.
  - Toolbar, caption and hints stay reachable by scrolling the dialog body.
  - The photo and markup still share one transformed stage, so they stay aligned at every zoom. Wheel, pinch, Space, middle-button and Pan navigation are unchanged.
- **Slideshow** (two or more photos):
  - "Image n of N" with Previous / Next, without wrap-around or auto-advance.
  - A collapsible numbered thumbnail strip like the sheet sidebar (a row on phones). It highlights the current photo and shows live markup and an "edited" note.
  - Each photo keeps its own markup, caption and undo / redo history. Fullscreen and the tool stay on while switching.
  - With one photo, none of these controls show.
- **Saving and protection:**
  - Save hands back only the changed photos; with no changes it just closes, so no empty issue-photo version is written.
  - Closing with unsaved changes asks (`useConfirm`).
  - The picker asks before removing a photo with markup or an edited caption. It also gained "Mark up photos (N)", which opens the slideshow at the first photo; "Edit / annotate" opens it at that photo.
  - Escape still leaves fullscreen first.
- **Flows covered:**
  - Engineer Log an issue and Add issue photos (picker).
  - Edit markup on a saved issue photo (single photo, versioned save via `saveSiteIssuePhoto`, unchanged).
  - Client Report a problem (picker).
  - QA inspection and NCR evidence (`EvidenceStrip` → picker, with prepare-before-markup).
  - Read-only views: client report photos and old issue-photo versions.
  - Uploads, retries, limits, file validation, captions per evidence type and evidence locks are unchanged. Each flow still uploads to its own record (issue report, client report, inspection item or NCR), so nothing mixes between checklist items, attempts, corrections or reports.
- **`ui/Popover.tsx`:** the panel moved from z-700 to the dialogs' z-900, so dropdowns opened inside a dialog (the photo editor) appear above it. Stacking now follows opening order everywhere: a dialog opened later still covers an older popover. Nothing else uses layers between 700 and 900.
- **Unchanged:** the before/after comparison, PhotoViewer, the standalone attendance page and the blueprint editor itself (its `Icon` is only imported).

This supersedes the "Fill is the default" and the 72vh / 78dvh viewport notes in `2026-10-21-photo-editor-zoom-fullscreen.md`.

## Verification

- `pnpm test:issue-editor` (rewritten editor section, real toolbar, properties and slideshow components):
  - Fit-first sizing and Fill kept across photos.
  - Zoom limits and percentages; fullscreen Fill / Fit and Escape; manual view preserved.
  - Wheel, pan, Space, middle-button, pinch and blur.
  - Every tool through the Shapes dropdown and keyboard shortcuts; properties for tools and selected marks; coalesced undo for width drags; separate steps for colour picks.
  - Text placement, editing and empty-text refusal; delete; View original; save of changed markup and caption.
  - Slideshow: counter, bounds, highlighted thumbnail, Page Up / Down, hide / show strip, fullscreen kept, per-photo markup / caption / undo, changed-only save.
  - Unsaved-close confirmation; read-only view; no-change save.
  - A deliberate mutation (every edit sent to photo 1) made the slideshow assertions fail as expected; the source was restored byte-for-byte.
- `pnpm test:lib`: 112 passed (3 new photo-editor model tests).
- `pnpm test:qa-photo-markup`: the picker opens the editor at the chosen photo or the first, saves only changed photos, and asks before removing a marked-up photo but not an untouched one. QA upload, strip and viewer checks are as before.
- Full `pnpm check`: TypeScript, all helper and component suites, 422 SQL cases and the production build passed.
- Not verified in a real browser (no browser session available): the visual layout, the toolbar wrapping on narrow phones, the Popover above the dialog, and touch drawing should be checked by hand once.

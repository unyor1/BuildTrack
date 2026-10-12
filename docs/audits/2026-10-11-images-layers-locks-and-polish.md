# 2026-10-11: Floating images, layers panel, click-through locks, sheet removal, motion polish

Database: migration 0019 (`sql/0019_editor_images_reorder.md`). Front end: `src/components/editor/*`, `src/lib/{sheetImages,arrange,shapes,exportSheet}.ts`, `src/index.css`.

## Milestone 1: workspace
- **Floating images.** The Image tool (`I`, or Ctrl+K "Add an image"), dragging a file from the computer onto the sheet, or pasting a picture (Ctrl+V) places it on the sheet at the drop point. Pictures are shrunk in the browser (max 2000 px, WebP), stored in the private `blueprints` bucket inside the project folder and shown through short-lived signed links. Up to 10 at once; a progress chip shows while uploading. The file name becomes the caption.
- **Full canvas elements.** Select, drag, resize (square handle; keeps the picture's shape, Shift = free, correct on rotated items), rotate (round handle above the item, Shift = 15 degree steps, or the slider in the inspector), opacity, caption, lock, layer, copy / paste / duplicate, undo / redo, export to PNG / PDF. Rotation also works for shapes, text boxes and symbols.
- **Layers panel.** Every drawn item and picture in stack order (top first) with a thumbnail, drag handle (drop line shows where it lands; one transaction through `reorder_annotations`), eye toggle (hide on screen and in exports), lock, and forward / backward arrows for keyboard use. A collapsible Pins section lists every pin with its own eye toggle. The blueprint itself is a Backdrop row with an eye toggle and the base-layer lock.
- **Locking.** A locked item stays visible but takes no clicks: the click goes through to what is behind it (and to the pin / empty-space actions), box select and Ctrl+A skip it, and tapping it shows how to unlock. Unlock from the context menu (right-click), the Layers panel, Ctrl+L on a selection, or the command palette. Locked items still appear in the Layers panel and can be reordered (layer order is not content).
- **Keyboard.** Delete / Backspace, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z, Esc and multi-select (Shift-click, box select) were already in place and are unchanged.

## Milestone 2: outstanding items
- **Email whitelist** (0015, Edge Function `admin-users` v3, Whitelist tab) and **onboarding**: already complete and verified earlier (role applied when the email is confirmed; no approval step).
- **Confirmation modals.** No native `alert` / `confirm` exists anywhere in `src` (checked). New confirmations: **Delete sheet** (blueprint removal, with the revision / pin / drawing counts; files are removed from storage afterwards, best effort) and **changing a project to Completed, Cancelled or On hold**. Already confirmed: project delete, role change, decline / approve, disable account, permissions, whitelist add / remove, remove project member, delete items, lock base layer.
- **Google sign-in.** Verified by code and tests: the sign-up trigger fills name and avatar from Google metadata (`name` / `full_name`, `picture` / `avatar_url`, https only, length-limited), the account starts as an active basic user, and `RouteGuard` sends it to `/user/home` (other roles to their dashboards).

## Milestone 3: polish
- Edge-to-edge layouts, high-contrast tokens and glass navigation were delivered on 2026-10-09 (`2026-10-09-ui-density-contrast-navigation.md`); the workspace is `fixed inset-0`.
- **Skeletons.** Audited every asynchronous screen; all use skeleton loaders. The two remaining text placeholders in the new dialogs (compare, export preview) became skeletons.
- **Motion.** A base-layer rule gives buttons, links, selects, checkboxes and inputs smooth color / border / shadow transitions, a subtle press effect and a brand focus glow; menus, context menus and floating panels pop in; everything honours `prefers-reduced-motion`. Pins and the compare handle opt out (`transition-none`) so zooming stays in lockstep.

## Quality checks
`pnpm test:sql` 155/155 (new `95-editor-images.cases.mjs`), `pnpm test:lib` 33/33 (rotation maths, picture sizing on a non-square sheet, resize with locked aspect), `npx tsc --noEmit`, `pnpm build`. Browser pass with the temporary mock backend (removed afterwards): drop a picture (placed at the drop point with the right proportions), rotate by dragging (90 degrees exactly), resize a rotated picture (aspect kept), slider rotation, export preview with the rotated picture, drag reorder in Layers + undo, eye toggles for items / pins / backdrop, locked symbol ignores a real click and explains why, delete sheet with confirmation.

## Notes and limits
- Deleting a drawn picture does not delete its file (Undo needs it); files of a deleted sheet are removed.
- Per-item visibility, the Backdrop eye and layout preferences are per browser session, not saved to the database.
- The native file chooser opened by the Image tool could not be driven from the test tool; drop, paste and the upload pipeline were exercised instead.

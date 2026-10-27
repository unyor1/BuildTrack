# Pin panel refinements — 2026-10-25

## Requested changes

Dropdown filters in Issues & NCRs, a working Log an issue action, a wider/scrollable panel, detailed record/photo views, calendar filtering and today's photos on opening.

## Implementation

- Record type and All/Open/Closed chips became labelled native dropdowns. Type counts, checklist/search filters, clear/reset and role projection are unchanged. Filters and detail fields reflow to available panel width, not the whole-screen breakpoint.
- The Engineer's Log an issue button and picker now allow pending-review pins; note/completed exclusions remain. The loader opens a visible loading/error dialog. Saved records refresh the parent pin as well as this pin's records.
- A backend regression exposed the second cause: the RPC tried to set Issue during locked QA. The applied [migration](sql/20261025090858_site_issue_pending_review.md) retains the pending review rather than weakening the lock.
- Sidebar cards show untruncated descriptions and available severity, raised/due dates, reference/source, correction/prevention and closing details. Existing detail dialogs and approval rights are reused. Full-view tables retain these notes too.
- Desktop inspector defaults to 480px and can be resized via its captured-pointer separator (320–760px, viewport-aware), using the left docked edge/right floating edge. Width is stored in existing editor preferences and invalid saved values are clamped. Keyboard arrows, Shift-arrows and Home/End are supported. The pin body scrolls below its heading/tabs with a stable scrollbar gutter. Mobile is a near-full-width drawer.
- Photos starts on today's upload date in Philippine time whenever mounted. The shared date filter supports presets and custom ranges. Dates reach the existing authenticated query before its 200-photo limit; invalid ranges remain guarded there. Filter changes create a fresh result/viewer, so stale results or a previous slideshow do not flash.
- Detailed photo cards show captions, checklist status/remarks, capture/upload times, uploader, work pin and evidence kind. Original and correction evidence stay separate. Existing signed URLs, rejected-image restrictions, overlays, detail viewer/slideshow and original files are preserved. No changes to photo-editor tools or global photo-documentation date defaults.

## Checks

- `pnpm check` passed: TypeScript, all component/model suites, 439 isolated SQL cases and production build.
- `test:pin-records` adds dropdown selection/count/privacy, pending-review issue opening, detailed card facts, photo default/reset/date-query/keying, and pointer/keyboard resize tests.
- `test:issue-editor` verifies pending/locked pins remain selectable in the real issue form while completed work remains excluded.
- Hosted migration/function/grants verified read-only; advisors unchanged. No live project records were created for testing.
- Local Vite returned HTTP 200. A temporary synthetic fixture rendered the actual filter/list/gallery components in isolated headless Chrome at 360px and 600px issue-panel widths and 480px photo-panel width. Screenshots inspected; no panel/content horizontal overflow, issue panels scroll vertically. The fixture and screenshot were removed after checking.
- Live signed-in end-to-end operation and real mobile device gestures were not browser-tested. The visible browser connector exposed no tabs; the layout check used a separate synthetic fixture, not a production account.

Unrelated existing worktree edits were preserved. No commit or push was requested for this task.

# 2026-10-11: Phase 1 delivered (notifications, invitation codes, engineer tools, admin audit and health)

Database: migration 0020 (`sql/0020_notifications_invites_audit.md`). Front end below. Roadmap: `docs/BUILDTRACK_PRODUCT_ROADMAP.md`.

## What users get
| Who | New |
|---|---|
| Everyone | **Notification bell** in every top bar: unread badge, list, mark read / dismiss, opens the right page (and project). Polls every minute and on focus; deadline reminders requested at most every 30 minutes. |
| Basic user | Invitation-code box (instant role, wrong guesses limited), profile completeness meter, profile photo upload (cropped square, own folder), "which role is yours" guide. |
| Engineer | Real **Verification queue** (verify with confirmation, or send back with a required reason; both notify the foreman and write the timeline), **Issue register** (severity, age, assign, send back, close, log an issue, CSV), **Progress by zone** (per sheet and discipline, against the schedule, deadlines list, CSV), **Assignment board** (drag a pin to a foreman, or use the menu), real **Dashboard** across projects. Sidebar badges are live counts. "Open on the plan" jumps to the pin in the editor (`?pin=<id>`). |
| Foreman | Real **dashboard**: pins assigned to them or open to anyone, grouped (sent back, overdue, issues, in progress, not started, waiting), and a **Report** dialog (checklist ticks, photos, note, start work / send for review through `report_pin_progress`). |
| Admin | **Invitation codes** page (create, copy, disable), **Audit log** (search, action, dates, CSV, load more), **Project health** on the dashboard (verified share vs schedule, late work, issues). |

## Removed (honesty)
Fake sidebar badge "12", "synced 2 min ago", "v2.4.1", hard-coded "Valencia Commercial Building / VCB-024 / Phase 03" in the Admin and Foreman sidebars (now the selected project). Mock-only pages that remain are listed in the roadmap (Phase 2+).

## Engineering
- Pure maths (`lib/progress.ts`): overdue / due-soon, per-sheet roll-up, schedule share, project health rule, CSV with formula neutralising. `pnpm test:lib` 39/39 (6 new).
- Pin `severity` added to the pin form and type. Pin deep link in the editor.
- **App shell:** every page is lazy-loaded (entry bundle 950 kB to 236 kB), `ErrorBoundary` shows a friendly screen (and a "reload for the new version" message after a deploy), skeleton while a page loads.
- Bug found and fixed during the browser pass: the review panel re-rendered forever because the checklist reported its counts through an unstable callback.
- Test hygiene: no secrets, no native `alert`/`confirm`, semantic colour tokens only.

## Verification
`pnpm test:sql` 171/171, `pnpm test:lib` 39/39, `npx tsc --noEmit`, `pnpm build`. Browser pass with the temporary mock backend (removed afterwards): bell open / read / navigate; queue send back (validation, status, timeline note) and verify (confirmation, verifier recorded); issue register (severity change, assign, log an issue); progress page numbers; assignment board by menu and by drop; invitation page create / validation / disable with confirmation; audit log search; basic-user redeem (bad code, short code, valid code goes to the foreman home); edit-profile modal with photo control; console clean on all new pages.

## Limits
- Photo upload, the real notification triggers and `generate_due_notifications` were verified in the database tests and a rolled-back live check, not through the mock browser backend.
- Email delivery of notifications (Brevo Edge Function), the foreman screens and attendance are Phase 2 and later.

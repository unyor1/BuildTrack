# 2026-10-09: UI density, contrast and navigation (Milestone 2)

Scope: `src/index.css` (legacy Admin / Engineer / Foreman / Client workspace CSS) plus `src/pages/User/UserShell.tsx`. No logic or database change.

## Density (no big empty gutters)
- `.admin-page`, `.engineer-page`, `.foreman-page`, `.client-page` were fixed 1010-1080 px columns; now full width up to 1840 px. Main padding is fluid (`clamp(12px, 2vw, 32px)`), page intros and panels are tighter (16 px panels, 14 px gaps).
- Admin KPI grid: 3 columns (2 on small screens, 6 from 1280 px) so six cards never leave an orphan. Engineer / Foreman / Client metric rows are flex-wrapped so the last row stretches instead of leaving an empty cell. Project and blueprint card grids use `auto-fill`.
- Top bars shrank from 69-81 px to one variable height (`--bt-topbar`: 60 px, 56 px on phones) shared by every shell and its drawer.
- User shell content width 1024 -> 1600 px.

## Contrast and typography
- Every font size below 12 px in the workspace CSS was raised (7-8 px -> 11 px, 9 -> 11.5, 10 -> 12, 11 -> 12.5; 338 declarations).
- 158 fixed-hex text colors that failed WCAG AA (4.5:1 for text, 3:1 for icons) on white or on the dark panel (`#1d1d1d`) became `light-dark(<passes on white>, <passes on dark>)` pairs, computed by script (hue kept). Text on permanently dark areas (sidebars, top bars, map/plan overlays, pills) was deliberately skipped. The remaining flagged items in the audit are icons (>= 3:1) or those dark areas.
- Dark mode headings and body text in the Admin shell were a muted blue (`#9eadd1` / `#9daed3`, hard to read); they are now near-white (`#f1f3f8` / `#e6e8ee`).
- Top bars: the pale pink gradient gave about 2.5:1 with white text; replaced with a deeper brand magenta gradient (>= 4.9:1).
- Global `:focus-visible` ring in brand orange for keyboard users.

## Navigation
- Top bars are sticky frosted glass (`backdrop-filter: blur`, soft shadow, hairline border).
- Side drawers (all four shells): glass background with blur, larger 42 px targets, 13 px labels, hover tint, and a crisp active state (tinted gradient + a rounded magenta-to-orange bar on the inner edge instead of the old right-edge inset line). Drawer scrolls as a whole.
- User shell header uses the same frosted style.

## Verification
Browser pass (temporary mock-backend harness, removed afterwards) on Admin dashboard and Users page (light and dark, desktop and 375 px phone), Engineer dashboard, Foreman dashboard, Client overview, and the open drawer. `npx tsc --noEmit` and `pnpm build` pass.

## Notes
- The original file is kept as a diff baseline in git only if the repo is initialised; changes were made in place (Tailwind rewrite was out of scope, per CLAUDE.md).
- Not yet done: page-by-page pass of every legacy sub-page (blueprint mapping, QA workflow, etc.) at all widths; these inherit the new tokens but were not each opened.

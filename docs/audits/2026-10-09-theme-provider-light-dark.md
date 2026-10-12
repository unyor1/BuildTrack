# 2026-10-09: Global light/dark theme (Milestone 1)

Category: architecture / UI. Database: none.

## Problem
`src/index.css` has ~866 hard-coded color values (656 distinct) used by custom classes (`admin-sidebar`, `admin-panel`, ...). Tailwind `dark:` utilities alone cannot theme those pages.

## Approach (state management)
- **State:** `src/lib/theme.tsx` `ThemeProvider` (React context). Mode is `light | dark | system`, default `system` (follows the OS and reacts live to OS changes).
- **Persistence:** `localStorage` key `buildtrack.theme`, wrapped in try/catch (private mode falls back to session-only). `storage` event keeps several tabs in sync.
- **Application:** the resolved theme is mirrored as the `dark` class on `<html>`. A small inline script in `index.html` sets that class before first paint (no flash of the wrong theme).
- **Provider order:** `ThemeProvider > AuthProvider > App` (`src/main.tsx`).
- **Toggle:** `src/components/ThemeToggle.tsx` (Light / Dark / Auto), placed in the sidebar footer of the Admin, Engineer, Foreman and Client shells. Auth/Public pages follow the saved choice.

## CSS architecture
1. **Legacy CSS:** a one-time script (backup kept outside the repo) wrapped 377 color declarations (125 backgrounds, 109 borders, 143 text colors) in `light-dark(<original>, <dark equivalent>)`. Only light surfaces, light borders and dark text were converted; saturated brand/status colors and already-dark UI (sidebars, auth card) were left unchanged. `color-scheme` is `light` on `:root` and `dark` on `.dark`.
2. **New code:** semantic tokens (`--surface`, `--surface-muted`, `--fg`, `--fg-muted`, `--line`, `--brand`, `--brand-hover`, `--brand-text`, `--brand-strong`, `--brand-soft`, `--accent`, danger/ok soft+fg) defined for `:root` and `.dark`, exposed to Tailwind through `@theme inline` (`bg-surface`, `text-fg`, `border-line`, ...). Tailwind `dark:` variant enabled with `@custom-variant dark (&:where(.dark, .dark *))`.
3. **Brand in dark mode:** `#9E1F93` stays as button background (white text, ~6:1). For text/links on dark surfaces `--brand-text` is lightened (`#e08ad8`) to keep contrast. Accent `#F18B00` is used as borders/active pills in both themes.
4. Components moved off hard-coded colors: RouteGuard, Modal, AssignedProjects, MfaPage, UserManagement, ProjectManagement, project status chips (`dark:` variants).

## Verification
- `tsc --noEmit` and `pnpm build` pass.
- Browser check: landing page in dark and light (class applied, `color-scheme` switches, choice persists across reload, Auto restores system behavior).
- NOT yet visually checked in dark mode: the four signed-in shells (need real accounts: Super Admin, Engineer, Foreman, Client). First items to check there: tables, form inputs, panels, the blueprint canvas.

## Known limits / follow-ups
- `light-dark()` needs Chrome/Edge 123+, Firefox 120+, Safari 17.5+.
- Dark equivalents are computed, not hand-tuned: expect a few contrast tweaks after reviewing each shell.
- Backup of the pre-conversion CSS is in the Claude session scratchpad only; git history is the long-term rollback once this repo is under git.

# 2026-10-12: One identity per workspace + git

UI only, no database or Edge Function change.

- **Git**: repository created (`main`), baseline commit of the whole project before this change. `.env*` stays ignored (only `.env.example` with placeholders is tracked); `.claude/settings.local.json` added to `.gitignore`.
- **Why**: every role used the same shell colours, so the Engineer workspace looked like the Admin one.
- **How** (the shared `AppShell` stays, as CLAUDE.md requires): `AppShell` takes `persona` and sets `data-persona`; the M6 block in `index.css` gives each one its accent, sidebar background, active-nav colour, top-bar accent line, page-header treatment, tile top bars, tab colour and typography.
  - Admin, "Control center": plum rail, clean header with a magenta-to-line divider.
  - Engineer, "Engineering office": blueprint-blue rail with a drafting grid, page headers on a grid card, monospace `// eyebrow` labels.
  - Foreman, "Field operations": safety-orange accent, hazard stripe on the rail and on page headers, uppercase titles; active tabs use dark text on orange (contrast).
  - Client, "Client portal": deep teal with a hint of magenta, serif (Playfair Display) page titles, rounder cards.
  - Basic user: plum, like admin.
- Brand magenta stays on the logo and primary buttons in every workspace. Nothing was removed from any page.
- **Checked**: every route of all five roles at 375 px and 1440 px (no errors, no sideways scroll, one `h1`, nothing under 11 px); light and dark screenshots of each workspace. `pnpm check` passes.

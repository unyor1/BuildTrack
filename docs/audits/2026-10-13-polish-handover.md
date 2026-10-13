# 2026-10-13: Polish and handover

UI, tooling and docs only; no database or Edge Function change.

- **Accessibility sweep** (new stricter checker: real colour contrast through canvas colour resolution, labels, tap targets): fixed pin progress ticks (white on orange/green was 2.5-2.9:1; the text colour is now picked by contrast), the green Close button (3.2:1 -> 5:1), inline text links and breadcrumbs below 24 px. Every route of every role now passes.
- **First-run guidance:** `GetStarted` checklist on the Engineer dashboard (sheet, pins, due dates, foreman, first verification) and the Admin dashboard (project, team, sign-ups); steps are ticked from data; gone when complete.
- **Dead CSS:** `src/index.css` 175 KB -> 66 KB (1,076 rules whose classes nothing uses, mostly the old per-role sidebars and top bars). Proof: computed style and size of every element hashed on all 37 routes before and after: identical (four pages differed only by time-dependent text and were compared row by row, identical). Phone (375 px) checked on admin, engineer, foreman and client pages and the public landing page. First attempt wrongly removed `:is()` rules; the pruner now never judges selectors with `:is/:where/:not/:has`.
- **Phone editor:** the sheet's floating tools (pin quick-action capsule, zoom) sat on top of an open pin panel and covered its action buttons; on phones the sheet is now its own layer under the drawer.
- **Handover:** `README.md`, `CONTRIBUTING.md`, `docs/HANDOVER.md`, pull request template, package name `buildtrack`. No demo-data seeder on purpose: with the evidence lock, seeded verified work could not be removed from the live database; build a demo project through the app or use a separate demo Supabase project.

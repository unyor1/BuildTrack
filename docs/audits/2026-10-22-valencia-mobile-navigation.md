# Valencia mobile navigation and portfolio cleanup — 2026-10-22

## Requested changes

Remove the source-website ongoing-status lines and the portfolio-source/date note shown in the screenshot. Replace `/valencia`'s mobile link strip with hamburger/sidebar navigation and push to both configured GitHub repositories.

## Implementation

- Removed status disclosures from portfolio cards, the source/date footnote under the grid and the repeated gallery status/date text. Original source information remains in `valenciaContent.ts` and prior audits. Perspective-versus-site-photo captions remain accurate and visible in the gallery.
- `Header` accepts an optional `mobileMenu` slot; only Valencia supplies it. The existing desktop links, landing authentication controls and branding-only attendance header are unchanged.
- `ValenciaMobileNavigation.tsx` shows a labelled 44px hamburger at the same <=1100px breakpoint at which desktop links disappear. The old horizontal mobile strip and its styles are removed.
- The menu reuses the existing `Modal` with an opt-in right-side placement: full viewport height, bounded 88vw/24rem width, scrollable content, backdrop, labelled dialog, focus trap, Escape, close button and page scroll lock. Centered/fullscreen dialogs retain their existing defaults. Focus restoration for drawers uses `preventScroll` so navigation does not jump back to the header.
- Includes all company sections and the BuildTrack landing link. Ordinary clicks use the existing SPA/fragment handler and close the menu; modified/new-tab clicks remain native. Resizing to desktop closes it and listeners are removed on close/unmount.
- Sites guidance was applied within the existing app checkout. No separate Site, backend changes, database writes or permission changes were introduced.

## Verification

- Targeted Valencia, public-navigation and photo-editor/shared-dialog regression tests passed. Coverage includes menu mounting/closed state, ARIA controls, every navigation destination, close callbacks, modified clicks, desktop resizing and listener cleanup; actual dialog placement, focus wrapping, Escape/backdrop, scroll lock and no-scroll focus restoration; source-note removal and retained perspective labels.
- The complete `pnpm check` suite passed: TypeScript, all helper/component suites, 425 in-memory SQL regression cases and the production build. `git diff --check` passed. Push/deployment results are reported at handoff once complete.
- Browser inventory returned no available browsers/apps. Component tests, CSS checks and build verification do not establish browser visual QA.
- Preserve unrelated `supabase/.temp/cli-latest` and untracked `package-lock.json`; neither belongs in this commit.

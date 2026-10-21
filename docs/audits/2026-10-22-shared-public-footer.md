# Shared public footer — 2026-10-22

## Request and implementation

Use the BuildTrack landing-page footer on `/valencia`, retain white/light-gray text rather than yellow, remove the Stay connected/original-company-site promotion, and push the change to both configured GitHub repositories.

- Extracted the existing landing footer into `src/components/PublicFooter.tsx`. Both pages now render this component, retaining its branding, description, social row, Navigation, Platform Services, Contact Us, phone/email/address and bottom row.
- Valencia opts into a neutral-text modifier: brand name, section headings and navigation hover text are white. The description/contact text remains gray, and the original landing-page palette is unchanged. The logo image is unchanged.
- Links to About, Services and Contact target the page they are displayed on. Platform Features targets `/buildtrack#features`. Public links retain the shared SPA navigation handler, hash scrolling and normal modified-click behavior.
- Removed the previous Valencia footer, its Stay connected block and its obsolete responsive styles. The shared footer retains the landing page's existing responsive column layout.
- The Sites guidance was applied in the existing local checkout; no additional Site, hosting account, database access or permission changes were introduced.

## Verification

- Targeted Valencia/component and public-navigation tests passed, including both page mounts, shared-footer structure, neutral text modifier, removed promotion, contact links, route-aware section destinations, actual SPA click handlers and modified clicks.
- The complete `pnpm check` suite passed (TypeScript, helper/component tests, in-memory SQL regressions and production build). `git diff --check` passed. Git push/deployment status is reported at handoff after completion.
- Browser inventory returned no available browsers or apps. Component/source checks and production compilation are not a browser visual verification.
- Existing `supabase/.temp/cli-latest` and untracked `package-lock.json` changes are unrelated and excluded from this task.

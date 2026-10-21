# Deployed public navigation — 2026-10-22

## Reproduction and cause

User reported 404 errors from the public header on the deployed Vercel site. Read-only HTTP checks against `https://valencia-buildtrack.vercel.app` confirmed:

| Path | Before fix |
| --- | --- |
| `/` | 200 HTML |
| `/valencia` | 404 |
| `/buildtrack` | 404 |
| `/login` | 404 |
| `/manifest.webmanifest` | 200 manifest |

The application uses client-side `pushState` routing, while public headers used ordinary full-page anchors. Vercel had no SPA fallback for paths that do not correspond to generated files. This is why local Vite navigation worked while deployed links and direct visits failed.

## Fix

- Added the root `vercel.json` using [Vercel's documented Vite SPA rewrite](https://vercel.com/docs/frameworks/frontend/vite): `/(.*)` to `/index.html`. Direct route loads and refreshes can now reach the React router; existing authentication/authorization remains in RouteGuard. No permission or database changes.
- Public header anchors use `handlePublicNavigation` for ordinary same-origin, same-tab clicks between the two public pages and their sections. Mobile Valencia links and the landing page's Valencia links share it. External links, downloads, query-bearing links, private paths and Ctrl/Command/Shift/Alt/middle-click behavior retain normal browser handling.
- `App.navigate` optionally retains a section hash and announces the hash change without reloading the document.
- Both public pages call `usePublicHashScroll` after mounting, so a section requested before lazy loading finishes is scrolled once its DOM exists. Hash changes and Back/Forward also work, and listeners are removed on unmount.
- Added a public-page anchor offset so the sticky header does not cover section headings.

The Sites skill guided an in-place fix within the existing app; no separate Site or hosting account was created. The requested Git pushes may trigger the existing Vercel integration. Do not claim deployment success based solely on a successful build or Git push: confirm the public HTTP responses separately.

## Regression coverage

`pnpm test:public-navigation` exercises actual Header handlers, cross/same-page anchors, preserving native/modified/external clicks, lazy-mounted section scrolling, Back/Forward, invalid/missing fragments, hook cleanup, sticky offset and the Vercel fallback configuration. It is included in `pnpm check`.

Existing Valencia component tests also exercise hash-preserving App navigation, the opening redirect, original landing page, portrait, public/private routes and unchanged attendance branding. Targeted navigation, Valencia and attendance tests, TypeScript, and the complete `pnpm check` suite (including the production build) passed. The staged diff passed whitespace and secret checks. Public deployment verification will be reported separately after the Git pushes. Browser visual automation was unavailable in this session; HTTP/component checks are not visual verification.

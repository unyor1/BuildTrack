# Valencia hero overlay refinement — 2026-10-22

The user requested the supplied transparent logo over the supplied enhanced interior photograph, like the small reference composition, while retaining the existing hero's headline, colors, actions and overall layout.

- Reused `logo-transparent.png` and `interior-enhanced.png`; no source images were edited, regenerated or overwritten.
- Removed the decorative red/magenta less-than chevron from the JSX and all responsive CSS rules.
- Removed the logo container's pale background, rounded card, padding, box shadow and backdrop blur. The existing alpha-enabled logo now renders directly over the photograph.
- Latest placement follows the user's yellow-circled screenshot: desktop logo center at 68% across / 58% down, directly over the right-center photo area. The tablet offset keeps the logo clear of the headline; mobile retains the top-center position above the copy without a backing card. This supersedes the intermediate whole-hero/top-center placement described in the earlier follow-up below.
- Kept the image crop, left readability gradient, headline, copy, buttons, public header and all other page sections unchanged.

The Sites skill guided an in-place, scoped presentation/layout update. No separate Site or hosting change was created. There were no database, permissions or standalone-attendance changes, and no commit/push was requested in this turn.

Verification: `pnpm test:valencia`, `pnpm exec tsc --noEmit`, production build and `git diff --check` passed. Added regression assertions for the exact existing hero assets, retained headline, absence of the decoration, no backing-card CSS at any breakpoint and responsive logo positioning. Browser inventory returned no available apps/browsers, so no visual browser verification was possible. Unrelated concurrent documentation changes were preserved.

Follow-up request: centered the logo across the entire hero rather than only the right-hand photo area. Added `showAuthActions` to the shared Header (default true), disabled only on the company page to remove Log in/Register without changing its section navigation or the main landing page. Component tests cover both header modes and unchanged branding-only attendance mode. Follow-up `pnpm test:valencia`, `pnpm test:attendance`, TypeScript, production build and whitespace checks passed. The earlier visual-browser availability limitation remains.

Screenshot placement follow-up: moved the logo down and right to the marked area, without changing the headline, image, controls or header. Updated regression assertions for the marked desktop point, tablet spacing and the mobile vertical-translation reset. `pnpm test:valencia`, production build and whitespace checks passed. No visual browser verification was available.

Size follow-up: increased desktop logo width from `clamp(240px,24vw,380px)` to `clamp(320px,34vw,540px)` without changing its marked center. Tablet/mobile sizes also increase within viewport-safe bounds, and mobile copy gains top spacing so it cannot collide with the logo. Existing transparent asset, hero copy and header behavior remain unchanged. Targeted size/spacing tests (`pnpm test:valencia`), production build and whitespace checks passed. No visual browser verification was available.

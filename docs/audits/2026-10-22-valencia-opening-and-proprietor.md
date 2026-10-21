# Valencia opening page, BuildTrack navigation and proprietor — 2026-10-22

## Requested behavior

- Opening the application shows `/valencia` first.
- The company header includes a BuildTrack link to the separate existing landing page.
- Add the supplied proprietor portrait and push the verified changes to both configured repositories.

## Implementation

- `pageFromPath` replaces `/` with `/valencia`, preserving query/hash information and avoiding a root-page Back loop. Old explicit landing-section links (`/#about`, `/#services`, `/#features`, `/#contact`) are redirected to the corresponding `/buildtrack` section rather than becoming broken anchors.
- The original LandingPage remains available at `/buildtrack` (and `/buildtrack/`). Existing internal `navigate("home")` calls now use this path. No login, registration, workspace, attendance, pin or project deep-link route was removed or made public.
- Company desktop/mobile navigation uses `companyHeaderNavigation`: BuildTrack plus the existing section anchors. Footer section navigation remains local to Valencia. The company brand button explicitly targets Valencia; shared Header defaults and branding-only attendance behavior remain unchanged.
- BuildTrack's shared header section links now use `/buildtrack#...` rather than the newly redirected root.
- Replaced the RV initials in About with the actual proprietor photograph and accessible name. The original portrait is framed responsively next to the existing proprietor name; no face generation, identity edits or background removal was performed.

## Portrait source

The supplied portrait matches the original company image. Saved locally at:

`src/assets/valencia/introduction/proprietor-roxan-valencia.png`

[Original public company portrait](https://custom-images.strikinglycdn.com/res/hrscywv4p/image/upload/c_limit,h_1200,w_1000,f_png/24083084/918321_732330.png) — 422×643 PNG. Downloaded, visually inspected and used unchanged; CSS handles the displayed crop.

The Sites skill guided a scoped public navigation/presentation change within the existing local application. No separate hosting project was created, and there are no new database writes, policies or email services.

## Verification

`test:valencia` covers the real public routing component (root replacement, query preservation, trailing-slash paths, old section bookmarks, landing rendering, forward navigation and existing protected/deep-link routes), actual header modes and company/mobile links, and the real local portrait asset and accessible About image. Existing slideshow, contact form and hero checks remain in place.

Full `pnpm check` passed: TypeScript, every component/helper suite including routing/header/portrait coverage, SQL regressions and production build. The final targeted `pnpm test:valencia` run and whitespace checks also passed. Visual browser verification remains unavailable in this session. The requested push confirmation is reported in the user handoff; local cache files and the extra package lock are excluded.

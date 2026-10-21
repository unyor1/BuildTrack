# Valencia introduction page — 2026-10-21

## Scope and route

Added a separate public `/valencia` route, including direct `/valencia/` loading. The existing BuildTrack landing page remains intact and links to the company page from the header, About section and footer.

The new page reuses `Header`, `Brand`, the existing public palette, button conventions and shared accessible `Modal`. Company CSS is scoped to the page/gallery. Mobile section navigation, reduced-motion support, keyboard focus styles, a skip link and a manual project gallery are included.

The company route is rendered explicitly as public static content before the existing workspace RouteGuard. It imports no private data hooks or Supabase client. All existing workspace routes retain the unchanged guard; no database/RLS/storage/auth policy was modified.

## Public company sources

Read the public HTML and embedded page data on October 21, 2026:

- [Home](https://valenciaconstructionservices.mystrikingly.com/): company identity/tagline, sales offices, fit-outs, project development process and recent work.
- [About](https://valenciaconstructionservices.mystrikingly.com/1): workmanship, materials, standards, client relationships, safety, scheduling/budget commitment, Roxan D. Valencia as proprietor and skilled tradespeople.
- [Services](https://valenciaconstructionservices.mystrikingly.com/2): civil works, architectural works and equipped/safety-conscious workforce.
- [Projects](https://valenciaconstructionservices.mystrikingly.com/3): Southlinks, Ticzon Residence, Biocare Centuria and HLM Pharmaceutical. The latter two are labelled as source-listed ongoing projects, not real-time statuses. Ticzon's architectural perspective is explicitly distinguished from its construction photograph.
- [Contact](https://valenciaconstructionservices.mystrikingly.com/4): Taytay address, Monday–Saturday 8 AM–5 PM, 09971270773 / 09104292842 and valenciaconstruction2019@gmail.com.

Company copy is reorganized/paraphrased; no source scripts, tracking, Strikingly badges, cookie implementation, generic map pin or invented social accounts were imported. Contact navigation uses real telephone/email links and a Google Maps address search. The source's Facebook target was only a generic Facebook homepage, so the page links to the original company site rather than claiming an unverified social profile.

The form prepares an encoded email in the visitor's email app. It does not save an inquiry to BuildTrack, send email server-side or display a false submission success. A direct email link is available as fallback.

## Assets and image-editing skill

Project-bound assets are saved under `src/assets/valencia/introduction/`. Original downloads come from the source site's public `custom-images.strikinglycdn.com` image store under `24083084/`:

| File | Original storage key |
| --- | --- |
| interior-source.jpg | 966546_285331.jpg |
| logo-original.png | 138743_926907.png |
| ticzon-perspective.jpg | 848343_477186.jpeg |
| ticzon-residence.jpg | 812657_933511.jpeg |
| southlinks-office.jpg | 859220_710410.jpg |
| southlinks-side.jpg | 191728_634783.jpeg (the supplied exterior reference angle) |
| biocare-centuria.jpg | 702690_462471.png |
| hlm-pharmaceutical.jpg | 516582_671595.png |
| process-review.jpg | 377910_891504.jpg |
| process-briefing.jpg | 321066_1888.png |
| process-team.jpg | 236326_836863.png |
| process-execution.jpg | 943758_504157.png |

Used built-in image generation in edit mode, not the API/CLI fallback, to produce:

- `logo-transparent.png`: 1470×1070 PNG with real alpha (sampled corner alpha 0). Original retained.
- `interior-enhanced.png`: 1448×1086 presentation image. Original retained; gallery caption identifies the enhanced photograph.

Final logo prompt:

> Use case: background-extraction. Edit target: the attached local Valencia Construction Services logo. Produce a clean, high-resolution transparent PNG of this exact existing logo for its company introduction page. Remove all background and stray speckle noise, improve edge clarity and legibility. Preserve the complete magenta skyline, cranes, golden sunrise, olive green V and black lettering, their layout and proportions. Exact lettering must remain 'VALENCIA' and 'Construction Services'. Keep original brand identity; no redesign, added symbols, shadows, white background, or checkerboard painted into the image. Tight composition with modest transparent padding. Genuine alpha transparency.

Final hero prompt:

> Use case: lighting-weather. Edit target: this exact Valencia/Southlinks interior photograph. Asset type: company website hero photograph. Enhance the existing photo only: correct the yellow/dark color cast, subtly lift shadows, balance bright windows and indoor lighting, improve natural architectural detail and clarity. Keep every architectural element, window, pendant lamp, plant, furniture placement, people, proportions, camera viewpoint and framing unchanged. Preserve authentic photographic materials and realism. Do not add or remove anything, do not redesign the interior, no text, logo or graphic overlays, no new watermark. Landscape high-resolution output, retain the complete original 4:3 composition; layout cropping will be handled in CSS.

The Sites skill guided a complete presentation sequence and factual, source-grounded content rather than fabricated company statistics. This is an in-place local application change; no separate hosted Site or publication was created.

## Verification

- `pnpm test:valencia`: actual component controls for source sections, filters, project opening/closing, manual/wrapping slides, keyboard navigation, single-photo controls, rendering labels, dated statuses, real contact links, encoded email preparation and truthful status, metadata cleanup, public route matching and unchanged private-route guarding. Also checks local asset existence, RGBA logo format, responsive/reduced-motion/focus styles and branding-only header behavior.
- TypeScript passed before the full regression run.
- Existing local Vite server returned HTTP 200 for `/valencia` and the new page module.
- `git diff --check` passed (existing LF-to-CRLF warnings only).
- Browser inventory returned no apps/browsers. No visual browser screenshot/responsive rendering test could be performed; HTTP and component tests are not claimed as visual verification.
- Standalone attendance page, board and data-helper hashes remain unchanged. Existing photo-editor worktree changes were preserved, not reset or overwritten.

Full `pnpm check` passed: TypeScript, all component/helper tests including the new company page, SQL regression suite and production build. No database migration/deployment, commit, push or external inquiry submission was performed for this page.

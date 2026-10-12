# 2026-10-11: Field mode (installable app, offline queue, QR labels, phone layout)

No migration. Biometric attendance and voice notes are intentionally not part of this.

## What people get
| Feature | Behaviour |
|---|---|
| **Installable app** | Manifest, icons made from the company logo, theme colour, shortcuts (My work, Daily report). A small pill offers "Install" where the browser allows it. A service worker keeps the app itself (page shell and built files) available when the signal drops; it never stores project data. When a new version is deployed the pill says "A new version is ready" with a Reload button (nothing reloads under the user's hands). |
| **Offline queue** | With no signal, a foreman's progress report (start / send for review with note), a daily report (draft or submit) and pin photos are saved on the device (IndexedDB) and sent in order when the connection returns (automatically, or "Send now"). Only a lost connection is retried (back-off 15 s up to 10 min, 8 tries); a refusal from the server (permission, "already submitted") marks the item as failed with the reason, and the person can retry or discard it. Items belong to the signed-in person. The dashboard shows a queued report straight away with a "Waiting to send" label. |
| **Status pill** | Appears only when something needs attention: offline, N waiting, N failed, update ready, install. "Details" lists the saved items. |
| **QR labels** | Engineers (and foremen) can print a QR label for any pin (pin bar > QR). Scanning opens `/pin?project=&pin=`, which sends each role to its own screen: Engineer to the plan with the pin selected, Foreman to the report dialog for that pin, Client to the plan, Admin to the project overview. A signed-out visitor signs in first and is taken to the pin afterwards. The code carries only a link. |
| **Phone layout** | Foremen get a bottom bar (My work, Report, Photos, Fixes, More) under the thumb, two-column summary cards, bottom-sheet dialogs (existing) and safe-area spacing. |

## Engineering
- `lib/offlineModel.ts` (pure, `pnpm test:lib`): what counts as a network problem, retry verdicts, send order, back-off. `lib/offlineQueue.ts`: IndexedDB store, single flush at a time, order kept even while an item waits.
- `lib/qr.ts` wraps the small `qrcode-generator` package (added dependency, MIT, no sub-dependencies) and builds one-path SVG; tests check the size, the three finder squares, the dark module, determinism and the link.
- `lib/pwa.ts`, `public/sw.js`, `components/AppStatus.tsx`, `scripts/make-pwa-icons.mjs` (dependency-free PNG decode / scale / encode of the logo).
- Route `/pin` + `RouteGuard` return-to-after-login.

## Verification
`pnpm test:lib` 46/46, `pnpm test:sql` 189/189, `npx tsc --noEmit`, `pnpm build`. Browser pass with the temporary mock backend (removed afterwards): offline report saved with the connection switched off, shown as "Waiting to send", sent automatically when the connection returned (server status changed, pill cleared); `/pin` link as Foreman (opens that pin's report dialog) and as Engineer (plan with the pin selected, URL cleaned); QR modal rendered; phone width: bottom nav, no sideways scroll, bottom-sheet report dialog; console clean.

## Not verified / limits
- The service worker could not be registered in the embedded browser used for testing (it blocks service workers); its code was syntax-checked and follows the standard pattern, but installing the app and the offline page shell must be tried once on a real phone (Chrome: open the site, use "Install app"; Safari: Share > Add to Home Screen).
- Photos queued offline are compressed before saving; very many large photos can fill the browser's storage quota (the pill would then show failed items).
- Plan sheets and project data are not available offline (only saved work is); the app shell opens offline, but it needs a connection to load data.
- Voice notes, background sync while the app is closed, and biometric attendance are not built.

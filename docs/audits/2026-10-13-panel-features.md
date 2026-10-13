# 2026-10-13: Panel features (evidence lock, live updates, S-curve, before/after, load test)

The five "worth adding" items from `docs/BUILDTRACK_PANEL_FEATURES.md`, built so each one feeds the others.

## What was built and how it connects
| Feature | Database | App | Connected to |
|---|---|---|---|
| Evidence lock | 0033, 0035, 0037 | `usePinEvidence`, `PinPhotos` lock note, sheet-delete pre-check | Verification queue (submitting locks the evidence), pin timeline and sheet history (removals logged), before/after (the compared photos can no longer disappear), client portal (verified work keeps its proof) |
| Live updates | 0034 | `lib/realtime.ts` in the data hooks | Foreman report -> engineer queue and badges; engineer verification -> foreman dashboard, client progress and S-curve; failed inspection -> NCR for the foreman; notifications bell |
| S-curve | none (uses `pins.due_date`, `verified_at`) | `SCurveChart`, pure `sCurve` (tested) | The same pins as the queue and dashboards; updates live; tells engineers which pins still lack a due date |
| Before / after | none | `BeforeAfter` | Pin photos (first vs latest) in the queue and pin details; NCRs (photo at the failed inspection vs latest fix photo) |
| Complete lists + load test | 0036 (same rules, faster), indexes | `fetchAll` (tested) in every list hook; `pnpm test:load` | Every count, register, badge, chart and dashboard now reads all rows instead of stopping at 1,000 |

## Behaviour changes to know
- A pin that was ever sent for review or verified can no longer be deleted (also not through its sheet or project), and its photos stay. To correct a mistake, change its status or upload a new sheet revision.
- Admins with `blueprints.manage` lose the ability to delete verified pins (they had it before).
- Lists that used to stop at 120 / 200 / 300 / 500 / 1,000 rows now show everything; the pin photo gallery still shows the newest 200 by design.

## Load test (`pnpm test:load`, in-memory Postgres on the dev machine; network time to Supabase comes on top)
50 sheets, 5,000 pins, 9,000 timeline entries, 300 inspections, 500 NCRs, seeded through the real triggers.

| Query | Before | After |
|---|---|---|
| All pins of the project (paged) | 10,484 ms | 409 ms |
| Same, as the client | 10,438 ms | 415 ms |
| Sidebar badges | 1,632 ms | 5 ms |
| Verification queue (1,000 waiting) | 1,618 ms | 68 ms |
| NCR register (500) | 267 ms | 39 ms |
| QA summary | 9 ms | 10 ms |
| S-curve maths in the browser | 181 ms | 9 ms |

Two causes found and fixed: per-row security function calls (0036) and a date formatter created per pin (`manilaToday` now reuses one).

## Checks
- SQL tests 268/268 (new: `99-evidence-lock`, `99-rls-parity`; `30-pins` and `80-editor-v2` updated to the new evidence rule), lib tests 63/63 (new: S-curve, paging), type-check clean, build OK.
- Live: triggers and policies present; realtime delivery and isolation tested with throwaway accounts (deleted); RLS parity over all real accounts (45 comparisons, 0 differences); security advisors show no new kind of finding.
- Browser (temporary harness, deleted): every route of all roles at 1,024 px, client overview at 375 px, no errors; S-curve hover and keyboard, table view; before/after slider; evidence lock note; dark-mode chart colours.

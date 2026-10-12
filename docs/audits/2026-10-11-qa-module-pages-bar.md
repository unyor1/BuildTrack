# 2026-10-11: QA / QC module (inspections, NCR, evidence) and the bottom pages bar

Database: migrations 0025 and 0026 (`sql/0025_qa_module.md`, `sql/0026_qa_measure_requires_value.md`). Front end: `src/components/qa/*`, `src/lib/{qa,qaModel,qaPrint,qaWorkspace}.ts`, `src/components/editor/SheetFilmstrip.tsx`.

## 1. Pages bar under the sheet (Canva-style)
- New View options: "Sheets strip (left)" and "Pages bar (bottom)". They are independent, so the left strip, the bottom bar, both, or neither can be shown (`prefs.filmstrip`, default off, remembered per browser).
- The bar shows one thumbnail per sheet with its number and issue count, an "Add page" tile, a hide button, and left / right arrow keys to move between pages; the current page scrolls into view. Also a header toggle button and a Ctrl+K entry ("pages bar"). Hidden in Focus and Presentation mode.
- Verified in the browser (mock backend): both bars at once, selecting a page from the bar updates the left strip, arrow keys, hide, the preference is stored.

## 2. QA module: what it is and why it is built this way
Practice followed: Inspection and Test Plan checklists, Requests for Inspection (IR), hold points, measured tolerances, Non-Conformance Reports (NCR) with root cause, corrective and preventive action (CAPA), engineer verification, re-inspection, evidence photos, a numbered and unalterable record. This is how a Philippine contractor documents QA/QC against NSCP, PD 1096 and its project specification.

| Topic | Decision |
|---|---|
| Who | QA is an Engineer duty (no new role). Foreman requests inspections and fixes NCRs. Client sees plain-language numbers only. Admin (Super Admin + MFA) owns the company checklist library. |
| Checklists | 10 built-in lists (pre-pour, reinforcing steel receiving, footing excavation, CHB masonry, electrical rough-in, plumbing, fire protection, waterproofing, finishes, site safety walk), 80 items, classed critical / major / minor, with hold points, required photos and measured tolerances. Engineers copy a list to their project and edit it. Built-ins are read-only. |
| Standards | Cited by name only (NSCP 2015, PD 1096, PEC 2017, RA 1378, RA 9514, DOLE D.O. 13, RA 11058, BP 344, PNS 49, ASTM C143 / C31 / C39). **No clause numbers are pre-filled**: they would be guesses. The engineer types the exact clause from the project's specification. |
| Scoring | Weighted share of passed items (N/A excluded), weights and pass mark from Admin > System settings (default 5 / 3 / 1 and 90 %). Passed = no fail. Conditional = at or above the pass mark with no critical and no hold-point fail. Failed = anything else. Snapshotted on completion. |
| Integrity | The checklist is copied into each inspection; results freeze at sign-off; every function re-checks the caller's role; the defect trail is written only by the database. A measurement outside tolerance fails by itself; a measured item cannot be judged without its value (0026); a fail or N/A needs a reason; required photos block sign-off. |
| Defects | Each failed item raises an NCR for the foreman, due in 3 / 7 / 14 days by class (critical / major / minor). The foreman records root cause, corrective and preventive action and (major and critical) a photo of the corrected work; only the engineer closes it, or sends it back with a note. Daily due-soon and overdue notifications. |
| Evidence | Private bucket `qa-evidence`, staff of the project only, JPEG / PNG / WebP up to 8 MB, shrunk in the browser first; cannot be removed once the inspection is signed or the NCR closed. |
| Reports | Printable inspection report, NCR report and project QA summary (hidden frame + print dialog, every value escaped), CSV export of inspections and the NCR register. The project backup now includes the QA tables and photos. |

## 3. Screens
- Engineer `QA / QC` (new sidebar item): Overview (first-time pass rate, waiting inspections, open / overdue NCRs, days to close, defects per 100 checks, needs-attention list, quality by trade), Inspections (filters, request, runner), NCR register (filters, raise, edit, verify), Checklists (view, copy, edit, archive).
- Foreman: `Inspection Requests`, `Inspection Checklists`, `Defects (NCR)` replace the three sample screens (their "sample data" banner is gone).
- Admin: `QA Checklists` (library; edit only for Super Admin).
- Client overview: "Quality checks" cards in plain words (first-time pass, problems being fixed, problems fixed and checked).
- Notifications `qa.requested`, `qa.result`, `qa.defect`, `qa.defect_verify`, `qa.defect_closed`, `qa.defect_rejected`, `qa.defect_due`, `qa.defect_overdue`; deep links `?inspection=<id>` and `?defect=<id>` open the item.

## Verification
- `pnpm test:sql` 213/213 (new `99-qa-inspections.cases.mjs`: 19 cases covering RLS per role, scoring, hold points, tolerance rules, required photos, snapshot immutability, numbering, defect workflow, trail, reminders, summary, disabled accounts).
- `pnpm test:lib` 53/53 (new: QA score, result rules, tolerance verdict, due state and numbering, checklist editor validation).
- `npx tsc --noEmit` clean, `pnpm build` ok.
- Live database: migrations applied through the BUILDTRACK_MIGRATIONS connector after the project URL check; seeded counts read back; a rolled-back run as the real foreman then the real engineer; function grants (authenticated only); `get_advisors` reviewed (only the known pattern of intended RPCs and leaked-password protection, which is the owner's setting).
- Browser (temporary mock backend, removed afterwards, `.env.local` untouched): engineer ran a full inspection with the real UI (out-of-tolerance measurement fails by itself, missing value / missing reason / missing photo each refused, sign-off with confirmation, NCR raised), foreman requested an inspection, started an NCR, was refused for a missing photo, then sent it for verification, engineer sent it back and later closed it; checklist editor (validation, add item, save); admin library page; client quality cards; layouts at phone width; printable HTML generated and escaped.

## Limits and honest notes
- The mock backend re-implements the rules in JavaScript to drive the screens; the authoritative checks are the SQL ones (tested in PGlite and read back live). A final pass on the real Supabase project with real accounts is still advisable.
- The photo upload step was exercised with a generated image against the mock storage; the live bucket policies were tested in SQL only.
- Clause numbers and the 90 % pass mark are placeholders for the project's own specification and the expert reviewer to confirm.
- Not built: QA numbers on the Admin project health page, a QA step inside the pin verification queue, a "QA inspector" flag on project members, camera scanning (see `docs/BUILDTRACK_QA_BASIS.md` section 6).

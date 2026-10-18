# Work item QA workspace, correction package and menus — 2026-10-18

## Flow review (before)

Traced in code and on the live LAUNDRY records (FLOOR: IR-0001 failed → NCR-0001/0002, IR-0002 passed; WALL: IR-0003 open).

- **Two correction paths for one failure.** A failed criterion raises an NCR on the inspection, not on the work item. The Foreman opened a resubmission draft on the item (remarks + new pin photos) and, separately, every NCR (corrective action + other photos in `qa-evidence`). Nothing linked the two.
- **Pin-wide NCR gate.** `review_checklist_item` refused acceptance while any NCR on the pin was open. FLOOR passed IR-0002 but could not be accepted until NCR-0001/0002 were closed on another screen; an NCR on WALL would also have blocked FLOOR.
- **Possible dead end.** Completion was only re-checked on item acceptance. If an NCR or stage inspection was the last blocker, clearing it left the work In progress and out of every queue.
- **Overlapping screens.** Foreman `issues` and `corrective-action` both embedded the NCR list. Requests started from the checklist row, the panel under it, Inspection Requests and the checklist library. The inspection detail embedded the whole request history (same snapshots as the request-history dialog) with a second timeline.
- **No single "who acts next".** State was spread over `pins.status`, `pin_checklist_items.review_status`, open inspections and NCR statuses.

## Target flow (implemented)

The checklist item is the record ("LAUNDRY → FLOOR"); requests and resubmissions are attempts under it, linked by the item's permanent id.

1. Foreman: photos → **Ready** → submit (first request).
2. Engineer: inspect against the approved **inspection criteria** → **Passed** or failed (NCRs raised).
3. Failed: the Foreman opens the item, records the correction once (remarks + new photos), ticks the NCRs it answers and submits **one correction package**. Atomically: linked re-inspection + chosen NCRs For verification with the same remarks/photos.
4. Engineer, in the same record: inspect, then close or send back each NCR (send-back returns the item to the correction form), then **Accept** the item. NCR closure is always an explicit Engineer decision.
5. **Completed** = every item accepted and every NCR / inspection on the work clear; re-checked automatically on the last acceptance, NCR closure or passed stage inspection.

Every item shows its stage, responsible person, blocker and one next action (`workItemStage`, e.g. "Inspection passed. 2 NCRs still need closure. Next action: Foreman submits corrective action for NCR-0001, NCR-0002.").

## Changes

Database (`20261018153632_work_item_correction_package.sql`, details in [sql doc](sql/20261018153632_work_item_correction_package.md)): `qa_defects.correction_attempt_id`, `submit_correction_package`, item-scoped acceptance, send-back routing, `try_complete_work`.

UI:
- `components/qa/WorkItemWorkspace.tsx`: next-action card, Ready → Passed → Accepted → Completed rail, tabs Inspection / Corrections & NCRs / Evidence / Attempts & history. One primary action per stage and role. Engineer guided review (inspect → decide NCRs inline → accept/return). Opened from the plan (checklist rows) and from any QA page via `?item=`.
- `components/qa/CorrectionForm.tsx`: the one correction form (optionally including other prepared items of the same work, since only one request per work can be open).
- `components/qa/WorkItemBoard.tsx`, `WorkItemParts.tsx`; data `lib/workItem.ts`; pure rules `lib/workItemModel.ts` (tested).
- Plan checklist rows are compact (ready tick, upload, stage, next action, Open). The panel below keeps criteria approval and "submit all ready items" for first requests only.
- Inspection detail shows only its own request's evidence, labels **Work item QA** vs **Stage / hold point**, and links to the work item. The request-history dialog no longer has its own timeline (one connected inspection + NCR history in the workspace).
- NCR detail: a work-item NCR sends the Foreman to the correction form instead of a second CAPA form, and shows the package photos.
- Inspections list: type filter/column; "Request stage / hold-point inspection". Checklists are reference/configuration only (no request buttons).

Menus:
- Foreman: My Work · QA Requests · Corrections · Checklist Reference. `corrective-action` merged into `issues` (old URL redirects); mobile tabs Dashboard, My Work, QA Requests, Corrections.
- Engineer: Review Inbox (`verification`) · QA Register (`qa`: overview, inspections, NCR register, client reports) · Checklist Configuration (new `checklists`; old `qa?tab=checklists` redirects).

Removed: `pages/Foreman/ForemanCorrectiveAction.tsx`, `components/qa/ChecklistItemReview.tsx`, helpers `qaSubmitProblem`, `itemVerificationProblem`, `inspectionWorkPath`.

Load test fixture: seeded inspections only on pins that are not For review / Completed (the one-open-request rule from `20261018142455` made the fixture fail before this change); added work-item board timings.

## Verification

- TypeScript, 98 library tests (stage wording for every stage, linked NCRs by id after rename, pin busy rule, acceptance gate, connected history), comparison rendering test, 358 SQL tests, production build: passed.
- `pnpm test:load` (5,000 pins, 300 IR, 500 NCR, 2,000 work items): work items of the project 34 ms (paged, RLS on).
- Live: migration applied via connector; bodies hash-match; privileges checked; LAUNDRY unchanged; rollback-only smoke `sql/20261018-correction-package-smoke.sql` passed (FLOOR and WALL through failure, package, gate, send-back, completion) and left nothing behind. Security advisors: same three categories; one new intended authenticated RPC.
- Not done: no signed-in browser walkthrough (no browser session available in this run). The screens are type-checked and built, not visually verified.

## Rollback

UI: revert the files above. Database: forward migration as described in the sql doc; keep `correction_attempt_id` values.

# 20261018153632 — work item correction package

| | |
|---|---|
| File | `supabase/migrations/20261018153632_work_item_correction_package.sql` |
| Written / applied | 2026-10-18 / 2026-10-18 (Supabase connector, recorded version `20261018153632`) |
| Depends on | `20261018124654`, `20261018133531`, `20261018142455` (item review, correction drafts, one open request per work) |
| Status | Applied, verified |
| Reversible | Yes, by a forward migration (see Rollback). Never drop `correction_attempt_id` data: it is audit evidence. |
| SHA-256 | `05cc27b4d44512e97ba53d1bc8c77b90e9f84b645e80cb86fed0111aad6b4609` |

## Purpose

A failed work item (e.g. LAUNDRY → FLOOR) had two correction paths: a resubmission draft on the item, plus a separate corrective-action form and photos for every NCR. Acceptance was blocked by any open NCR on the whole pin. This migration makes the work item the record: one correction package answers the inspection and the NCRs together, item acceptance waits only for that item's NCRs, and completion is re-checked whenever the last blocker clears.

## Objects created or changed

| Object | Change |
|---|---|
| `qa_defects.correction_attempt_id` | New nullable FK to `qa_work_attempts`: the package whose remarks and photos answered the NCR. Partial index. |
| `item_defect_ids(item)` | New, internal. NCRs raised by any inspection whose submission contained the item (by item id; legacy snapshots by `done`). |
| `try_complete_work(pin)` | New, internal. Sets the pin to `verified` (Completed) only when the Engineer is the caller, the work uses item submissions and `pin_qa_verification_problem` is null. |
| `submit_correction_package(items[], defects[], root_cause, preventive, note)` | New RPC. Assigned active Foreman only. Each item needs an open correction draft; each chosen NCR must be linked to an included item, `open`/`in_progress`, assigned to the caller or nobody, and its item's remarks ≥ 10 characters. Calls `submit_checklist_qa` (same fresh-photo, remarks, pending and snapshot rules), then moves the NCRs to `for_verification` with the draft remarks as corrective action and links the draft. One `qa.defect_verify` notice per project Engineer when NCRs are included. |
| `review_checklist_item` | Acceptance now refuses only while an NCR linked to that item is open (was: any NCR on the pin). Uses `try_complete_work`. Foreman notification links open the work item (`?item=`). |
| `verify_defect` | Send-back returns the linked work items that are `for_review` (and the pin to In progress) when no inspection is open. Closing calls `try_complete_work`. |
| `finish_work_qa` (trigger) | A passed stage / hold-point inspection on a pin calls `try_complete_work`. Work-item handling unchanged. |

## Security and RLS

- No new table, no RLS change. `correction_attempt_id` is readable through the existing staff/project `qa_defects` policy; the table stays read-only to the API.
- `item_defect_ids` and `try_complete_work`: EXECUTE revoked from `public`, `anon`, `authenticated` (verified live: not executable).
- `submit_correction_package`: `authenticated` only (not `anon`); authorization is inside (`can_work_on_pin`, per-NCR assignment).
- NCR closure stays an explicit Engineer decision: nothing in this migration closes an NCR or records an inspection result.

## Verification

- `pnpm test:sql`: 358 passed, including `supabase/tests/99-zzzz-correction-package.cases.mjs` (refusals, linked-only NCRs, atomic package, item-scoped gate, send-back routing, completion on last blocker, outsider/anon).
- Live, read-only: the 6 function bodies hash-match the file; column present; privileges as above; LAUNDRY records unchanged.
- Live rollback-only smoke `20261018-correction-package-smoke.sql` ended in `SMOKE_OK` (aborts itself); afterwards 0 synthetic pins, sheets, templates, packaged NCRs or notices; IR/NCR counters unchanged.

```sql
select count(*) from public.qa_defects where correction_attempt_id is not null;           -- packages used so far
select has_function_privilege('authenticated','public.try_complete_work(uuid)','execute'); -- false
```

## Rollback

Forward migration only. To restore the previous rules, re-create `review_checklist_item` (pin-wide NCR check), `verify_defect` and `finish_work_qa` from `20261018124654` / `0025`, and `revoke execute on function public.submit_correction_package(...) from authenticated`. Keep the column and its values.

## Notes / known limits

- A batch request (several items in one inspection) links its NCRs to every item in it; the Foreman chooses which NCRs a package answers.
- An NCR sent back while a re-inspection is still open does not return the item; the inspection result decides, and the Engineer can return the item afterwards.
- The older separate NCR form (`update_defect`) still works for NCRs that belong to no work item (site findings, stage / hold-point inspections). The UI steers work-item NCRs to the package.

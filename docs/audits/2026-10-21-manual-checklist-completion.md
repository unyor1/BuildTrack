# Manual checklist completion — 2026-10-21

## Requested workflow

The Engineer keeps a manual **Complete checklist** button. The separate Accepted status is removed: the item progress rail is **Submitted → Passed → Completed**. Passing QA or closing NCRs alone does not complete the item.

## Implementation

- Renamed the work-item model's final stage to `completed` and its next action to `complete`. Engineer review inbox, Foreman QA filters, plan checklists, daily-report checklist state and explanatory text use the same wording.
- The workspace exposes Complete checklist for a submitted item with passed QA. Any linked NCR in `open`, `in_progress` or `for_verification` disables the button, with a visible explanation. Loading/error states also block it; confirmation is required before the write. NCR review remains available independently.
- `qaActions.completeItem` invokes the existing `review_checklist_item` RPC with `p_accept=true`. Existing `review_status='verified'` records display Completed; no stored enum or historical evidence/audit rows are rewritten. Return/reopen actions retain their existing checked RPC.
- A completed checklist is distinct from a completed work pin. The pin still completes only after every checklist is completed and all pin-level NCRs, inspections and hold points are clear. Unrelated checklist requests remain independent.

## Database/security verification

A read-only query of the deployed completion RPC confirmed its Engineer permission check, passed-QA gate, linked-NCR closure gate, immutable snapshot comparison and eligible-photo requirement. These guards already enforce the requested manual action server-side, so no migration, trigger, permission or production-data change was needed.

## Tests

- Pure model checks for manual completion eligibility, Completed labeling and next actions.
- Actual workspace interaction checks: no automatic write, Engineer-only button, all unresolved NCR statuses blocked, loading/errors blocked, cancelled confirmation, successful explicit completion, no completion for pending/failed/conditional QA or already completed records.
- Actual three-stage rail checks, including Passed remaining incomplete until manual completion.
- Existing SQL regressions retain server-side validation of NCR closure, project scope, inspection pass/snapshot integrity and independent checklist completion.

Full `pnpm check` passed: TypeScript, component/helper suites, 412 SQL cases and production build. The standalone attendance file hashes are unchanged. No visual browser test was performed for this change.

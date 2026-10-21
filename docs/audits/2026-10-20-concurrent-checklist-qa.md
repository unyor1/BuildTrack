# Independent checklist-item QA

| Field | Value |
|---|---|
| Migration | `20261020072554_concurrent_checklist_qa.sql` |
| Written / applied | 2026-10-20; Supabase connector, BuildTrack only |
| Dependency | Direct item QA and prior correction/acceptance migrations |
| Status | Applied, local tests and live authenticated rollback-only workflow verified |
| Reversal | New reviewed migration required; do not delete requests or restore the global unique index while multiple requests are open |

## Requested change

Supersedes the one-pending-request-per-work-pin rule. Engineers can add a new item with its criteria, or edit an unsubmitted item, while another item is pending. The assigned active Foreman can prepare evidence and submit different items independently on that pin. Pending or accepted items still cannot be submitted again or have their evidence rewritten.

## Database implementation

- `qa_inspections.work_item_ids` records the item scope for new item requests. No direct authenticated UPDATE grant. Existing inspection rows/snapshots are not rewritten.
- The old unique index now applies only to legacy/stage inspections with null item scope. The guard serializes new requests on their parent pin and rejects overlapping item IDs, including overlap with older submission snapshots. Already-active requests can start independently after another item is submitted.
- New `checklist_qa_submission_problem` is a checked, RLS-respecting SECURITY INVOKER preflight with authenticated-only execute. The private SECURITY INVOKER request helper is not executable by API roles. The checked submission RPC calls it internally.
- Engineer item creation no longer consults the pin-wide pending gate. Submitted item criteria remain immutable. Completed work must still be reopened before changing scope.
- Evidence guards lock only the submitted/accepted item and immutable snapshot photos. New items can receive photos/remarks while another item is being inspected. Unsubmitted photo removal is allowed only under existing ownership rules; Storage cannot delete a file while its metadata record remains.
- Correction drafts can be prepared, saved and submitted while unrelated items are pending. Old/new attempt holders and frozen inspection criteria remain distinct.
- Engineer acceptance checks the item's own inspection. Completion still waits for every item, all pending inspections, and all NCRs. A failure/cancellation does not reopen the overall pin while another review is active. Stage cancellation clears aggregate review status only when nothing else is pending.
- Legacy whole-pin and new stage request entrypoints retain their existing global preflight; item requests may run alongside an already-open stage inspection. No anonymous endpoints, RLS changes, token changes or attendance changes.

## UI

The Engineer's Add item & criteria action stays enabled during another item's pending inspection/acceptance. The Foreman's opened item uses item-scoped preflight and evidence controls, not the pin-wide blocker. QA and correction pages no longer show the obsolete waiting-for-another-item group. The original pending item's own controls stay locked.

## Verification

- Full check passed: TypeScript, 109 helper tests, comparison/issue/attendance/direct-QA/assignment component checks, 403 SQL tests and Vite build.
- New SQL cases cover adding/editing an unsubmitted item during review, two and three open item requests, rejected duplicates, item/photo immutability, wrong-Foreman/helper access, correction while another request is pending, independent acceptance, final completion gates, and overlap/cancellation with a stage request.
- Direct-QA interactions check that Add stays enabled with pending inspection/acceptance, the Foreman can prepare another item while the pin is For review, and submission calls item-scoped preflight.
- Live authenticated Engineer/Foreman smoke: FLOOR submitted, CEILING added during review, WALL submitted concurrently, same-item duplicate rejected, FLOOR inspected/accepted while WALL remains pending, cancellation preserves remaining item requirements. Entire transaction rolled back; zero smoke pins retained and no physical files uploaded.
- Existing history unchanged: 4 submissions, fingerprint `3b6ae7aa742fcd3100691c700ab342be`; 31 inspection criteria, fingerprint `6f7b4b4390394850635c6b7bf89239f5` before/after deployment.
- Live privilege checks: anonymous item preflight=false, authenticated preflight=true, private helper execute=false, direct request-scope UPDATE=false.
- Advisor counts unchanged: 4 internal no-policy INFO notices, 87 existing authenticated definer RPC warnings, 1 existing leaked-password-protection warning. [Existing advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

No Git commit/push or browser visual inspection performed. Local tests exercise overlapping requests; parent-row locks provide serialization at the database write boundary.

## Rollback considerations

Restore policy only through a new migration after resolving overlapping open requests normally. Keep `work_item_ids`, submitted photos/remarks, timelines and criteria snapshots. Restoring the old pin-wide unique index while multiple requests exist would fail; deleting history to make it fit is not an acceptable rollback.

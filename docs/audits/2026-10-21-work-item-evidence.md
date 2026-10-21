# Work item evidence and NCR visibility — 2026-10-21

## Cause and fix

After an item's first request, the Evidence tab previously rendered only a before/after comparison and a link-like message directing users to Attempts & history. One saved photo could not form a comparison, so no photo or remark appeared in Evidence.

`SubmittedEvidence` now displays the latest request's immutable photo and checklist snapshots inline. A request selector keeps original and resubmitted evidence separate, with request numbers, status, submitter and submission/remark timestamps. Matching uses permanent item IDs and the work pin, including explicit submitted item IDs for partial/legacy snapshots. The existing PhotoGrid provides image zoom/details, private signed URLs and Engineer site/time restrictions; submitted evidence has no delete/edit controls.

The before/after slider remains available for a distinct correction photo or a later request, but two photos from the same original request are not mislabeled as original versus corrected work. Draft correction photos remain separate from submitted snapshots. Attempts & history is unchanged.

Corrections & NCRs now distinguishes no linked NCR, open/closed NCR counts, and loading/error states. Closed NCRs remain accessible. `useWorkItem` surfaces failed work/NCR reads instead of silently presenting an empty defect list; acceptance remains blocked when QA data is unavailable.

## Verification

- Read-only cloud query for TST-002 / Kitchen / FLOOR confirmed IR-0004 is passed, with one saved photo, one saved remark and no linked NCR. No production data was inserted or changed.
- New `test-work-item-evidence` checks the single-photo regression, original/resubmission selection, immutable snapshot metadata, item/pin isolation, explicit item IDs, empty/loading/error states, closed NCR visibility and retained before/after/access guards.
- No migration, authentication, storage policy or database function change was required. Standalone attendance is untouched.
- No visual browser test was performed; verification uses component interactions, TypeScript, existing regression suites and production build.
- Full `pnpm check` passed, including the new evidence interactions, 412 SQL cases and production build.

# QA submission, correction history, and Engineer / Foreman links

Applied 2026-10-18 via Supabase connector to the linked BuildTrack project.
Migration: `supabase/migrations/20261018133531_qa_resubmission_attempts.sql`.

## Cause and changes

The existing failed work had no explicit QA-approval metadata even though its criteria had actually been inspected by an Engineer. Editing returned checklist evidence also cleared its last inspection link. Submission buttons therefore had blockers without a usable, separate correction form.

- Reuse previously inspected criteria for that same work and template, or require explicit Engineer approval. Do not fabricate inspection results or approvals.
- Preparing a resubmission opens a distinct draft for each checklist item. Save new correction remarks and upload fresh eligible photos; old-request photos cannot satisfy the new request. Submitted holders and snapshots cannot be overwritten through the API.
- Keep original and successive request cards with inspection reference, outcome, submitter, remarks, photos, timestamps, and a per-request event timeline. Backfill only factual timestamps already stored for older inspections.
- Preserve returned-item inspection links. Repair missing links only when backed by an existing failed, conditional, or cancelled request snapshot.
- Keep single-pending-request enforcement, separate item verification, NCR closure requirements, and automatic step 4 Completed when all work is accepted.
- Correct Foreman / Engineer work links, repeated QA notification links, project-switch stale data, and modal state when opening a different record. Defect rows now open their full detail view with mouse or keyboard. Corrective Actions also shows the shared NCR workflow.
- Offline photo payloads carry their correction-holder ID; a replay cannot add evidence to an already-submitted holder.

## Using the flow

Initial work: add item photos, mark ready, then Submit item for QA (or submit all ready items).

Returned work: Prepare resubmission, add new photos and save correction remarks in the new holder, mark ready if needed, then Resubmit QA. Every repeated return starts another distinct holder. Open any earlier request to view its unchanged evidence and timeline.

Engineer: open the shared inspection, record/sign off results, resolve NCRs, then verify each accepted checklist item. Foreman correction evidence and Engineer review refer to the same inspection IDs and snapshots.

## Security and verification

New attempt/event tables have project-scoped staff SELECT RLS and no direct browser mutations. Assigned active Foremen can use checked draft/submission RPCs. Engineers retain inspection and acceptance authority. Internal trigger helpers are not API-executable; rejected evidence preview protections remain in place.

- TypeScript check and production build passed.
- 87 library tests and 346 SQL regression tests passed, including original / second / third requests, immutable evidence, fresh-photo requirements, pending locks, outsider RLS, and final acceptance.
- Live rollback-only smoke exercised initial failure, two separate corrections, third-request pass, NCR closure, per-item verification, timeline creation, and Completed state. All synthetic records were rolled back; zero test pins or correction drafts remained.
- The existing original submission snapshot hash was unchanged after deployment. Its eligible legacy criteria are recognized and its recorded returned-item link restored.
- Security advisors: only three expected additional authenticated, authorization-checked RPCs ([advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)); no new finding categories. Existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains.

Authenticated browser interaction was not available in this session; runtime coverage above is database/RPC regression and rollback smoke, not a claim of a signed-in visual walkthrough.

Rollback: retain attempt/event data for audit. Use a new forward migration for any correction; do not drop submitted history or re-run this applied migration manually.

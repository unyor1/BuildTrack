# Checklist-to-QA submission — 2026-10-16

## Scope and decision

Implemented on top of the existing pin, checklist, evidence, QA, NCR, audit and RLS architecture. The user's final instruction overrides the earlier completion prerequisite: the assigned active Foreman can request a **partial** inspection. Final verification still requires every work item/photo, a passed complete-work submission, no open inspection, no unresolved failed/conditional required inspection and no open NCR.

## Review findings before changes

- ReportModal and editor Details sent `report_pin_progress(for_review)`; that changed status without creating an inspection.
- The old verification gate accepted missing or conditional inspection results.
- Editor `canWorkOn` did not exclude For review / Verified, and the database lacked a submission-wide checklist/evidence mutation lock.
- Sending work back saved status and reason in separate requests; a reason could be lost.
- Per-pin QA summaries did not refresh live and treated read errors as empty QA.
- ReportModal's known old-text regex had already been updated before this task; retained its updated messages and now surface the dedicated QA RPC errors directly.

## Implementation

- Checklist owns the confirmation-gated Submit for QA inspection action. Removed the Foreman Details/footer review action. Partial confirmation states the remaining item count; complete confirmation uses the requested wording. Cancellation never writes; an immediate ref lock prevents repeated clicks. QA submission is online-only; ordinary progress retains offline queuing.
- Engineer explicitly chooses an applicable, nonempty QA template from the existing library/project templates. No invented checklist, standards or tolerances.
- `submit_pin_qa` locks the pin, validates active ownership, configuration and photos for completed items, uses the existing inspection/notification function, records immutable snapshots, and changes status atomically. Pending/in-progress requests prevent duplicates.
- New `pin_qa_submissions` stores project/pin/template/inspection/submitter/time, checklist/photos/work metadata and completeness. Staff/project-scoped SELECT only; audit trigger; included in project export.
- Inspection detail shows the original checklist/photos, separately from the Engineer's inspection result entry. Foreman ticks never become Pass results.
- Failed/conditional inspections use existing per-item findings/NCR generation and return work. A partial Pass also resumes unfinished work, but never qualifies for final verification. Resubmission makes a new snapshot and a linked full-template reinspection, including earlier failed items when still in the configured template; original records remain intact.
- Existing generic stage/hold-point requests/reinspections remain available independently and do not substitute for a complete-work submission. Active work submission cancellation is Engineer-only.
- Server locks protect checklist/evidence and pin scope while awaiting review; submitted photos cannot be deleted. Verification checks current snapshot consistency and records the existing verifier/time fields. Existing verified historical work is not retroactively removed from progress.
- Transactional Engineer return-for-correction requires a reason and preserves cancellation/timeline history. Inspection item failure already requires findings in the existing QA RPC.

## Changed files for this task

New:

- `supabase/migrations/0042_checklist_qa_submission.sql`
- `supabase/tests/99-work-qa.cases.mjs`, `supabase/tests/qa-fixtures.mjs`
- `src/lib/pinQa.ts`, `src/lib/pinQaModel.ts`
- `src/components/qa/PinQaSubmission.tsx`, `src/components/qa/WorkSubmissionEvidence.tsx`
- This audit and `docs/audits/sql/0042_checklist_qa_submission.{md,apply.sql}`

Updated:

- `src/components/editor/{PinParts,Inspector,PinDetailsModal}.tsx`
- `src/components/qa/InspectionDetail.tsx`
- `src/pages/Foreman/{ReportModal,ForemanDailyWorkManagement}.tsx`
- `src/pages/Engineer/EngineerProgressVerification.tsx`
- `src/lib/{blueprints,qaLite,qaModel,projectExport}.ts`
- `scripts/{test-lib,load-test}.mjs`
- `supabase/tests/{30-pins,80-editor-v2,96-notifications-invites,99-escalations,99-evidence-lock,99-pin-assignment,99-qa-inspections}.cases.mjs`
- `CLAUDE.md`, migrations log and SQL README.

Other pre-existing dirty changes were preserved, not attributed to this task.

## Verification and limitations

- `pnpm check`: TypeScript, 85 library tests, 330 SQL/RLS tests and Vite production build passed.
- `pnpm test:load`: passed with 5,000 pins / 50 sheets / 300 inspections / 500 NCRs. Historical mixed-status fixtures are seeded as a trusted backend; authorization is tested separately.
- SQL tests cover partial eligibility, missing configuration/evidence, ownership/roles/disabled users, duplicate attempts, transaction rollback, notification, snapshots/RLS, editing locks, failure/NCR, correction/resubmission, conditional/missing/open inspection rejection, verifier/time, and existing stage inspections. Library tests cover confirmation cancellation, explicit confirmation and partial wording.
- PGlite runs requests on one database connection; duplicate attempts and rollback are exercised, but this is not a multi-session PostgreSQL contention test. Production correctness uses pin row locks; staging two-session contention testing is still recommended.
- No authenticated browser end-to-end test or live Supabase storage/realtime/notification delivery test was performed. Vite reports its existing config-loader compatibility warning.
- **0042 has not been applied to the live database.** The owner must apply prerequisites through 0041 and then the supplied transaction-wrapped SQL Editor script. Existing For review pins without a linked work submission should be returned by the Engineer, configured and resubmitted; no synthetic inspection/backfill is created.
- Migration SHA-256: `ee93e0967ad6304b7e2bf86d9aeef8f4cee71f33f9c95acc94f01068d22c6c36`.

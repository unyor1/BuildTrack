# Full-checklist QA reinspection — 2026-10-25

## Decision and scope

The owner explicitly chose and approved applying full reinspection of the affected checklist after a correction: a Wall repair can disturb other Wall checks. This supersedes the earlier targeted-only proposal, which was never deployed. All frozen criteria become new Pending checks, including previous Pass/N/A results. Unrelated checklists/projects are not resubmitted.

## Implementation

- New work-item reinspection snapshots retain exact criterion lineage and all recorded requirements. Only new, unused Pending snapshot rows are prepared; original inspections, measurements, photos, correction attempts and submitted evidence remain unchanged. Legacy selected source findings are included explicitly if they cannot be reliably linked to the latest frozen snapshot.
- Selecting NCRs identifies the Foreman's corrective action/evidence and sends those NCRs For verification; it does not reduce the inspection scope. The scope-selection/expansion editor and RPC from the unapplied proposal were removed.
- Every new check needs a fresh result, prescribed measurements/tests and required per-check photo evidence. Pending checks and missing photos prevent sign-off. Earlier results are reference-only, with links to original records; UI confirmation and print report describe full checklist scope.
- Repeated failures reuse a linked open NCR and append rejection history. A newly failed or previously closed criterion produces a new NCR. A valid signed-off Pass for that exact finding is required for closure, after its repair; newer pending/failed rechecks invalidate older Passes. Another finding's result is not a substitute.
- NCR closure remains separate from manual Engineer Complete checklist. Every linked open NCR and unresolved inspection still blocks completion. Other items can be submitted independently; existing concurrent-item, role/project, evidence-lock and pin-completion safeguards remain.
- Private helpers/trigger functions are revoked from API roles. Two authenticated-only read RPCs explicitly require project staff access, with empty search paths. No new role, RLS/table grant or storage policy was introduced. The PostgreSQL guidance informed minimal grants and short row-locked transactions.

## Verification and release

- Revised SQL regression covers full scope despite one selected NCR, fresh Pending results on formerly passed criteria, required fresh photos, role/project denials, repeated-failure reuse, independent NCR closure, new failures in previously passing work, stale-Pass invalidation and manual completion. Original source/results and submission evidence are deep-compared unchanged.
- Actual component tests cover full-scope copy, no narrowing controls, reference-only history/original links, loading/error/retry, request races and same-package NCR readiness isolation. Print output is escaped and never claims whole-project acceptance.
- Production function bodies to be replaced were compared against their expected local baselines and matched before deployment. Live functional sign-in/hardware acceptance is not claimed.
- Final `pnpm check` passed: TypeScript, all application/helper/component tests, **447 isolated SQL cases (0 failed)** and Vite production build. An earlier restricted build failed while loading a CommonJS config dependency; the unchanged application built successfully in the approved environment. An older attempt fixture was updated to submit its NCR correction **before** the reinspection, rather than wrongly claiming a repair after the Pass.
- Applied via connector as `20261025141322_full_checklist_reinspection` at 2026-10-25 14:13 UTC to `ruimjlhsfpaezkgfphsz` only. The CLI stub filename was aligned with that hosted version. See [SQL audit](sql/20261025141322_full_checklist_reinspection.md).
- Hosted checks: both columns, both partial indexes and both triggers exist; all nine installed function bodies match reviewed SQL; empty search paths, authenticated-only public RPCs and revoked private/anon execute verified. Targeted-only APIs are absent.
- Pre/post row counts and full pre-existing-column fingerprints are identical across `qa_inspections` (9), `qa_inspection_items` (57), `qa_defects` (9), `qa_photos` (39), `pin_qa_submissions` (9) and `qa_work_attempts` (5). No production business data was created, edited or deleted for verification.
- Security advisors: 4 INFO internal RLS/no-policy findings and 1 pre-existing leaked-password warning unchanged; authenticated-definer notices 91 → 93, only the two explicitly guarded read RPCs added. No unexpected advisor delta. [Advisor reference](https://supabase.com/docs/guides/database/database-linter).
- Frontend wording, reference-history panel and print changes are local and tested, **not deployed to Vercel or pushed to GitHub**. Browser-based signed-in acceptance and physical site verification were not performed. No commit/push was requested; unrelated worktree edits remain preserved.

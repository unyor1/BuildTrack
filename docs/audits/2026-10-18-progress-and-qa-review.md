# Foreman / Engineer reporting and QA workflow — 2026-10-18

## Implemented behavior

- Engineer explicitly approves applicable QA criteria on each work pin. The approval records the Engineer and time. Existing selections are retained, but need approval before new submissions.
- Each work checklist item has its own readiness, For review, Verified by Engineer and Returned states. Foreman readiness never supplies an inspection Pass or Engineer verification.
- Foreman may submit one ready item or all ready unverified items. One pin cannot receive another item, legacy batch, stage or reinspection request while QA is requested/in progress or items await Engineer verification. The database serializes every route on the pin; UI gates and immediate request locks supplement it.
- Passed QA stays For review until the Engineer verifies the submitted work items. Partial acceptance resumes remaining work. The last acceptance completes the overall work automatically only when inspections and NCRs are clear. Step 4 and the aggregate status label read **Completed**; the existing database `verified` value is retained for compatibility with progress calculations and historical records.
- Returning an item requires a reason. Changing accepted work scope invalidates its item acceptance. Reopening one accepted item reopens the overall work while retaining unrelated accepted items.
- Away-from-site, old-photo and clock-ahead evidence is retained for audit, excluded from qualifying evidence, and blocked from Engineer image previews and new Storage signed URLs. Missing GPS and missing configured site remain visible warnings; they do not falsely claim confirmed location. Previously issued signed URLs cannot be revoked by an RLS policy; new evidence URLs last five minutes, with caches scoped to the session user.
- Generic stage / hold-point requests are identified separately from final item acceptance. Their results remain independent completion prerequisites.
- Inspections have a default 24-hour target, an active project Engineer as escalation owner, editable schedules, age/overdue displays, daily deduplicated owner reminders, reinspection counts and open NCR age. First-pass rate, NCR deadlines and trends remain available. Reminder generation follows the application's existing foreground polling mechanism; it is not a new background scheduler or email provider configuration.
- Daily reports support Submitted → Reviewed or Returned for correction. Engineer feedback and reviewer/time are recorded; correction drafts remain visible to project staff for follow-up. New drafts remain private to their authors. Clients see submitted reports only.
- Every submission and review appends an immutable report revision and photo snapshot. Reopening never rewrites the previous snapshot; submitted photos and reports with history cannot be directly deleted. Existing submitted reports receive an explicitly labeled baseline, without fabricating earlier history. Privileged parent cascades retain their existing erasure behavior.
- Daily reports can link work pins with planned/actual quantities and units. Engineer review shows quantity shortfalls and the distinction between claimed quantities and accepted work.
- Engineers import actual project-wide daily unique-worker counts from a biometric export CSV (`date,workers_count,source`). Reports show count variance and source. The existing biometric attendance screen uses sample records; no hardware feed was invented. Imports are audited, and partial import results are reported explicitly.
- Project backups include report revisions and biometric totals.

## Deployment and verification

The earlier audit incorrectly implied prerequisites 0041–0043 remained pending: read-only live checks on 2026-10-18 confirmed their tables and RPCs already exist. The new migration was generated using the Supabase CLI, applied through the connector and aligned to the recorded remote version as `20261018124654_report_review_and_checklist_acceptance.sql`. The migration runner now recognizes timestamped CLI migration filenames as well as the older four-digit files.

Migration validation succeeded in local PostgreSQL-compatible SQL/RLS tests and in a rollback-only transaction on the actual project. That live smoke exercised duplicate refusal, Foreman submission, Engineer inspection, separate item verification, overall completion and report return/resubmission/review. Synthetic observations and test records were rolled back. Existing live pending work is mapped to item review without replacing its snapshots or inventing Pass results.

`pnpm check` verifies TypeScript, library tests, SQL/RLS cases and production build. Vite's default configuration bundling failed on Windows native dependencies; the build now uses the supported runner loader and an ESM-safe source alias.

Completed verification: TypeScript, 85 library tests, 341 SQL/RLS cases and the production build passed. Migration `20261018124654` was applied to project `ruimjlhsfpaezkgfphsz`. A second live smoke against the deployed functions passed and rolled back every synthetic record. The live pending submission and published report were retained and mapped/baselined by the migration. SQL SHA-256: `8525a5beb6cce8f50a72e5da4eed355069f0120657af324bc18de02c7bbc697b`.

No authenticated browser session or biometric hardware connection was available. Storage eligibility is verified through SQL/RLS, not a live image-upload browser test. No standalone staging branch was provisioned.

## Security review

New exposed tables enable RLS and grant only project-scoped reads. Checked RPCs enforce project membership, active roles, item ownership, approval and review constraints. New review fields cannot be forged through browser column grants. Internal trigger and legacy writer functions are not API-executable. Storage uses a restrictive policy so other read policies cannot override rejected-image restrictions. Existing Supabase advisor warnings for intentionally callable authenticated RPCs and internal tables with RLS/no policy are tracked separately from unexpected findings.

Post-deployment advisor check: the same three finding categories remain (four intentionally internal RLS tables with no read policy, authenticated checked definer RPCs, and the pre-existing leaked-password-protection warning). No new anonymous definer, missing-RLS or mutable-search-path category was introduced. Read-only preservation check: one existing pending work inspection, one mapped pending work item, one published report, one baseline revision, and zero synthetic smoke pins remain.

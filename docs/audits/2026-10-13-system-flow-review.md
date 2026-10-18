# BuildTrack system flow and recommendations

Review date: 13 October 2026.

This is a repository-based review, not confirmation of the deployed application's configuration. The inventory contains 403 tracked files; `src` contains 204 files, `docs` contains 84, and there are 39 numbered database migrations. The review scanned the repository structure, page data dependencies, module exports, migration objects, documentation and test structure, then inspected the implementation of the main workflows and the findings below. This was not a line-by-line audit of every file. Dependencies, generated files, binary assets and private credentials were not treated as application source.

No application code, production data, configuration or deployed functions were changed. This document is the only added file.

## Assessment

BuildTrack has a coherent construction progress and QA workflow. The central record is a pin on a blueprint. Assignment, field reporting, verification, photos, inspections, defect correction and client visibility connect to that record. Keep the existing React/Supabase architecture. The most valuable next work is strengthening reliability and evidence integrity, rather than expanding the editor or adding an unrelated backend.

The code already includes substantial controls: database role and project isolation, admin MFA, immutable event records, pin evidence deletion protection, checked QA functions, snapshotted inspection criteria, notification delivery infrastructure, and local SQL and pure-logic tests. These are useful foundations, but some product claims are stronger than the rules currently enforce.

## How the system works

### Architecture

`src/main.tsx` mounts theme, toast, confirmation and authentication providers around `App`.

`src/App.tsx` implements custom browser-history routing and loads role pages on demand. `RouteGuard` checks session, profile status, workspace role, admin permissions and MFA. The role shells provide menus around shared layout components.

Pages call data hooks and helpers in `src/lib`, or call Supabase directly. Postgres RLS, triggers and RPC functions enforce data access and business rules. Private Storage buckets contain plans and evidence. Four Edge Functions handle privileged user operations, impersonation, Google account gating and email delivery. Realtime refreshes many lists; the editor deliberately manages its own local state and undo history.

### Account and access flow

| Entry | Current flow |
|---|---|
| Email registration | Personal details and consent -> signup -> email OTP -> active basic `user` account |
| Basic account | Profile -> identity documents and review -> request Engineer/Foreman/Client access, or redeem invitation -> assigned workspace |
| Google registration | Google authentication -> pending profile -> complete registration details and requested role -> administrator approval, unless pre-approved |
| Google login without completed registration | OAuth gate checks the account; an eligible incomplete Google account is removed and the person is directed to register |
| Whitelist/admin-created account | Trusted role assignment can bypass the ordinary identity-review path; role grants mark identity as verified |
| Admin/Super Admin | Active account plus authenticator MFA; individual admin permissions control administrative actions |

Being assigned a role is separate from being assigned to a project. An engineer, foreman or client still needs project membership to see the relevant work.

Evidence: `src/lib/auth.tsx`, `src/components/RouteGuard.tsx`, `src/pages/Auth/RegisterPage.tsx`, `src/pages/User/UserHome.tsx`, migrations 0013, 0015, 0020, 0029 and 0030.

### Project and work flow

1. An authorized administrator creates a project, sets dates, disciplines, project leads and optionally the site location, then assigns engineers, foremen and clients.
2. An engineer or administrator with blueprint permission uploads a PDF/image plan. The browser creates previews; private files and a revision record are saved.
3. The engineer creates pins with location, category, description, discipline, severity, due date and an optional assigned foreman. Drawings, text, measurements and other annotations accompany the plan.
4. The foreman opens assigned work and reports progress, comments, checklist completion and photos. Supported field writes can be queued locally when the connection fails.
5. Work is normally reported as `not_started -> in_progress -> for_review`. An engineer verifies it or sends it back; `issue` is another available status. This describes the intended workflow, not a strictly enforced state machine for every editor action.
6. A pin that reaches review or verification becomes protected against deletion, including deletion through its sheet/project. Its photo records and referenced pin-photo files gain corresponding protection.
7. Verified pins drive progress summaries, S-curves, dashboards and client views. The current percentage is the share of non-note pins that are verified.

Evidence: `src/lib/projects.ts`, `src/lib/blueprints.ts`, `src/components/editor/BlueprintEditor.tsx`, `src/pages/Foreman/ReportModal.tsx`, `src/pages/Engineer/EngineerProgressVerification.tsx`, `src/lib/progress.ts`, migrations 0003, 0006, 0009, 0010 and 0033.

### QA and defect flow

An inspection request copies a checklist into inspection items. An authorized engineer/admin starts it and becomes its inspector. The inspector records pass/fail/N/A results, measurements, remarks and required photos. Completion calculates a weighted score and snapshots the threshold and weights. Critical failures and failed hold points prevent a passing/conditional result; failed items create numbered non-conformance reports (NCRs).

An NCR follows `open -> in_progress -> for_verification -> closed`, with a send-back path to `in_progress`. Submission requires a corrective-action description; major and critical defects require a photo record. The UI presents foreman correction and engineer verification, although the underlying correction RPC permits a broader group of project reporters.

A client can submit a problem report and photos. The engineer accepts it into an NCR or declines it with a reason. Closing the linked NCR resolves the client report and sends a notification. Clients see their own reports and a simplified repair stage, not the internal QA tables.

Evidence: `src/lib/qa.ts`, `src/lib/qaModel.ts`, `src/components/qa`, `src/lib/snags.ts`, migrations 0025–0027.

### Reports and supporting flows

- Foreman daily report: draft -> submitted -> visible site log; an engineer can reopen it. It records weather, manpower count, work, issues, delays and safety notes.
- Client communication: question -> engineer answer -> notification.
- Notifications: database events create bell entries; an Edge Function claims queued entries and sends email through Brevo. Deadline and escalation generation currently depends on app use.
- Offline: IndexedDB stores pin progress, daily reports and pin photos, with ordered retry and backoff. This is a write queue, not a complete offline copy of project data.
- Administration: registrations, identity review, access requests, invitations, permissions, audit logs, settings, exports and data-erasure requests.
- Biometrics registration and biometric attendance remain sample screens. Their presence is not evidence of working biometric capture or attendance storage.

## Findings and recommendations

Priority 1 means address before relying on the affected feature for real project evidence or sensitive operations. Priority 2 means the next reliability/product iteration. Findings are static code observations; proposed reproduction checks have not been run against production.

### 1. Priority 1 — protect the actual QA and client-report files

**Finding:** `check_qa_photo` and `check_snag_photo` protect database photo records after completion/review. However, the `qa evidence: delete` Storage policy allows the owner or a blueprint administrator to delete the file, and `snag photos: delete` allows its owner. Neither policy checks whether a protected photo row still references that path. The later pin-evidence migration addresses the `pin-photos` bucket only.

**Impact:** A user allowed by the Storage policy can remove evidence bytes while a protected photo record remains. A row-deletion trigger alone does not protect a separate Storage API operation.

**Recommendation:** Apply the referenced-file protection already used for pin photos to QA and client-report files. Protect relevant parent deletion/cascades as well. Add tests that attempt Storage deletion directly after an inspection is completed, an NCR is closed and a client report is reviewed.

Evidence: `supabase/migrations/0025_qa_module.sql:192`, `:237`; `0027_client_snags.sql:45`, `:76`; compare `0033_evidence_lock.sql:61`. Supabase documents distinct RLS policies for Storage operations in its [Storage access-control guide](https://supabase.com/docs/guides/storage/security/access-control).

### 2. Priority 1 — make verification a checked business operation

**Finding:** The verification page warns about QA problems and unticked checklist items, then directly updates `pins.status` to `verified`. The editor has another direct status-update path. `prepare_pin` stamps the verifier but does not require a prior review state, photos, completed checks or cleared NCRs. QA correction also does not restrict updates to the assigned foreman, and NCR closure does not reject the person who recorded the correction.

**Impact:** “Verified” means an authorized account accepted the pin; it does not necessarily mean the evidence and quality requirements were satisfied, or that two different people performed correction and approval.

**Recommendation:** Define the acceptance policy explicitly and enforce it in a transactional `verify_pin` RPC/trigger shared by all entry points. For work requiring inspection, check its required inspection outcome, blocking defects, checklist and evidence. Use an explicit, audited exception process if overrides are needed. If assignment and separation of duties are required, check assignee and `fixed_by != closed_by` in the database.

Evidence: `src/pages/Engineer/EngineerProgressVerification.tsx:139`, `src/components/editor/BlueprintEditor.tsx:275`, `supabase/migrations/0010_pins.sql:84`, `0025_qa_module.sql:564`, `:598`.

### 3. Priority 1 — make data erasure resumable

**Finding:** `erase_user_data` deletes identity metadata and marks the request `done` before the Edge Function deletes Storage files or updates Auth. The function ignores Storage removal errors, while later retries reject requests no longer `open`.

**Impact:** A partial failure can leave sensitive files behind while the request appears completed. The original file list is no longer stored in the identity rows that were deleted.

**Recommendation:** Persist an erasure job with its file manifest and step outcomes. Disable access promptly, retry cleanup safely, and mark completion only after required cleanup succeeds. Handle abandoned identity uploads as well as files referenced by submissions. Test Storage and Auth failures independently.

Evidence: `supabase/migrations/0032_data_requests.sql:78`, `:92`, `:101`; `supabase/functions/admin-users/index.ts:255`.

### 4. Priority 1 — make offline retries safe to repeat

**Finding:** Queue items have client UUIDs, but those IDs are not submitted as operation keys. A photo retry inserts a new `pin_photos` row, and that table has no unique path constraint in the migrations. A progress retry can add its comment again. The `flushing` promise only serializes one browser context, not multiple tabs.

**Impact:** If the server saves a request but its response is lost, retry can duplicate evidence records/comments. Two tabs can replay the same queue. Daily report retries can also show an already-submitted error after a successful but unacknowledged submission.

**Recommendation:** Send a stable operation ID to checked server functions and return the saved result on repeated calls. Use a stable photo-row ID or an appropriate unique storage-path constraint. Coordinate replay across tabs and recheck the authenticated user before sending. Test “server committed, response lost,” two tabs, session changes and interrupted uploads.

Evidence: `src/lib/offlineQueue.ts:68`, `:85`, `:101`; `supabase/migrations/0010_pins.sql:72`, `:224`.

### 5. Priority 2 — complete and prove project restoration

**Finding:** `EXPORT_TABLES` includes QA inspection/defect rows but omits `client_snags`, `snag_photos`, checklist templates/items, QA counters and sheet history. The exporter does not collect the `snag-photos` bucket. The restore guide predates the QA tables. Export also reads tables separately while edits may continue, so it is not a consistent database snapshot.

**Recommendation:** Define a versioned export manifest and explicitly distinguish a project handover export from disaster recovery. Include client reports, their evidence and the required template/counter dependencies; preserve or deliberately rebuild counters. Add schema/migration version information, a consistent snapshot strategy and a scripted staging restore drill. Verify counts, references, evidence availability and the next generated inspection/NCR number.

Evidence: `src/lib/projectExport.ts:8`, `docs/BUILDTRACK_BACKUP_RESTORE.md`.

### 6. Priority 2 — generate reminders without depending on an open app

**Finding:** `refreshReminders` runs from the notification hook on mount, with a sessionStorage throttle. Polling refreshes the list but does not regenerate reminders. Escalations are generated for the current authenticated caller. A scheduled email sender can deliver existing notifications, but cannot create missing deadline notifications by itself.

**Recommendation:** Add a server-side scheduled sweep over eligible recipients/projects, with per-day deduplication and explicit Manila calendar dates. Do not simply call the current user-scoped function as an unauthenticated scheduler. Monitor generation separately from delivery. Confirm deployed Brevo secrets and Cron configuration before declaring email live; this review did not inspect them. [Supabase Cron](https://supabase.com/docs/guides/cron) supports scheduled database functions and HTTP/Edge Function calls.

**Related delivery issue:** `claim_email_batch` increments attempts but has no persistent claimed-until/in-flight state. Its row locks end when the RPC returns, so an overlapping worker can claim the same unsent entries. Add a lease and provider deduplication where available; enforce the per-user cap against claimed work as well as previously sent logs.

Evidence: `src/lib/notifications.ts:22`, `:56`; `supabase/migrations/0038_escalation_alerts.sql:15`; `0028_email_notifications.sql:44`; `supabase/functions/send-notifications/index.ts`.

### 7. Priority 2 — label progress and photo evidence precisely

**Finding:** Progress is an unweighted pin count. A small task and a major construction activity each count once. The S-curve reconstructs history from current pins, current due dates and current verification status; scope changes or reopening work can change the historical curve.

**Recommendation:** Label the current measure “verified work items.” If physical project completion is needed, add planned quantities/units or agreed work weights and a baseline/change-control policy. Keep submitted progress, verified progress and quality clearance visible as distinct measures. Preserve dated snapshots or event-derived history for historical reporting.

**Photo finding:** `captureStamp` captures the phone's current time/location when a file is added. A gallery image can therefore receive a current site stamp. The label “Taken at the project site” overstates what was observed.

**Recommendation:** Distinguish camera capture from uploaded gallery evidence and label the current stamp “device location when added.” Keep device claims separate from server receipt time; do not treat GPS/time flags as proof of image origin.

Evidence: `src/lib/progress.ts:29`, `:125`; `src/lib/photoStamp.ts:30`, `:58`; `src/components/editor/PinParts.tsx:256`.

### 8. Priority 2 — fix editor state preservation and concurrent writes

**Finding:** `SNAPSHOT_KEYS` omits the annotation `format` field. Copy/paste, duplication and delete/undo reconstruction use those snapshots, so rich text formatting is not preserved by those paths. Batch style/group edits use separate parallel row updates; partial success can persist even when the operation reports failure. Updates do not include an expected revision/version condition.

**Recommendation:** Include all restorable fields in a tested snapshot model. Move multi-item edits to atomic RPCs, following the existing atomic movement function. Add optimistic concurrency checks and a clear conflict/reload workflow before supporting simultaneous editors. Split the 1,511-line editor and 1,055-line stage by responsibility after behavior is covered.

Evidence: `src/components/editor/useAnnotationOps.ts:13`, `:94`, `:299`; `src/components/editor/BlueprintEditor.tsx`; `src/components/editor/StageCanvas.tsx`.

### 9. Priority 2 — standardize data loading and failure states

**Finding:** Pagination is used for project pins/reports but not consistently for projects, sheets or annotations. `fetchAll` silently stops at 50,000 rows. Several hooks convert query errors to empty arrays or “not found.” Some reload hooks lack protection against an older project/sheet response overwriting a newer one.

**Recommendation:** Use shared query conventions with stable pagination, explicit truncated/error results, stale-response protection and sensible server-side summary queries. An offline or failed request should not appear as “no work.” Show a project picker when the stored project is inaccessible. Keep project IDs in navigable URLs and add an explicit unknown-route screen.

Evidence: `src/lib/projects.ts:63`, `src/lib/blueprints.ts:235`, `:325`, `src/lib/paging.ts`, `src/lib/qaLite.ts`, `src/App.tsx`.

### 10. Priority 2 — reconcile onboarding, permissions and documentation

Email users and Google users have substantially different onboarding routes. Display a single clear checklist of account, identity, role and project-access steps, with documented trusted exceptions. Keep role approval separate from project membership in the UI.

`users.view` currently permits identity-document viewing in SQL, while the notice describes access as limited to administrators allowed to approve users. Align the permission and wording; consider a dedicated identity-review permission and server-mediated, audited document access. `record_identity_view` is a callable logging action, not a mandatory gate on direct Storage reads.

Administrative operations that delete/replace permissions or decide requests and then grant roles span multiple calls. Use transactional database operations for related database changes and resumable steps when Auth/Storage is involved. Check audit-write failures explicitly.

Mark the FastAPI/React 18 recommendations and obsolete roadmap status tables as historical. The current implementation is React 19 plus Supabase, with CI, reports, QA and offline write support already present. Update the backup guide and public/signup claims about biometrics. Keep one authoritative feature-status table distinguishing implemented, sample, configured and deployment-verified.

Evidence: `supabase/migrations/0030_identity_verification_privacy.sql:104`, `:111`, `:191`; `src/lib/privacy.ts`; `supabase/functions/admin-users/index.ts`; `docs/BUILDTRACK_RECOMMENDATIONS.md`; `docs/BUILDTRACK_PRODUCT_ROADMAP.md`; `docs/HANDOVER.md`; `src/pages/Auth/RegisterPage.tsx`.

## Recommended implementation order

1. Restore a reproducible local check environment; run the existing CI commands.
2. Close Storage evidence deletion gaps, define/enforce verification rules, and make erasure resumable.
3. Make offline writes safe to retry; repair and exercise project restoration.
4. Schedule reminder generation and harden email claims; add visible operational failure reporting.
5. Fix editor snapshots, paging/error handling and stale writes; add browser workflow tests.
6. Clarify progress/evidence labels and onboarding; reconcile the current documentation.
7. Only then consider attendance hardware integration, weighted quantities, independent inspectors or payment milestones, according to the actual product scope.

## Validation and remaining checks

The repository contains CI for type-checking, pure-logic tests, local PGlite migration/RLS tests and production build. This is already implemented and should be retained.

Attempts during this review:

| Command | Observed result |
|---|---|
| `pnpm check` | Stopped before type-checking: local `typescript/bin/tsc` module missing |
| `pnpm test:lib` | Stopped during imports: `qrcode-generator` missing |
| `pnpm test:sql` | Stopped during imports: `@electric-sql/pglite` missing |

These are environment/dependency failures, not test assertions demonstrating application defects. No passing test or production-build result is claimed. No dependency installation, live database mutation or deployed service test was performed.

Add browser/integration coverage for email and Google onboarding, admin MFA, project access isolation, assignment/report/verification, QA correction, client-report resolution, Storage deletion bypasses, retry after a lost response, concurrent editing and erasure failure recovery. Existing PGlite tests model Auth and Storage tables; they do not validate the hosted Storage HTTP API, real OAuth, Edge Function execution or email provider behavior.

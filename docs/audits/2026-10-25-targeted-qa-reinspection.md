# Targeted QA corrections and reinspection — 2026-10-25

> Superseded, never applied: the owner subsequently required a full reinspection of the same checklist after corrections and explicitly approved applying that replacement. The unapplied targeted migration was removed. This document is a historical implementation record, not current behaviour. See [full-checklist reinspection](2026-10-25-full-checklist-reinspection.md).

## Scope and decisions

The user approved implementing the recommended real-world correction workflow. A failed QA request is not a resubmission of the whole project. Corrected findings need reinspection, with the authorized Engineer able to broaden the scope to work affected by the repair. Earlier satisfactory work remains on record, subject to later invalidation/reinspection. Closing an NCR is not completing a checklist or accepting the project.

Construction reference examples: [UFGS 01 45 00, follow-up and deficiency/rework tracking](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2001%2045%2000.pdf), and the [USACE-hosted Durham Meadows QA/QC plan, section 9](https://www.nae.usace.army.mil/Portals/74/docs/Topics/DurhamMeadowsWaterline/ApprovedConstructionPlan/QualityControlPlanv3.pdf), which includes investigating similar nonconformances. These inform the workflow; they are not asserted as the governing contract or Philippine regulatory requirements for Valencia's projects. Actual inspection scope and tests come from the approved project quality plan and authorized Engineer.

## Before

- Correction packages called `submit_checklist_qa`, which copied every criterion from the previous inspection into fresh Pending rows, including passed checks.
- The chosen NCR list did not determine the actual reinspection scope.
- Every repeated criterion failure raised another NCR.
- NCR detail offered closure without finding-specific reinspection readiness.

## After

- New item requests still start with full recorded criteria. Corrections use immutable criterion IDs and frozen requirements. Selected NCRs define the new checks; omitted findings remain outstanding.
- Earlier Pass/N/A results are displayed separately with links to their original inspection/evidence. They do not become invented current results or inflate the current reinspection score. The screen and print report identify scope-only scores.
- Before starting, the Engineer can add an affected earlier check with a recorded reason. This can expand to the necessary broader scope, but cannot erase required failures. Fresh measurement/photo requirements apply to each added check.
- A partial Pass does not strand the Foreman at an overall Passed state: the item returns for remaining corrections. A later NCR can be submitted independently using its original source finding, even after another targeted request passed.
- Repeated failures append events to the same open NCR. Newly failed/previously closed findings remain separate new nonconformances where appropriate.
- The closure guard requires the finding's own signed-off Pass in its linked correction inspection. A different finding's Pass is insufficient. A signed-off inspection may fail on another check without preventing closure of this passed finding. A newer failed or pending check of the same affected work invalidates the old Pass.
- Checklists still require an explicit Engineer Complete checklist action after passed item QA and closed linked NCRs. Pin-level completion, other open inspections, role/project guards, trusted-time evidence rules and history locks remain.
- Legacy snapshots are not rewritten or guessed from names/positions. Ambiguous legacy finding links fall back to full scope and include their exact frozen source checks. No existing business records are changed by deployment.

## Security and implementation

- Existing checked correction/complete RPC signatures are retained. New scope helpers and triggers are not executable by API roles. Three authorized read/expansion RPCs explicitly check staff/project or project Engineer scope, use an empty search path and deny anon.
- Mutation paths lock the inspection/pin to serialize submission, scope changes and start. A `reinspection_of` index supports the history/verification reads; a partial origin index supports criterion lineage.
- Client cannot query QA context/readiness. Admin does not gain inspection or scope-changing rights. Existing RLS/table grants/storage policies remain unchanged.
- UI reads mask previous keys and reject late responses. NCR readiness uses both finding and correction-attempt IDs, including multiple NCRs in one shared package.
- Production definitions of the three replaced existing functions were compared to the local expected baseline before deployment and matched, so unrelated live changes were not overwritten.

## Verification

- New `test:qa-reinspection`: real scope component controls, Engineer/read-only/started/error states, required reason, original-result links, scoped reports/escaping, context races and same-package NCR readiness isolation.
- New SQL cases: selected-finding scope; frozen requirements/old evidence; Engineer-only expansion; wrong-history IDs; camera-required fresh evidence; repeated failure without duplicate NCR; independent remaining correction; manual completion; private helpers/anon; per-finding closure during a failed overall request; invalidation by a newer pending/failed recheck.
- Existing attempt/direct-QA fixtures now explicitly choose their NCR and expect one continuing NCR for repeated failures, while retaining all immutable-attempt assertions.
- Temporary synthetic scope fixture rendered the actual component in isolated headless Chrome at 700px and 360px. Screenshots inspected; no horizontal overflow. Fixture and screenshot removed. The visible browser connector exposed no tabs. Live signed-in flows and physical site inspections were not browser/hardware-tested.

- Final `pnpm check` passed: TypeScript, application/model/component suites, **447 SQL cases (0 failed)** and the production Vite build. The SQL tests run against an isolated database, not production business data.
- Live deployment is **pending explicit owner approval**. The connector's approval review rejected `apply_migration` because this replaces production QA functions and adds schema/triggers; it did not execute the migration. A subsequent read-only migration-history check confirms the latest hosted version is still `20261025090858_site_issue_pending_review`.
- Do not deploy the matching frontend on its own: it requires the new scope/readiness RPCs. After owner approval, apply the reviewed migration, verify live definitions/grants/advisors, then release the frontend. See [SQL audit](sql/20261025104520_targeted_qa_reinspection.md).

No commit or push was requested. Existing unrelated worktree edits were preserved.

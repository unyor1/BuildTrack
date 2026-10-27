# Full-checklist QA reinspection

| Field | Value |
|---|---|
| SQL | `supabase/migrations/20261025141322_full_checklist_reinspection.sql` |
| Written | 2026-10-25; Supabase CLI-generated stub, aligned to hosted version |
| Applied | 2026-10-25 14:13 UTC via connector, explicit owner approval |
| Project | BuildTrack `ruimjlhsfpaezkgfphsz` only |
| Depends on | Existing QA/work attempts/correction packages/direct concurrent-item QA and pin-record links through `20261025090858` |
| Status | Applied and verified |
| Reversible | Reviewed roll-forward preferred after new requests use criterion lineage |

## Purpose

The owner requires a full inspection of the same checklist after repairs: all Wall criteria, not only the failed ones, because corrections may affect previously satisfactory work. This replaces the unapplied targeted proposal. No other checklist/project is automatically resubmitted, and the original records/evidence remain unchanged.

## Objects

| Object | Change |
|---|---|
| `qa_inspections` | Non-null `full_checklist_reinspection`, default false, and partial `reinspection_of` index |
| `qa_inspection_items` | Nullable self-referencing `origin_item_id` and partial lineage index |
| `qa_prior_criteria`, `configure_full_qa_reinspection`, `prepare_full_work_qa` | Private helpers/insert trigger copy all frozen criteria into fresh Pending rows; never manufacture new Passes or overwrite old records |
| `qa_reinspection_context` | Guarded reference-only prior inspection read for project staff |
| `qa_ncr_verified_inspection`, `qa_ncr_reinspection_state`, `guard_full_ncr_closure` | Exact-finding signed-off Pass readiness, after repair, invalidated by a newer pending/failed recheck; closure trigger and guarded readiness read |
| `submit_correction_package` | Existing signature/guards retained; chosen NCRs identify repairs, not a reduced inspection scope; reject unrelated-history bundling |
| `complete_inspection` | Existing result/evidence/role guards retained; repeat failures reuse a linked open NCR with a rejection event; new failures still raise NCRs |

Only brand-new, unused Pending rows are rebuilt. No old result/photo/attempt is changed, no old criterion identity is backfilled, and no migration rewrites existing history. Older selected findings without reliable lineage include their exact frozen source alongside the full prior snapshot. Existing stage/hold-point behaviour, concurrent-item submission, storage policies and manual completion remain unchanged.

## Security and RLS

Two new read RPCs require authorized project staff; Clients and outsiders are denied. All nine affected definers have an empty search path. Private helpers/triggers are revoked from PUBLIC, anon and authenticated. Only the two new guarded reads and the two already-public checked mutation RPCs are authenticated-executable. No new table/RLS/storage permissions or inspection rights for Admin were added. Existing pin/inspection/NCR row locks and immutable evidence safeguards remain.

## Verification

- SHA-256 of the version-aligned local file: `948bb802115b24cff5e700739fca9c8e56649e966466dec9f4f2c0738410e104` (alignment comment only differs from applied source; all function bodies match).
- `pnpm check`: TypeScript, all component/application/helper suites, **447 SQL cases, 0 failed**, and production build passed. SQL tests are isolated, not production writes. Full scope is asserted despite selecting one NCR; formerly passing checks are Pending and need fresh required evidence; a new failure outside the original NCR creates its own NCR; repeated failure reuses one; stale/too-early Passes cannot authorize closure; manual completion stays gated.
- Hosted baseline definitions matched before replacing the two existing functions. After application, all nine function bodies match reviewed SQL. Both columns, indexes and triggers and their types/defaults verified; anon/private execute denied, correct authenticated grants present. Targeted-scope APIs are absent.
- Existing-column row fingerprints/counts before and after are identical for inspections (9), inspection checks (57), NCRs (9), QA photos (39), submission snapshots (9), correction attempts (5). No production business records were created, updated or deleted for testing.
- Security advisors: unchanged 4 INFO internal RLS/no-policy notices and 1 pre-existing leaked-password warning; authenticated-definer notices 91 → 93. The only additions are the intended, staff/project-guarded `qa_reinspection_context` and `qa_ncr_reinspection_state`. No unexpected change. [Advisor reference](https://supabase.com/docs/guides/database/database-linter).
- Matching frontend is local/tested, not committed, pushed or deployed to Vercel. No live signed-in end-to-end or physical-site acceptance is claimed. Full [task audit](../2026-10-25-full-checklist-reinspection.md).

## Rollback and limits

Do not delete submitted history or invent carried-forward Passes. Once new requests reference criterion lineage, restoring old closure/duplicate-failure semantics alone would misinterpret that history. Prefer a reviewed corrective migration. A rollback must first inventory active requests and coordinate compatible frontend/server behaviour while retaining the new history/columns. Do not disable evidence or completion guards as a workaround.

The policy applies to new correction requests; existing inspections are not silently rebuilt or reset. This supports the project's quality plan; it does not establish construction tolerances, grant design approvals or substitute for final project acceptance.

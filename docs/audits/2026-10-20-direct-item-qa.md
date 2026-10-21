# Direct checklist-item QA

The pin-wide pending-request rule described below was subsequently replaced by [independent checklist-item QA](2026-10-20-concurrent-checklist-qa.md), as requested by the user.

| Field | Value |
|---|---|
| Migration | `20261020064247_direct_item_qa.sql` |
| Written / applied | 2026-10-20, Supabase connector |
| Project | BuildTrack `ruimjlhsfpaezkgfphsz` only |
| Dependencies | Existing checklist acceptance, correction-package and Philippine QA requirements migrations |
| Status | Applied and verified |
| Reversible | UI can be reverted separately; database rollback requires a new reviewed migration. Do not drop item criteria or rewrite submission snapshots. |

## Purpose and flow

Engineer saves the work item name and its criteria together on the plan. Each criterion has a test/check and passing requirement; references, evidence instructions, severity, measurements and hold points are available as options. Applicable existing library criteria can be copied into this form. New items do not require a separate pin-level selection/approval.

Foreman opens the work item, adds photos and remarks, and submits directly for QA. There is no Ready checkbox. The submission records `done=true` internally, for compatibility with reporting, snapshots and acceptance rules. Upload/camera controls appear inside the opened item, not on checklist rows. The old pin-level batch-submit panel is no longer mounted. Foreman QA groups and Engineer help text use the same flow.

## Objects and protections

- `pin_checklist_items.qa_template_id`: nullable FK/index; existing rows retained unchanged. Existing approved pin-level criteria remain a compatibility fallback, not an automatic reassignment of old items.
- `save_work_checklist_item`: atomic item/criteria save, project Engineer authorization, pin serialization, validation, no changes to submitted/accepted item criteria. No anonymous execute; no client insert/update grant for the new column.
- `submit_checklist_qa`: assigned active Foreman only; same-pin pending/acceptance block retained; eligible item evidence required; submission declares the item finished. Different criteria sets must be submitted separately.
- Correction packages retain their own photos/remarks, linked inspection, timeline and NCR workflow. Re-inspections copy the prior request's frozen criteria, not a later library edit. The UI offers batch corrections only when items use the same criteria set.
- `review_checklist_item` and private `pin_qa_checklist` handle the absent new key in pre-migration snapshots without changing history or weakening existing checks.
- Existing RLS and Storage policies are unchanged. No attendance/auth changes or new public endpoints.

## Verification

- Full `pnpm check`: TypeScript, 109 helper tests, comparison/editor/attendance interactions, direct-QA interactions, 396 SQL tests and Vite build passed.
- Direct-QA component tests exercise the actual item editor, Open-only checklist controls, nested photo controls, direct submission, cancelled confirmation and remark-saving order.
- SQL tests cover Engineer creation, no separate pin approval/readiness, criteria-write restrictions, wrong-pin access, rejected/absent photo evidence, pending pin isolation, legacy snapshot acceptance, item-specific inspection criteria and frozen correction evidence.
- Live migration applied as version `20261020064247`. Anonymous execute=false; authenticated execute=true on the checked new RPC; direct new-column update=false; private snapshot helper execute=false.
- Live rollback-only smoke ran using authenticated Engineer and Foreman roles: create item+criteria, block Foreman criteria edits, submit with no Ready action, block duplicate, inspect/pass, accept and complete work. Transaction rolled back; no files uploaded or synthetic records retained.
- Historical rows unchanged: 3 submissions, fingerprint `873ff677487f20a8aab4e86581d29a5b`; 24 inspection items, fingerprint `b7e4ebf7ea2f52aa329de6b0d23b0ee8` before/after deployment.
- Advisors: same categories; authenticated SECURITY DEFINER RPC warning count 86 → 87 for the deliberately checked new atomic RPC. Anonymous/PUBLIC execution is revoked and project/role checks run before writes. Four existing internal-table no-policy INFO notices and existing password-protection warning unchanged. [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Limits and recovery

Existing approved criteria are preserved; the migration does not invent tests, limits or replace an existing project's selections. An Engineer can add specific criteria to older unsubmitted items using Edit item & criteria. Already-submitted scope/criteria stay with their history; a different scope needs a new item.

No browser visual check was available; layout was checked through component/control tests and build. No Git commit or push performed. To revert, retain the additive FK and historical snapshots, restore the prior UI/RPC definitions through a new migration, and explicitly decide how newly created item-scoped criteria should be handled. Dropping the column is not a safe automatic rollback.

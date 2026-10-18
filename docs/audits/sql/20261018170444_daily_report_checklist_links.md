# 20261018170444 — daily report linked work = work pin + checklist item

| | |
|---|---|
| File | `supabase/migrations/20261018170444_daily_report_checklist_links.sql` |
| Written / applied | 2026-10-19 (PHT) / recorded as `20261018170444` (UTC) via the Supabase connector |
| Depends on | `20261018124654` (`daily_reports.linked_work`, `prepare_daily_report`) |
| Status | Applied, verified |
| Reversible | Yes, by a forward migration re-creating the previous `prepare_daily_report` |
| SHA-256 | `6ac7582ab4f05ccc8b22c09172ca9551d3adef6ca535c00e9ab8686d486c5f52` |

## Purpose

The Foreman's daily report linked work by planned / actual quantities and a unit. It now links the work pin and the checklist item (work item) worked on that day, matching the work-item QA flow.

## Objects changed

| Object | Change |
|---|---|
| `prepare_daily_report()` (trigger function) | `linked_work` rows are `{ "pin_id", "item_id" }` only. The pin must be a work pin of the report's project; `item_id`, when set, must be a checklist item of that pin, and is required when the pin has checklist items. Quantities and any other keys are refused. Links are validated only when they change (insert, or `linked_work` differs), so reviewing a submitted report never fails because a pin gained items later. Everything else is unchanged. |

No table or column change. `issues`, `delays`, `safety` stay in `daily_reports`; the form simply stops asking for them, and older reports keep their text.

## Security and RLS

No policy or grant change; the trigger function stays non-executable by API roles (verified: `authenticated` cannot execute it).

## Verification

- `pnpm test:sql`: 360 passed, including `supabase/tests/99-zzzzz-daily-report-links.cases.mjs` (item required when the pin has items, item must belong to the pin, other-project pins refused, quantities refused, pin-only link allowed when the pin has no items, review not blocked by later items) and the updated daily report review case in `99-z-workflow-review.cases.mjs`.
- Live: function body hash-matches the file. Before applying, no live report had linked work, so no existing data needed conversion.

## Rollback

Forward migration re-creating `prepare_daily_report` from `20261018124654`. Any report saved with `{pin_id, item_id}` links would then fail the old quantity check on its next edit, so clear or convert those links first.

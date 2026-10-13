# 0036: Row Level Security that scales

| Field | Value |
|---|---|
| File | `supabase/migrations/0036_rls_performance.sql` |
| Applied | 2026-10-13, by the agent through the BUILDTRACK_MIGRATIONS connector |
| Depends on | 0009, 0010, 0014, 0021, 0025, 0027 |
| Status | **Applied** and verified (parity test, live parity check, advisors) |
| Reversible | Yes (recreate the previous policies, listed in `docs/audits/sql/0009`-`0027` docs) |

## Why
The load test (`pnpm test:load`, 50 sheets / 5,000 pins) showed that reading a project's pins took about 10 s: every row called `can_view_project(project_id)`, and paged reads repeated it.

## What changed (the rules did not)
- `viewable_project_ids()` = the projects `can_view_project` allows, computed once per query; `client_project_ids()` = the caller's client projects.
- 15 read policies now use `project_id in (select public.viewable_project_ids())`, and wrap `is_staff()`, `is_active()`, `auth.uid()` in a sub-select so they run once: blueprints, blueprint_revisions, blueprint_annotations, pin_checklist_items, pins, pin_photos, pin_events, daily_reports, project_questions, qa_inspections, qa_inspection_items, qa_defects, qa_defect_events, qa_photos, client_snags.
- Indexes for the orders the app pages by (pins by project + created_at, NCR / inspection / client report numbers, photos by project, "sent back" timeline lookups).

## Proof that nobody sees more or less
- `supabase/tests/99-rls-parity.cases.mjs`: for 8 identities (Super Admin, admin with and without MFA, two engineers, foreman, client, pending user) and all 15 tables, the rows returned through the new policy equal the rows the old rule allows.
- Live (rolled back, read only): every real account against 9 tables, 45 comparisons, 0 differences.

## Result (load test, in-memory Postgres on the dev machine)
| Query | Before | After |
|---|---|---|
| All pins of the project (5,000, paged) | 10,484 ms | 409 ms |
| Sidebar badges | 1,632 ms | 5 ms |
| Verification queue | 1,618 ms | 68 ms |
| NCR register (500) | 267 ms | 39 ms |

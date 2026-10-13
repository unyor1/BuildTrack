# 0034: Live updates (Supabase Realtime)

| Field | Value |
|---|---|
| File | `supabase/migrations/0034_realtime.sql` |
| Applied | 2026-10-13, by the agent through the BUILDTRACK_MIGRATIONS connector |
| Depends on | 0010, 0020, 0021, 0025, 0027 |
| Status | **Applied** and verified |
| Reversible | Yes (`alter publication supabase_realtime drop table ...`) |

## Purpose
Adds the work tables to the `supabase_realtime` publication so screens update without a refresh: `pins`, `pin_events`, `pin_photos`, `qa_inspections`, `qa_inspection_items`, `qa_defects`, `qa_defect_events`, `qa_photos`, `client_snags`, `daily_reports`, `project_questions`, `notifications`. Not published on purpose: profiles, identity, privacy, audit and admin tables.

Realtime applies each table's Row Level Security to every listener. The migration is a no-op where the publication does not exist (local test database without it).

## Verification
- Test: `99-evidence-lock.cases.mjs` checks the exact published list (and that sensitive tables are absent).
- Live, with two throwaway accounts (deleted afterwards): A subscribed to `notifications`; a row for A arrived in about 0.4 s, a row for B never reached A. Note: the first run right after the migration received nothing; Realtime picked the new tables up within a few minutes.

## App
`lib/realtime.ts` (`useLiveReload`, debounced reload; filters `project_id=eq.<id>` etc.). Used by the project pin hook (dashboards, queue, progress, client), pin timeline and photos, sidebar badges, notifications, QA lists and summary, daily reports, questions, client reports, Project Health and the engineer / foreman dashboards. Not used inside the blueprint editor (optimistic edits and undo).

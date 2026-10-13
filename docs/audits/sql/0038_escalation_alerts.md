# 0038: Late-work alerts (engineer digest, admin escalation)

| Field | Value |
|---|---|
| File | `supabase/migrations/0038_escalation_alerts.sql` |
| Applied | 2026-10-13, by the agent through the BUILDTRACK_MIGRATIONS connector |
| Depends on | 0003, 0010, 0020 (`notify_user`), 0025 |
| Status | **Applied** and verified (SQL tests, rolled-back dry run for every real account, privileges, advisors: only the known "signed-in users may call a definer function" pattern) |
| Reversible | Yes (`drop function public.generate_escalations()`) |

## Why
Reminders (0020, 0025) only reached the assigned foreman. Nobody on the engineering side was told when work was days late, and nothing went upward.

## Rules (constants in the function; change them there and here)
`generate_escalations()` (authenticated; called from `refreshReminders` in `src/lib/notifications.ts` at most every 30 minutes per session, like the other reminders; the database de-duplicates by day) creates at most **one notification per person and project per day**:
- **Engineer of the project**, kind `alert.overdue` ("CODE: work is running late"): open work items (notes and verified work excluded) **3 or more days** past their due date, and/or defect reports (NCR) past their deadline. Link: the engineer dashboard of that project.
- **Super Admin and admins with `projects.manage`**, kind `alert.escalation` ("CODE: needs your attention"), only for serious cases: an open **critical** NCR past its deadline, an NCR overdue by **5 or more days**, or work **7 or more days** late. Link: the project overview.
- Only projects that are planning, active or on hold. Foremen, clients, pending accounts and engineers of other projects get nothing.
- Each notification is also queued for email by the existing email queue (0028).

## Tests
`supabase/tests/99-escalations.cases.mjs`: digest content and link, no duplicates the same day, defect reports added, quiet or foreign projects silent, wrong roles silent, admin escalation only when serious, permission rule, finished projects ignored, anonymous call refused.

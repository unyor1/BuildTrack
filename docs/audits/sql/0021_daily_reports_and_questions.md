# 0021: Daily reports (site logs) and Client questions

| Field | Value |
|---|---|
| File | `supabase/migrations/0021_daily_reports_and_questions.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `daily_reports_and_questions` |
| Depends on | 0001-0020 |
| Status | **Applied** and verified (rolled-back live check, advisor reviewed) |
| Reversible | Yes, see Rollback |

## Purpose
Phase 2 (without biometrics): the Foreman writes a daily site report, Engineers and Clients read the submitted ones, and Clients can ask the team a question that an Engineer answers.

## Objects
| Type | Name | Notes |
|---|---|---|
| Table | `daily_reports` | one per project, author and day; weather, `workers_count` (a head count typed by the foreman, **not attendance**), work done, issues, delays, safety; status `draft` / `submitted`. RLS: a draft is read and edited only by its author; a submitted report is read-only and visible to the whole project (Clients included). Column grants stop the project, date and author changing. |
| Trigger fn | `prepare_daily_report` | author forced to the caller; date not in the future and at most 14 days back (Manila time); description needed to submit; submitted reports cannot change except through `reopen_daily_report` |
| RPC | `reopen_daily_report(id)` | an Engineer of the project (or `blueprints.manage`) sends a submitted report back to draft; the author is notified |
| Trigger fn | `trg_notify_daily_report` | submitted -> the project's Engineers (not the author), reopened -> the author |
| Table | `project_questions` | a Client's question (optional pin of the same project), answer fields written only by `answer_question`; max 20 questions a day per person. RLS: a Client sees only their own questions, staff see all. Clients cannot edit or delete. |
| RPC | `answer_question(id, text)` | Engineer of the project only; notifies the Client |
| Trigger fn | `trg_notify_question` | new question -> the project's Engineers |

## Tests (`supabase/tests/97-reports-questions.cases.mjs`, suite 184/184)
Draft defaults and forced author, uniqueness, date window and bounds, draft privacy, who may write, submit rules and notifications, read-only after submit, reopen and resubmit, immutable keys, question lifecycle, privacy, answering rules, daily limit.

## Verification (2026-10-11, live, rolled back)
As the Super Admin: a report drafted and submitted, a later edit changed nothing (RLS), the report reopened to draft, the questions table reachable. Nothing left behind. Advisor: `reopen_daily_report` and `answer_question` are new intended SECURITY DEFINER RPCs that check the caller inside.

## Rollback
```sql
drop function if exists public.answer_question(uuid, text), public.reopen_daily_report(uuid);
drop table if exists public.project_questions, public.daily_reports;
drop function if exists public.trg_notify_question(), public.prepare_question(), public.trg_notify_daily_report(), public.prepare_daily_report();
```

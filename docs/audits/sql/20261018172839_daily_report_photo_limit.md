# 20261018172839 — daily report photo limit 50

| | |
|---|---|
| File | `supabase/migrations/20261018172839_daily_report_photo_limit.sql` |
| Written / applied | 2026-10-19 (PHT) / recorded as `20261018172839` (UTC) via the Supabase connector |
| Depends on | `0041_daily_report_photos.sql` (`prepare_daily_report_photo`) |
| Status | Applied, verified |
| Reversible | Yes: forward migration with the old limit (reports already above it keep their photos; only new uploads would be refused) |
| SHA-256 | `6173860a600d5b027d7c4ac466d2ba0eb8494b7fe7b0b8e3e5100fc8e1c2e625` |

## Purpose

A Foreman could attach only 10 photos to a daily report. The limit is now 50 per report.

## Objects changed

| Object | Change |
|---|---|
| `prepare_daily_report_photo()` (trigger function) | Limit 10 → 50 ("A report can have at most 50 photos"). Unchanged: author only, draft only, uploads serialized with each other and with submit / reopen (row lock), project/report/file path, delete rules. The live body before this change matched `0041` apart from Windows line endings from the hand-pasted script. |

## Security and RLS

No policy, grant or bucket change; the function stays non-executable by API roles. Security advisors after applying: same three categories as before, no new finding.

## Verification

- `pnpm test:sql`: 360 passed; `99-daily-report-photos.cases.mjs` now checks fifty allowed, the fifty-first refused, and a multi-row insert across the limit rolled back.
- Live: body hash-matches the file; before applying, the most photos on any report was 1.

## Rollback

Forward migration re-creating the function with `>= 10`.

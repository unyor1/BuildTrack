# 20261023075625 — submit_checklist_qa message for away photos

| | |
|---|---|
| File | `supabase/migrations/20261023075625_away_photo_message.sql` |
| Written / applied | 2026-10-23 / recorded as `20261023075625` (UTC) via the Supabase connector |
| Depends on | `20261020072554_concurrent_checklist_qa.sql` (current `submit_checklist_qa`), `20261023075351_away_photo_counts.sql` |
| Status | Applied, verified |
| Reversible | Yes: re-run the `submit_checklist_qa` definition from `20261020072554` |
| SHA-256 | `e1eef433108b7dd7b874c5bb8cf36a05a20038ca6e00daa0092b9aaac5523deb` |

## Purpose

Follow-up to `20261023075351`. Away-from-site photos now count, but the Foreman's error from `submit_checklist_qa` still said "away-from-site or invalid-time photos do not count". The message now reads "Every submitted item requires eligible photo evidence; photos with a wrong phone clock or older than 3 days do not count".

## Objects changed

| Object | Change |
|---|---|
| `public.submit_checklist_qa(uuid,uuid[],text)` | Same body as the applied `20261020072554` version (local and live md5 `4736310bc7b23fee40ef29ae8a034007` matched before the change); only that one message differs. Generated from the applied file, not retyped. |

## Security and RLS

No logic, policy or grant change: still `security definer`, `search_path=''`, executable by `authenticated` and `service_role` only. Advisors unchanged (4 info, 90 warn, 1 auth).

## Verification

- `pnpm test:sql`: 432 passed; the away-photo case checks the full new message for a clock-ahead photo. Older cases match `/eligible photo/`, which the new text keeps.
- Live: new body md5 `28fd661b25a5acf962e6a0c5ab3282ee` equals the generated file; grants and settings unchanged; no public function still mentions "away-from-site" or "site and time".

## Rollback

Re-run the `create or replace function public.submit_checklist_qa` block from `20261020072554_concurrent_checklist_qa.sql`.

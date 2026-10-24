# 20261023075351 — away-from-site photos count as evidence

| | |
|---|---|
| File | `supabase/migrations/20261023075351_away_photo_counts.sql` |
| Written / applied | 2026-10-23 / recorded as `20261023075351` (UTC) via the Supabase connector |
| Depends on | `0039_photo_stamp.sql` (`stamp_flag`), `20261018124654` (`photo_eligible`, `evidence_image_allowed`, `guard_inspection_evidence_eligibility`), `20261018142455` (`submit_pin_qa`) |
| Status | Applied, verified |
| Reversible | Yes: re-create `photo_eligible` with `not in ('away_from_site','clock_ahead','old_photo')` and the two old messages. Submissions made while away photos counted stay as they are |
| SHA-256 | `461626dd0e12ef5b6a193e57dbbdf77f184dbb450b35c0f6b2b34a716f4b62a1` |

## Purpose

The owner decided that a photo flagged **Away from site** must still count as evidence: a phone at the site can report a wrong position, and the project's site centre or radius can be off. The flag and the distance stay on the record and on screen. Only a photo whose time cannot be trusted (phone clock ahead, or more than 3 days old) stays out.

## Objects changed

| Object | Change |
|---|---|
| `public.photo_eligible(text)` | Now `coalesce(p_flag not in ('clock_ahead','old_photo'), true)`. `away_from_site` is eligible, like `at_site`, `no_site_set`, `no_location` and unstamped photos. |
| `public.guard_inspection_evidence_eligibility()` | Same check; the message now says "needs a trusted time" instead of "site and time checks". |
| `public.submit_pin_qa(uuid,text)` | Same check; the message now says "with a trusted time" instead of "passes site and time checks". |

`photo_eligible` is the single rule behind every check: `submit_checklist_qa`, `submit_correction_package`, `submit_pin_qa`, `review_checklist_item`, the inspection evidence trigger and `evidence_image_allowed`. Those functions are unchanged and follow it.

## Security and RLS

- No policy or grant change. `create or replace` kept the grants: `photo_eligible` and `submit_pin_qa` stay executable by `authenticated` and `service_role` only.
- Engineers can now open away-from-site photos in Storage (the restrictive policy uses `evidence_image_allowed`), because they review them as evidence. Wrong-time photos stay hidden from Engineers.
- The database still computes `stamp_flag` and `distance_m`; the browser never chooses them.

Security advisors after applying are unchanged: 4 info, 90 warn (the same existing authenticated RPCs), 1 auth setting.

## Verification

- `pnpm test:sql`: 432 passed, including `99-zzzzzzzzzzzzzzzzzz-away-photo-counts.cases.mjs`:
  - The rule: away, no location, no site set and unstamped photos count; clock ahead and old photos do not.
  - A photo 110 km away keeps its flag and distance and is enough to submit the item.
  - A phone clock ahead still cannot satisfy the item.
  - The Engineer can open the away photo in Storage; the wrong-time photo stays hidden.
- Two older cases that used an away photo as the "rejected" example now use a clock-ahead photo, so the rejection is still tested.
- A deliberate mutation (the old rule) failed the three new cases; the file was restored byte-for-byte.
- Live (read-only): the rule returns the expected values for every flag; all 13 work item photos are now eligible (one was away from site, 6.2 km); both messages updated; trigger present; grants unchanged.

## Rollback

```sql
create or replace function public.photo_eligible(p_flag text) returns boolean language sql immutable set search_path='' as $$
  select coalesce(p_flag not in ('away_from_site','clock_ahead','old_photo'),true);
$$;
```
Restore the two messages from `20261018124654` / `20261018142455` if wanted, roll back the follow-up `20261023075625` (message of `submit_checklist_qa`), and revert `photoEligible` in `src/lib/photoStamp.ts`.

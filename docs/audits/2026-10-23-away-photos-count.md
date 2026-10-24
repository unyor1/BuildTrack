# Away-from-site photos count as evidence — 2026-10-23

## Request

"away photo at loc must still count": a photo flagged **Away from site** must still count as evidence.

## What changed

- **Database** (`20261023075351_away_photo_counts.sql` and follow-up `20261023075625_away_photo_message.sql`, both applied, see `sql/20261023075351_away_photo_counts.md` and `sql/20261023075625_away_photo_message.md`):
  - `photo_eligible` no longer excludes `away_from_site`. Every submission check, the inspection photo check and the Engineer's photo access follow it.
  - The two error messages that mentioned the site check now speak only of a trusted time.
  - The follow-up changes only the `submit_checklist_qa` message, which said away-from-site photos do not count. Its body was generated from the applied file after the local and live hashes matched.
- **Screens** (`lib/photoStamp.ts`, same rule as SQL):
  - `photoEligible` counts away photos.
  - Engineers can open them; previously they could not.
  - The chip still reads "Away from site · distance", now amber (a warning) instead of red, and its details add "It still counts as evidence".
  - The "Check these photos" line separates "N were taken away from the site" from "N have a wrong time and do not count".
- **Hints:** the work item blocker (`workItemModel.ts`) and the correction form (`CorrectionForm.tsx`) now name only wrong-clock / older-than-3-days photos as not counting.
- **Unchanged:**
  - A photo with the phone clock ahead or more than 3 days old still does not count and stays hidden from Engineers.
  - The database still decides the flag and the distance; photos are never blocked from upload.

## Verification

- `pnpm test:sql`: 432 passed, including 4 new cases:
  - The rule for every flag.
  - A 110 km away photo submits the item.
  - A clock-ahead photo does not, with the new message.
  - The Engineer can open the away photo but not the clock-ahead one.
- Two older cases used an away photo as the rejected example; they now use a clock-ahead photo.
- `pnpm test:lib`: 117 passed: chip tone and detail, summary wording, and `photoEligible` / `photoPreviewBlocked` per flag.
- `test-work-item-evidence` now uses a clock-ahead photo for the Engineer restriction check.
- A deliberate mutation back to the old rule failed the new SQL cases; the source was restored byte-for-byte.
- Live:
  - The rule checked per flag; all 13 work item photos now count (one was away, 6.2 km).
  - The `submit_checklist_qa` body hash matches the file, and the other two functions carry the new messages. Grants and trigger are unchanged.
  - No function still mentions the site check; advisors unchanged.
- Full `pnpm check` passed.

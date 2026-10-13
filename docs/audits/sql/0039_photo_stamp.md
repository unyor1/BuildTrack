# 0039: Time and place stamp on site photos

| Field | Value |
|---|---|
| File | `supabase/migrations/0039_photo_stamp.sql` |
| Applied | 2026-10-13, by the agent through the BUILDTRACK_MIGRATIONS connector |
| Depends on | 0003, 0010, 0025, 0033 |
| Status | **Applied** and verified (SQL tests, columns / triggers / privileges checked live, advisors) |
| Reversible | Yes (drop the two triggers, two functions and the new columns; photo rows keep working) |

## Why
Loophole L2 in `docs/BUILDTRACK_INTEGRITY_NOTES.md`: a photo could come from anywhere at any time. Software cannot prove a photo is real, but it can record where and when the phone says it was taken, check that against the site, and make a mismatch visible.

## What changed
- `projects.site_lat`, `site_lng` (both or neither), `site_radius_m` (20-5,000 m, default 150). Set in Admin > Project Management ("Site location", with a "Use my current location" button). Only people who may update projects can change them.
- `pin_photos` and `qa_photos`: `taken_at`, `lat`, `lng` (both or neither), `accuracy_m` come from the phone; `distance_m` and `stamp_flag` are **computed by a trigger** (`stamp_evidence_photo`) and cannot be sent by the browser (QA photos use column grants; the trigger overwrites anything sent for pin photos). Rows are immutable (no update policy).
- Flags, in order: `clock_ahead` (phone time more than 10 minutes in the future), `old_photo` (phone time more than 3 days before upload), `no_location`, `no_site_set`, `at_site` (distance minus the GPS accuracy, capped at 100 m, is within the radius), `away_from_site`. A photo taken offline a few hours ago is normal; the server time `created_at` is always the real upload time.
- A photo is **never blocked** (offline field work must keep working). `distance_m(lat1, lng1, lat2, lng2)` is the haversine formula.

## App
`src/lib/photoStamp.ts` (`captureStamp` asks the phone; pure `stampFields`, `stampLabel`, `stampSummary`, tested), `components/StampChip.tsx` on pin photos and in the QA photo viewer, a warning line over a photo set that has failures, and the stamp travels in the offline queue. The privacy notice names the location data and `PRIVACY_VERSION` is now `2026-10-13`.

## Limits (be honest in the defense)
GPS and phone clocks can be faked by a determined person; the stamp raises the bar and keeps a record of the attempt. It does not prove a photo was taken live. Location is personal data: it is only requested when a photo is added, only used for this check, and the person can refuse (the photo is then marked "No location").

## Tests
`supabase/tests/99-photo-stamp.cases.mjs`: distance maths, at site, away, accuracy forgiveness and its cap, no location, no site, clock tricks, offline photo not flagged, spoofed flag overwritten, bad coordinates refused, immutability, who may set the site, QA photos.

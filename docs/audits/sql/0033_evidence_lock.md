# 0033, 0035 and 0037: Evidence lock

| Field | Value |
|---|---|
| Files | `supabase/migrations/0033_evidence_lock.sql`, `0035_history_photo_removed.sql`, `0037_evidence_check_visibility.sql` |
| Applied | 2026-10-13, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Depends on | 0001-0032 |
| Status | **Applied** and verified (SQL tests, live trigger/policy check, security advisors: no new kind of finding) |
| Reversible | Yes (drop the triggers and functions, restore the old storage delete policy and `get_sheet_history`) |

## Purpose
Closes loophole L3 in `docs/BUILDTRACK_INTEGRITY_NOTES.md`: before this, the uploader (any time) or an admin with `blueprints.manage` could delete pin photos after the work was verified, and nothing was logged.

## Rules
- A pin is **evidence** once it is `for_review` or `verified`, or ever was (its timeline has a status change to one of those; un-verifying clears `verified_at`, the timeline is kept). `pin_has_evidence(pin)`.
- An evidence pin cannot be deleted, also not through a sheet or project delete (cascade): trigger `pins_evidence_lock`. The editor says so before asking to delete a sheet.
- Its photos cannot be deleted by anyone: trigger `pin_photos_evidence_lock`. New photos can still be added (each one is on the timeline, as before).
- Every photo removal that is still allowed is written to the timeline as `photo_removed` (trigger `pin_photos_removed_event`); 0035 makes the sheet history call it "Removed a photo from pin ..." instead of filing it under the checklist.
- Storage: a `pin-photos` file can only be removed when no record points to it (`pin_photo_in_use`, used by the storage delete policy).
- 0037: `pin_has_evidence` answers only about pins the caller may see (outsiders get `false`); internal calls without a signed-in user keep the full check.

## UI
`usePinEvidence` (`lib/blueprints.ts`) hides the remove button and shows "Evidence locked" under the photos; `BlueprintEditor` explains why a sheet holding evidence cannot be deleted.

## Tests
`supabase/tests/99-evidence-lock.cases.mjs` (fresh vs submitted, sent back, verified then un-verified, admins included, storage guard, cascade, history wording, visibility). Older tests in `30-pins` and `80-editor-v2` that expected verified pins / their photos / their sheets to be deletable now expect the refusal.

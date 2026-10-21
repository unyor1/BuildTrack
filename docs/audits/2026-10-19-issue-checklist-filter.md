# Checklist selection and filtering for site issues

## User-facing changes

- **Engineer > Issue Register > Log an issue** now includes **Checklist item** directly below Work pin. It loads only that pin's real `pin_checklist_items` records.
- **Whole work pin / no specific checklist item** remains available for general issues and pins without checklist items. Changing the work pin clears the old checklist selection. Loading failures block submission and offer Retry rather than silently losing the link.
- **Issue Register** has **All checklist items**, **Whole work pin / no checklist**, and saved checklist-name filters. Names are grouped ignoring case/repeated whitespace across pins, while each logged issue keeps its actual item ID and original name.
- A matching pin's summary shows the latest observation for the selected checklist, not a newer unrelated checklist's description. CSV exports include the matching checklist name. Search also includes checklist names.
- Engineer and Foreman issue details display the saved checklist name for each observation, alongside its own photos and description. Rename/deletion of the live checklist item does not erase the historical name.

This links the issue to a work checklist item; it does not auto-accept, uncheck, return or verify that item, and it does not bypass any existing pin/QA guards.

## Database

Applied migration: `supabase/migrations/20261019101438_site_issue_checklist_filter.sql` (CLI-created filename aligned to the hosted version).

- `site_issue_reports.checklist_item_id` is an optional FK to `pin_checklist_items`, `ON DELETE SET NULL`; `checklist_name` preserves the label as logged. A partial index supports the FK lookup.
- The six-argument `log_site_issue` RPC validates the item belongs to both the chosen pin and derived project, snapshots its name, and records it in the immutable pin timeline. Invalid choices roll back the entire log transaction.
- The sixth parameter is required at the SQL signature level (may be null), keeping named PostgREST dispatch unambiguous. The original five-argument/default-photo signature remains a compatible security-invoker wrapper around the checked implementation.
- Both signatures reject anonymous callers. The new implementation preserves explicit signed-in/project-Engineer authorization. RLS, direct-write denial, atomic photo attachments and existing QA status guards are unchanged. Advisor categories/counts remain unchanged; the old definer body was replaced by an invoker wrapper rather than adding another privileged public path.
- No checklist item is guessed for an old report; existing whole-pin issues and all their photo history stay unchanged.

## Verification

- `pnpm check`: TypeScript, 107 helper tests, comparison interactions, actual photo-editor and Log issue form-handler tests, 381 SQL tests, production build.
- UI interaction tests cover correct options, saved item ID, clearing on pin change, stale/wrong-pin rejection, loading/error guard and Retry.
- Helper tests cover general/legacy issues, grouped checklist names, deleted-item snapshots, and ensuring a FLOOR filter cannot display a later WALL description.
- SQL tests cover real item IDs/name snapshots/Foreman visibility, wrong-pin and wrong-project rejection, transactional rollback, idempotent retry, legacy and general requests, rename/deletion history retention, and unchanged direct-write/role restrictions.
- Live checks verified both columns, signature/default counts, RPC privileges and unchanged existing rows. A live rollback-only Engineer smoke test saved the selected item, label and timeline successfully, then rolled back all temporary records.

Database update is already applied. Application changes remain local, uncommitted and unpushed with the preceding work.

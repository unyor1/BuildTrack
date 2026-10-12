# 0025: Quality assurance, inspections and defect log

| Field | Value |
|---|---|
| File | `supabase/migrations/0025_qa_module.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `qa_module` |
| Depends on | 0001-0024 (uses `notify_user`, `system_settings`, `storage_project_id`, `can_*` helpers) |
| Status | **Applied** and verified (rolled-back live flow, advisors reviewed) |
| Reversible | Yes, see Rollback (drops QA data) |

## Purpose
Construction QA/QC the way a Philippine contractor runs it: an Inspection and Test Plan (checklist per trade), Requests for Inspection (IR) by the foreman, inspection by the engineer with measurements, evidence photos and a weighted score, Non-Conformance Reports (NCR) for every failed item, corrective and preventive action (CAPA) by the foreman, verification and closure by the engineer, and a trail nobody can edit.

## Objects
| Type | Name | Notes |
|---|---|---|
| Tables | `qa_templates`, `qa_template_items` | `project_id` null = company library (Super Admin only); otherwise a project copy (project engineers). Items: severity critical/major/minor, kind check/measure (unit, min, max), clause reference (free text, never invented), `requires_photo`, `hold_point` |
| Table | `qa_counters` + `next_qa_number()` | IR-0001 / NCR-0001 numbering per project, race-free upsert |
| Tables | `qa_inspections`, `qa_inspection_items` | the checklist is **copied** into the inspection (snapshot); score, pass mark and weights are copied on completion so later setting changes never rewrite history |
| Tables | `qa_defects`, `qa_defect_events` | NCR with category, severity, trade, reference, assignee (a project foreman), due date by severity (critical 3 d, major 7 d, minor 14 d), root cause, corrective + preventive action, verification note; events written only by the functions |
| Table + bucket | `qa_photos`, private bucket `qa-evidence` | staff of the project only (clients never), JPEG/PNG/WebP up to 8 MB, path must start with the project id, photos only while the inspection is in progress / the defect is not closed; evidence of a finished inspection cannot be removed |
| RPC | `save_qa_template`, `archive_qa_template`, `duplicate_qa_template` | company library = Super Admin with MFA; project lists = engineers of the project; built-ins are read-only, duplicate to adapt |
| RPC | `request_inspection` | foreman or engineer of the project; notifies the project engineers |
| RPC | `start_inspection`, `save_inspection_item`, `complete_inspection`, `cancel_inspection` | engineer only; a measurement outside min/max is a failure whatever was ticked; a fail needs a reason, N/A needs a reason; a photo-required item blocks completion until it has evidence; `complete_inspection` computes the result and raises one NCR per failed item (assigned to the pin's assignee or the requesting foreman) |
| RPC | `request_reinspection` | failed or conditional inspections only, one at a time; copies the failed items only |
| RPC | `raise_defect`, `edit_defect` | manual NCR; assignee must be a foreman of the project |
| RPC | `update_defect` | foreman (or engineer): open -> in progress -> for verification; needs a corrective action of 10+ characters, and a photo of the corrected work for major and critical defects |
| RPC | `verify_defect` | engineer only; close or send back, with a note of 5+ characters |
| RPC | `generate_defect_reminders` | due-soon and overdue notices for the caller's own defects, once a day per defect |
| RPC | `get_qa_summary` | first-pass rate, average score, open/critical/overdue defects, days to close, defects per 100 items checked, per trade, recent inspections; callable by anyone who can see the project (clients get numbers only because the tables are staff-only) |
| Function | `is_staff()` | active engineer, foreman, admin or Super Admin (used by the RLS policies so clients are blind) |

## Scoring rule
Score = passed weight / (passed + failed weight) x 100, N/A excluded; weights and pass mark come from **Admin > System settings** (defaults critical 5, major 3, minor 1; 90 %).
- **Passed**: no failed item.
- **Conditional**: score at or above the pass mark, no failed critical item, no failed hold point (items to fix, work may continue).
- **Failed**: anything else.
Hold points are the items work may not continue past (shoring, rebar, grounding, hydro test, flood test...); a failed one always fails the inspection.

## Built-in checklists (10) and standards
Pre-pour structural concrete, reinforcing steel receiving, footing excavation, CHB masonry, electrical rough-in, plumbing and sanitary, fire protection and life safety, waterproofing, architectural finishes, site safety walk (80 items). Standards named: NSCP 2015, PD 1096, PEC 2017, RA 1378 (Plumbing Code), RA 9514 (Fire Code), DOLE D.O. 13, RA 11058, BP 344, PNS 49, ASTM C143 / C31 / C39. **No clause numbers are written in** (they would be guesses); engineers add the exact clause in the item's reference when they copy a list into their project. The nine codes are also placed in the `standards` setting if it was empty.

## Row level security
- All QA tables are read-only to the API (`select` for staff of the project). Every change goes through the functions above, which check the role themselves. Clients and outsiders read nothing but the summary numbers. Disabled people lose access at once.
- `qa_counters` has RLS and no policy on purpose (nobody reads it directly).
- Storage policies (`qa-evidence`): select = staff who can view the project; insert = people who can report on the project; delete = uploader or `blueprints.manage`.

## Tests (`supabase/tests/99-qa-inspections.cases.mjs`, suite 213/213)
Library seeded and visibility per role; no direct writes; template permissions (engineer / Super Admin / built-in read-only / duplicate / archive); measure tolerance rules; request + numbering + notifications; snapshot immutability; start/permissions; measurement decides pass or fail; fail and N/A need a reason; required photo blocks completion; weighted score and conditional result; threshold snapshot; due date by severity; completed inspection is frozen; critical failure and below-the-mark failure; all-N/A refused; cancel; re-inspection of failed items only; defect workflow (start first, CAPA text, photo for critical, send back, close, trail order `raised,status,status,rejected,status,closed`); trail not writable; manual NCR rules; reminders once a day; outsiders and clients blind; summary numbers; disabled accounts.

## Verification (2026-10-11, live)
Seeded counts read back (10 templates, 80 items, 9 standards, bucket present). Rolled-back flow as the real foreman then the real engineer: request, start, record results, summary. Functions executable by `authenticated` only (not `anon`). Advisors: the `authenticated_security_definer_function_executable` warnings are the intended RPCs (same pattern as earlier migrations); `rls_enabled_no_policy` for `qa_counters` is intended; leaked-password protection is still the owner's toggle.

## Rollback
```sql
drop policy "qa evidence: view" on storage.objects; drop policy "qa evidence: upload" on storage.objects; drop policy "qa evidence: delete" on storage.objects;
delete from storage.buckets where id = 'qa-evidence'; -- after emptying it in the dashboard
drop table public.qa_photos, public.qa_defect_events, public.qa_defects, public.qa_inspection_items, public.qa_inspections, public.qa_counters, public.qa_template_items, public.qa_templates cascade;
drop function public.save_qa_template(uuid, uuid, text, text, text, text[], jsonb), public.archive_qa_template(uuid, boolean), public.duplicate_qa_template(uuid, uuid, text),
  public.request_inspection(uuid, uuid, text, uuid, text, text), public.start_inspection(uuid), public.save_inspection_item(uuid, text, numeric, text), public.complete_inspection(uuid, text),
  public.request_reinspection(uuid, text), public.cancel_inspection(uuid, text), public.raise_defect(uuid, text, text, text, text, text, text, uuid, uuid, date),
  public.edit_defect(uuid, text, text, text, text, text, uuid, date), public.update_defect(uuid, text, text, text, text, text), public.verify_defect(uuid, boolean, text),
  public.generate_defect_reminders(), public.get_qa_summary(uuid), public.next_qa_number(uuid, text), public.check_qa_photo(), public.qa_weight(text, jsonb), public.qa_due_days(text), public.is_staff();
```

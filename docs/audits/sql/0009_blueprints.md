# 0009: Blueprints, revisions and private storage

| Field | Value |
|---|---|
| File | `supabase/migrations/0009_blueprints.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `blueprints_and_storage` |
| Depends on | 0001-0008 |
| Status | **Applied** and verified (RLS on, bucket private, live end-to-end rollback test passed) |
| Reversible | Yes (deletes all blueprints and their rows; stored files must be removed separately) |

## Purpose
Roadmap step 4. Engineers (and admins with `blueprints.manage`) upload plans exported from CAD as PDF / PNG / JPEG / WebP. A plan has numbered revisions; each keeps the original file and a PNG preview rendered in the browser (what the pin editor shows). CAD formats (DWG/DXF) are intentionally not accepted: they must be exported first.

## Objects
| Type | Name | Notes |
|---|---|---|
| Table | `blueprints` | project, title, level, discipline, created_by |
| Table | `blueprint_revisions` | revision number (set by the database), original `file_path`/`mime_type`/`size_bytes` (max 25 MB), `preview_path` + size, notes, uploader. Immutable |
| Functions | `can_view_project(pid)`, `can_edit_blueprints(pid)`, `storage_project_id(name)` | access helpers (signed-in only) |
| Triggers | `prepare_blueprint`, `prepare_blueprint_revision`, `block_row_update`, `log_row_change` | database decides revision number, project, uploader; paths must start with the project's folder; audit rows |
| Bucket | `blueprints` | private, 25 MB, PDF/PNG/JPEG/WebP only |

## Access rules
| Action | Who |
|---|---|
| View blueprints, revisions, files | everyone assigned to the project (incl. Client), admins with `projects.manage` or `blueprints.manage` (MFA) |
| Add blueprint / revision, edit details, upload files | Engineers assigned to the project; admins with `blueprints.manage` (MFA) |
| Delete blueprint (cascades revisions) and delete files | admins with `blueprints.manage` only |
| Edit a revision | nobody (history) |
Storage paths are `<project uuid>/<blueprint uuid>/<file>`; objects outside a real project folder are refused.

## Tests (`supabase/tests/20-blueprints.cases.mjs`, part of 68/68)
Revision numbering ignores client input; path spoofing rejected; invalid mime/size rejected; revisions immutable; outsiders, Foremen, Clients, pending users, admins without permission or MFA cannot add; visibility limited to project people; delete rules; audit rows; bucket settings; storage upload/view/delete rules.

## Known limits
- Deleting a blueprint removes database rows but not the stored files (the app removes files first; orphans can be cleaned from the dashboard).
- Previews are produced by the browser at upload time; a revision's preview cannot be regenerated server-side.

## Rollback
```sql
drop policy if exists "blueprint files: view" on storage.objects;
drop policy if exists "blueprint files: upload" on storage.objects;
drop policy if exists "blueprint files: delete" on storage.objects;
drop table if exists public.blueprint_revisions, public.blueprints cascade;
drop function if exists public.can_view_project(uuid), public.can_edit_blueprints(uuid), public.storage_project_id(text),
  public.prepare_blueprint(), public.prepare_blueprint_revision(), public.block_row_update(), public.log_row_change();
-- remove the bucket's files first in the dashboard, then: delete from storage.buckets where id = 'blueprints';
```

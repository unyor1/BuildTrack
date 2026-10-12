# 0019: Floating images, rotation, drag-to-reorder layers

| Field | Value |
|---|---|
| File | `supabase/migrations/0019_editor_images_reorder.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `editor_images_reorder` |
| Depends on | 0001-0018 |
| Status | **Applied** and verified (rolled-back live check, advisor reviewed) |
| Reversible | Yes, see Rollback |

## Purpose
Photos, vendor specs and logos can be dropped onto a sheet as full canvas elements (select, move, resize, rotate, lock, layer). The Layers panel can reorder everything by drag and drop.

## Objects
| Type | Name | Notes |
|---|---|---|
| Kind | `image` | `w` x `h` (percent of the sheet, 0.5-100, inside the sheet), optional caption in `text`; `annotation_image_valid` ties `image_path` to the image kind |
| Columns | `blueprint_annotations.image_path`, `.rotation` | path 10-300 chars; rotation -360..360 degrees (any positioned kind: image, shape, text box, symbol) |
| Storage | existing private `blueprints` bucket | files go to `<project>/<sheet>/img-*.webp|jpg`; the existing storage policies already allow Engineers and `blueprints.manage` admins to upload and project people to read |
| Trigger fn | `prepare_annotation` (replaced) | the image path must start with the sheet's project folder; the file cannot be swapped after creation |
| Trigger fns | `guard_annotation_lock`, `record_annotation_history` (replaced) | rotation is locked content; history says "Rotated a image" |
| RPC | `reorder_annotations(sheet, uuid[])` | whole order, bottom first, one transaction; refuses lists that do not match the sheet exactly (missing, duplicate or foreign ids); SECURITY DEFINER with an explicit `can_edit_blueprints` check; works on locked items (layer order is not content) |

## Notes
- Deleting an annotation does not delete its file (Undo may need it). Deleting a whole sheet removes the sheet's files from the editor (best effort).
- Image dimension limits and the 2000 px / WebP compression are applied in the browser before upload.

## Tests (`supabase/tests/95-editor-images.cases.mjs`, suite 155/155)
Image creation and defaults, invalid files / folders / sizes / bounds / rotation / points, rotation on other kinds, immutable file path, role matrix and visibility, lock rules including rotation, atomic reorder (dense order, wrong lists, wrong people, anonymous, locked items), history entries, cascade delete.

## Verification (2026-10-11, live, rolled back)
As the Super Admin: an image with caption and rotation created, `reorder_annotations` swapped two layers (image z 1, note z 0), an image pointing at another folder was refused. Nothing left behind. Advisor: `reorder_annotations` is a new intended SECURITY DEFINER RPC (checks the caller inside).

## Rollback
```sql
delete from public.blueprint_annotations where kind = 'image';
drop function if exists public.reorder_annotations(uuid, uuid[]);
alter table public.blueprint_annotations drop constraint annotation_image_valid, drop constraint annotation_kind_rules, drop constraint blueprint_annotations_kind_check;
alter table public.blueprint_annotations drop column image_path, drop column rotation;
-- then re-add the 0018 constraints and restore the 0018 versions of the three trigger functions.
```

# 0017: Advanced workspace editor (drawing tools, layers, locks, history)

| Field | Value |
|---|---|
| File | `supabase/migrations/0017_editor_v2.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `editor_v2` |
| Depends on | 0001-0016 |
| Status | **Applied** and verified (columns, triggers, RLS on `sheet_history`, grants, advisor, rolled-back live check) |
| Reversible | Yes, see Rollback (the old note/shape rules can be restored) |

## Purpose
Backs Milestone 1: pen, highlighter, text boxes, polyline and area measurement, Canva-style layering (front / back / forward / backward, opacity), locks for the base layer and for single components, and an edit history.

## Objects
| Type | Name | Notes |
|---|---|---|
| Columns | `blueprint_annotations.points / stroke / opacity / z_index / locked / font_size` | points are `[[x,y],...]` in percent of the sheet; stroke and font size are percent of the sheet width so they scale with the plan |
| Kinds | `text`, `draw`, `highlight`, `polyline`, `area` (plus `note`, `shape`) | one rule constraint `annotation_kind_rules` decides which fields each kind may have (draw/highlight 2-600 points, polyline 2-300, area 3-300) |
| Colors | added `yellow`, `black` | |
| Column | `pins.locked`, `blueprints.base_locked` | |
| Function | `valid_points(jsonb)` | pure check used by a CHECK constraint (execute kept for `authenticated`) |
| Trigger | `prepare_annotation` (replaced) | new items get `z_index = top` from the database (a client-sent value is ignored); defaults for stroke/font size; x / y always mirror the top-left of the drawing |
| Triggers | `blueprint_annotations_lock`, `pins_lock`, `blueprints_lock`, `blueprint_revisions_lock` | locks are enforced in the database (see below) |
| Table | `sheet_history` | closed to API roles (RLS on, no policy, all privileges revoked); read only through `get_sheet_history()`. The advisor lists it as INFO "RLS enabled, no policy": intentional |
| Triggers | `blueprint_annotations_history`, `pins_history`, `blueprints_history` | write human-readable entries (added, moved, resized, edited text, restyled, locked, unlocked, deleted) |
| RPC | `move_annotation_layer(id, 'front'/'back'/'forward'/'backward')` | renumbers the sheet 0..n-1 atomically (rows locked `for update`), refuses non-editors, logs once |
| RPC | `set_sheet_items_locked(blueprint, locked)` | lock / unlock every annotation and pin of a sheet |
| RPC | `get_sheet_history(blueprint, limit)` | annotation and lock history plus the existing pin timeline, newest first, max 300; never for Clients or outsiders |

## Lock rules (database-enforced)
- Locked annotation: position, size, points, text, color, opacity, stroke, font size and deletion are refused. Layer order may still change. Unlocking is an ordinary update by an editor.
- Locked pin: position, title, description, category and deletion are refused. Status changes, assignment, deadline, verification and Foreman progress reports continue.
- Base layer (`blueprints.base_locked`): new revisions and scale changes are refused; the title can still change.
- Deleting a whole sheet or project still cascades through locked items (guards only apply to direct deletes, `pg_trigger_depth() = 1`).

## Access
Same as before: Engineers assigned to the project and admins with `blueprints.manage` (MFA) create, edit, lock and layer. Foremen and Clients read only. History: Engineers, Foremen and admins who can see the project.

## Tests (`supabase/tests/80-editor-v2.cases.mjs`, suite 136/136)
All new kinds and defaults, invalid data (points, ranges, text on strokes, styles, kinds), z_index ownership, drawing moves, role matrix, every layer action and edge, locks for annotations / pins / base layer, bulk lock, Foreman progress on a locked pin, cascade delete with locked items, history content / order / limit / audience, closed table and internal functions.

## Verification (2026-10-09, live, rolled back)
As the Super Admin on the real project: text box, freehand stroke and highlighter created, bring-to-front produced z 0,1,2, a locked stroke refused a colour change, bulk unlock ran, history returned 7 entries. Afterwards 0 test sheets, 0 history rows, 0 annotations. Advisor: `get_sheet_history`, `move_annotation_layer`, `set_sheet_items_locked` are SECURITY DEFINER RPCs callable by signed-in users on purpose (each checks the caller inside), plus the INFO above.

## Rollback
```sql
drop trigger if exists blueprint_annotations_history on public.blueprint_annotations;
drop trigger if exists blueprint_annotations_lock on public.blueprint_annotations;
drop trigger if exists pins_history on public.pins; drop trigger if exists pins_lock on public.pins;
drop trigger if exists blueprints_history on public.blueprints; drop trigger if exists blueprints_lock on public.blueprints;
drop trigger if exists blueprint_revisions_lock on public.blueprint_revisions;
drop function if exists public.move_annotation_layer(uuid, text), public.set_sheet_items_locked(uuid, boolean), public.get_sheet_history(uuid, integer);
drop table if exists public.sheet_history;
delete from public.blueprint_annotations where kind not in ('note', 'shape');
-- then drop the new columns / constraints and restore the 0014 versions of prepare_annotation() and the kind checks.
```

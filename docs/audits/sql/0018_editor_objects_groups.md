# 0018: Editor objects, groups and atomic multi-item moves

| Field | Value |
|---|---|
| File | `supabase/migrations/0018_editor_objects_groups.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `editor_objects_groups` |
| Depends on | 0001-0017 |
| Status | **Applied** and verified (rolled-back live check, advisor: no new findings) |
| Reversible | Yes, see Rollback |

## Purpose
Backs the workspace phases B and C: more drawing objects, grouping, and multi-select operations (drag many, align, distribute, undo) that must succeed or fail as one unit.

## Objects
| Type | Name | Notes |
|---|---|---|
| Columns | `blueprint_annotations.group_id`, `.symbol` | group id is a client-chosen uuid shared by the members; symbol is a key from a fixed library |
| Kinds | `arrow` (exactly 2 points, optional label), `dimension` (exactly 2 points, no text; length is drawn on screen), `cloud` (3-60 corner points, optional label), `symbol` (`w` = size 0.5-30 % of the sheet width, inside the sheet) | `annotation_kind_rules` rewritten; `annotation_symbol_valid` ties `symbol` to the symbol kind and to the allowed keys (`north_arrow`, `hazard`, `inspect`, `check`, `cross`, `equipment`, `crane`, `exit`, `fire_ext`, `first_aid`, `ppe`, `no_entry`) |
| Trigger fn | `prepare_annotation` (replaced) | stroke defaults and bounding-box x/y for the new line kinds |
| Trigger fn | `guard_annotation_lock` (replaced) | a locked item also keeps its symbol; `group_id` may change while locked (grouping is not content) |
| Trigger fn | `record_annotation_history` (replaced) | names the new objects; grouping creates no history noise |
| RPC | `move_annotations(jsonb)` | `[{id, x?, y?, points?}]`, 1-300 items, one transaction, runs as the caller (SECURITY INVOKER): row level security and lock triggers apply to every item, any refused item rolls back the whole batch |

## Access
Unchanged: Engineers on the project and admins with `blueprints.manage` (MFA) create, group and move; Foremen, Clients, outsiders and anonymous cannot (insert, group update, batch move).

## Tests (`supabase/tests/90-editor-v3.cases.mjs`, suite 146/146)
New kinds with defaults and bounding boxes, invalid point counts / symbol / sizes, role matrix, grouping incl. locked items, atomic batch move (including refusal by a locked item and by unknown ids, size limits, out-of-range points), history names, cascade delete, internal functions closed.

## Verification (2026-10-09, live, rolled back)
As the Super Admin: arrow, cloud, symbol and dimension created and grouped; `move_annotations` moved 2 items (an arrow followed its points: x 15); a batch containing a locked item was refused. Nothing left behind. Advisor: unchanged (the new function is SECURITY INVOKER, so it is not listed).

## Rollback
```sql
delete from public.blueprint_annotations where kind in ('arrow', 'dimension', 'cloud', 'symbol');
drop function if exists public.move_annotations(jsonb);
alter table public.blueprint_annotations drop constraint annotation_symbol_valid, drop constraint annotation_kind_rules, drop constraint blueprint_annotations_kind_check;
alter table public.blueprint_annotations drop column group_id, drop column symbol;
-- then re-add the 0017 constraints and restore the 0017 versions of the three trigger functions.
```

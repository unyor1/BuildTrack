# 0014: Workspace editor data (notes, shapes, checklists, scale, thumbnails)

| Field | Value |
|---|---|
| File | `supabase/migrations/0014_editor_data.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `editor_data` |
| Depends on | 0001-0013 |
| Status | **Applied** and verified (RLS on both new tables, columns exist, trigger functions not callable, advisor: only the intentional helpers) |
| Reversible | Yes (drops the two tables and two columns; the `pin_events` constraint can be narrowed again) |

## Purpose
Backs the full-screen blueprint editor: the toolbar's Notes/Callouts and Shape overlay, the Measuring Tape scale, a per-pin checklist in the inspector, and small thumbnails for the left sheet strip.

## Objects
| Type | Name | Notes |
|---|---|---|
| Column | `blueprints.scale_width_m` | real-world width (metres) of the whole sheet, 0 < value <= 100000; set when the engineer calibrates the tape; resolution independent |
| Column | `blueprint_revisions.thumb_path` | optional small preview; must live in the project folder (same rule as the other files) |
| Table | `blueprint_annotations` | `note` (text callout at x,y) or `shape` (`rect`/`ellipse`, x,y,w,h in percent, optional label); colors magenta/orange/blue/green/red/gray; DB checks shape/size consistency and bounds |
| Table | `pin_checklist_items` | pin_id, text (1-200), position (assigned by the database), done, done_by/done_at (set by the database) |
| Constraint | `pin_events_kind_check` | now also allows `checklist` (written by a trigger only; users still cannot insert it) |
| Triggers | `prepare_annotation`, `blueprint_annotations_audit`, `prepare_checklist_item`, `record_checklist_event` | project and creator set by the database; ticking an item writes a timeline entry ("Done: ..." / "Reopened: ...") |

## Access rules
| Action | Who |
|---|---|
| See annotations and checklists | everyone assigned to the project incl. Client (read-only); admins with projects/blueprints permissions (MFA) |
| Add / edit / delete annotations; set the sheet scale; add, rename, reorder, delete checklist items | Engineers assigned to the project; admins with `blueprints.manage` |
| Tick / untick checklist items | the above plus Foremen assigned to the project (a trigger rejects any other change from them) |
| Clients, outsiders, pending users, anonymous | read only / nothing |

## Tests (`supabase/tests/60-editor.cases.mjs`, suite 103/103)
Annotation creation and database-set fields; invalid shapes/notes/colors/bounds; who can add/edit/delete; visibility; kind/plan immutability; audit; checklist order and defaults; text limits; foreman may only tick; client/outsider cannot; timeline entries and client privacy; users cannot write `checklist` events; scale validation and permissions; thumbnail folder rule.

## Rollback
```sql
drop table if exists public.pin_checklist_items, public.blueprint_annotations cascade;
drop function if exists public.prepare_annotation(), public.prepare_checklist_item(), public.record_checklist_event();
alter table public.blueprints drop column if exists scale_width_m;
alter table public.blueprint_revisions drop column if exists thumb_path;
-- also restore the earlier prepare_blueprint_revision() (0009) and the pin_events kind check without 'checklist'.
```

## Live verification (2026-10-09, transaction rolled back)
As the Super Admin on the real project: note and ellipse saved, `scale_width_m = 48.5` saved, a checklist item ticked, and the ticking wrote one `checklist` timeline entry. No rows left behind.

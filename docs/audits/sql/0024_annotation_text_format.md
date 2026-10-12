# 0024: Text formatting on text boxes and notes

| Field | Value |
|---|---|
| File | `supabase/migrations/0024_annotation_text_format.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `annotation_text_format` |
| Depends on | 0001-0023 |
| Status | **Applied** and verified (read-only live checks, advisor reviewed) |
| Reversible | Yes, see Rollback |

## Purpose
The context bar can format text like a design tool: font, bold, italic, underline, strikethrough, case, alignment, list style, line and letter spacing. The settings live in one validated column so the table stays narrow.

## Objects
| Type | Name | Notes |
|---|---|---|
| Column | `blueprint_annotations.format jsonb not null default '{}'` | keys: `family` (Manrope, Poppins, Inter, Roboto, Playfair Display, Roboto Mono, Georgia, Arial), `bold` / `italic` / `underline` / `strike` (boolean), `transform` (none, uppercase, lowercase, capitalize), `align` (left, center, right, justify), `list` (none, bullet, number), `line_height` (0.8-3), `letter_spacing` (-0.1 to 0.5 em) |
| Function | `valid_text_format(jsonb)` | immutable; refuses unknown keys and wrong values |
| Constraints | `annotation_format_valid`, `annotation_format_kind` | only text boxes and notes may carry a non-empty format |
| Trigger fn | `guard_annotation_lock` (replaced) | `format` is locked content: a locked item cannot be re-formatted until it is unlocked |

## Tests (`supabase/tests/99-text-format.cases.mjs`, suite 194/194)
Default `{}`, valid format on a text box and a note, eleven invalid shapes refused, shapes and symbols refused, locked item cannot change format (and can after unlocking), foremen and clients cannot change it.

## Verification (2026-10-11, live, read-only)
Column and both constraints exist; `valid_text_format` accepts a valid format and refuses an unknown font and an unknown key. Advisor: no new findings.

## Rollback
```sql
alter table public.blueprint_annotations drop constraint annotation_format_kind, drop constraint annotation_format_valid, drop column format;
drop function public.valid_text_format(jsonb);
-- and restore guard_annotation_lock from 0019 (without new.format / old.format in the compared tuples)
```

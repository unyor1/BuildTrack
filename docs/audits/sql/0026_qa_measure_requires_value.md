# 0026: A measured item needs its measurement

| Field | Value |
|---|---|
| File | `supabase/migrations/0026_qa_measure_requires_value.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `qa_measure_requires_value` |
| Depends on | 0025 |
| Status | **Applied** and verified (read-only) |
| Reversible | Yes: re-create the function from 0025 |

## Purpose
In 0025 an engineer could mark a measured item (slump, concrete cover, pressure test, flood test) as pass or fail without typing the number. A record that says "pressure test: pass" without the pressure cannot be audited later. The function now refuses: "Enter the measured value". N/A and pending still need no value; a measurement outside the tolerance still turns the item into a failure by itself.

## Objects
`public.save_inspection_item(uuid, text, numeric, text)`: `create or replace`, same signature and grants (authenticated only).

## Tests
`supabase/tests/99-qa-inspections.cases.mjs` (suite 213/213): pass without a value refused, fail without a value refused, N/A without a value allowed; the other flows now send a value for measured items.

## Verification
Function body read back (contains the rule); `anon` cannot execute, `authenticated` can.

## Rollback
Re-create `save_inspection_item` from `0025_qa_module.sql` (without the line `if it.kind = 'measure' and res in ('pass','fail') and p_measured is null ...`).

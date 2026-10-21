-- Inspection and NCR evidence photos take the same markup overlay as client problem reports and site issues:
-- the stored file stays the untouched original, and text, lines, arrows, shapes and drawings are saved beside it as
-- JSON checked by valid_issue_markup (20261019095439). qa_photos has no UPDATE grant, so the markup is fixed once the
-- photo is recorded, like the rest of the evidence. Existing photos get an empty overlay.
alter table public.qa_photos
  add column annotations jsonb not null default '[]' check (public.valid_issue_markup(annotations));
grant insert (annotations) on public.qa_photos to authenticated;
notify pgrst, 'reload schema';

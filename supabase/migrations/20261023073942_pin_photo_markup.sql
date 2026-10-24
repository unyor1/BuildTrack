-- Work item / correction photos (pin_photos) take the same markup overlay as QA, client and site issue photos: the stored
-- file stays the untouched original and the markup is JSON checked by valid_issue_markup (optional rotation since
-- 20261021151557). pin_photos has no UPDATE policy, so markup is fixed once the photo is recorded. Submission snapshots copy
-- whole rows (to_jsonb), so submitted evidence keeps its markup. Existing photos get an empty overlay.
alter table public.pin_photos
  add column annotations jsonb not null default '[]' check (public.valid_issue_markup(annotations));
grant insert (annotations) on public.pin_photos to authenticated;
notify pgrst, 'reload schema';

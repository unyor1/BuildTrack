-- 0036: Row Level Security that scales. The read rules stay exactly the same; only how they are evaluated changes.
-- Before: every row called can_view_project(project_id) (a security-definer function with its own lookups), so reading 5,000 pins
-- took about 10 s in the load test (scripts/load-test.mjs). After: the set of projects the caller may see is computed once per query
-- (viewable_project_ids) and each row is a hash lookup; per-user checks that do not depend on the row (is_staff, auth.uid) are
-- wrapped in a sub-select so Postgres evaluates them once. Plus indexes for the orders the app pages by.

-- The projects the caller may see. Same rule as can_view_project, by definition.
create function public.viewable_project_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.projects p where public.can_view_project(p.id);
$$;

-- The projects where the caller is a client (same rule as is_project_client).
create function public.client_project_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.project_id from public.project_members m where m.user_id = auth.uid() and m.member_role = 'client';
$$;

revoke execute on function public.viewable_project_ids(), public.client_project_ids() from public, anon;
grant execute on function public.viewable_project_ids(), public.client_project_ids() to authenticated;

-- Plans and pins
drop policy "view blueprints" on public.blueprints;
create policy "view blueprints" on public.blueprints for select to authenticated
  using (project_id in (select public.viewable_project_ids()));
drop policy "view revisions" on public.blueprint_revisions;
create policy "view revisions" on public.blueprint_revisions for select to authenticated
  using (project_id in (select public.viewable_project_ids()));
drop policy "view annotations" on public.blueprint_annotations;
create policy "view annotations" on public.blueprint_annotations for select to authenticated
  using (project_id in (select public.viewable_project_ids()));
drop policy "view checklist" on public.pin_checklist_items;
create policy "view checklist" on public.pin_checklist_items for select to authenticated
  using (project_id in (select public.viewable_project_ids()));
drop policy "view pins" on public.pins;
create policy "view pins" on public.pins for select to authenticated
  using (project_id in (select public.viewable_project_ids()));
drop policy "view photos" on public.pin_photos;
create policy "view photos" on public.pin_photos for select to authenticated
  using (project_id in (select public.viewable_project_ids()));
drop policy "view timeline" on public.pin_events;
create policy "view timeline" on public.pin_events for select to authenticated
  using (project_id in (select public.viewable_project_ids()) and project_id not in (select public.client_project_ids()));

-- Reports and questions
drop policy "read reports" on public.daily_reports;
create policy "read reports" on public.daily_reports for select to authenticated
  using (project_id in (select public.viewable_project_ids()) and (author_id = (select auth.uid()) or status = 'submitted'));
drop policy "read questions" on public.project_questions;
create policy "read questions" on public.project_questions for select to authenticated
  using (project_id in (select public.viewable_project_ids()) and (author_id = (select auth.uid()) or project_id not in (select public.client_project_ids())));

-- QA (staff only)
drop policy "staff read inspections" on public.qa_inspections;
create policy "staff read inspections" on public.qa_inspections for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));
drop policy "staff read inspection items" on public.qa_inspection_items;
create policy "staff read inspection items" on public.qa_inspection_items for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));
drop policy "staff read defects" on public.qa_defects;
create policy "staff read defects" on public.qa_defects for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));
drop policy "staff read defect events" on public.qa_defect_events;
create policy "staff read defect events" on public.qa_defect_events for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));
drop policy "staff read evidence" on public.qa_photos;
create policy "staff read evidence" on public.qa_photos for select to authenticated
  using ((select public.is_staff()) and project_id in (select public.viewable_project_ids()));

-- Client reports
drop policy "read own or staff snags" on public.client_snags;
create policy "read own or staff snags" on public.client_snags for select to authenticated
  using ((author_id = (select auth.uid()) and (select public.is_active())) or ((select public.is_staff()) and project_id in (select public.viewable_project_ids())));

-- Indexes for the orders the app reads in pages
create index if not exists pins_project_created_idx on public.pins (project_id, created_at, id);
create index if not exists pin_events_status_idx on public.pin_events (kind, from_status, to_status);
create index if not exists qa_inspections_number_idx on public.qa_inspections (project_id, number desc);
create index if not exists qa_defects_number_idx on public.qa_defects (project_id, number desc);
create index if not exists client_snags_number_idx on public.client_snags (project_id, number desc);
create index if not exists pin_photos_project_idx on public.pin_photos (project_id, created_at desc);

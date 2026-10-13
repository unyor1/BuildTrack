-- 0034: live updates. Publishes the tables whose changes other people need to see at once (a foreman reports, the engineer's
-- queue updates; the engineer verifies, the client's progress moves; an inspection fails, the NCR appears for the foreman).
-- Supabase Realtime applies each table's Row Level Security to every listener, so nobody receives a row they cannot read.
-- Not published on purpose: profiles, identity, privacy, audit and admin tables (sensitive, and nothing needs them live).

do $$
declare
  t text;
  live text[] := array[
    'pins', 'pin_events', 'pin_photos',
    'qa_inspections', 'qa_inspection_items', 'qa_defects', 'qa_defect_events', 'qa_photos',
    'client_snags', 'daily_reports', 'project_questions', 'notifications'
  ];
begin
  -- The local test database has no Supabase publication; the migration is then a no-op.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array live loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

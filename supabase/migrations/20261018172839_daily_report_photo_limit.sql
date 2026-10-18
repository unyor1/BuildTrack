-- Daily report photos: the Foreman can attach up to 50 photos to one report (was 10). Same rules otherwise: author only, draft
-- only, uploads serialized with each other and with submit / reopen so the limit cannot be raced, project/report/file folder.
create or replace function public.prepare_daily_report_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.daily_reports;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() = 1 then
      select * into r from public.daily_reports where id = old.report_id for update;
      if r.status = 'submitted' then
        raise exception 'Photos of a submitted report cannot be removed. Ask an engineer to reopen it';
      end if;
    end if;
    return old;
  end if;
  -- Serialize uploads with each other AND with submit/reopen, so the limit cannot be raced.
  select * into r from public.daily_reports where id = new.report_id for update;
  if r.id is null or r.author_id is distinct from auth.uid() then
    raise exception 'Only the report author can add photos';
  end if;
  if r.status <> 'draft' then raise exception 'Photos can only be added to a draft report'; end if;
  if (select count(*) from public.daily_report_photos where report_id = r.id) >= 50 then
    raise exception 'A report can have at most 50 photos';
  end if;
  if new.path !~ ('^' || r.project_id::text || '/' || r.id::text || '/[^/]+$')
     or split_part(new.path, '/', 3) in ('.', '..') then
    raise exception 'The photo must use the project/report/file folder';
  end if;
  new.project_id := r.project_id;
  new.uploaded_by := auth.uid();
  return new;
end;
$$;

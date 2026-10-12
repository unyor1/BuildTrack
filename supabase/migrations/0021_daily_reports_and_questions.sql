-- 0021: Foreman daily reports (site logs) and Client questions.
--   * daily_reports: one report per author per day. Draft is private to its author; once submitted it is read-only and
--     visible to everyone on the project (Clients included). Engineers / admins can reopen a report (reopen_daily_report).
--     "workers_count" is a head count typed by the foreman, NOT attendance data.
--   * project_questions: a Client asks the team a question (optionally about a pin); an Engineer answers (answer_question).
--     A Client only ever sees their own questions; staff see all.
-- Both notify the right people through notify_user() (0020).

-- ---------------------------------------------------------------- daily reports
create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  report_date date not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  weather text not null default 'sunny' check (weather in ('sunny', 'cloudy', 'rainy', 'stormy')),
  workers_count integer not null default 0 check (workers_count between 0 and 5000),
  work_done text not null default '' check (char_length(work_done) <= 4000),
  issues text check (issues is null or char_length(issues) <= 2000),
  delays text check (delays is null or char_length(delays) <= 2000),
  safety text check (safety is null or char_length(safety) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, report_date, author_id)
);
create index daily_reports_project_idx on public.daily_reports (project_id, report_date desc);

create function public.prepare_daily_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    if new.report_date > today then raise exception 'A report cannot be dated in the future'; end if;
    if new.report_date < today - 14 then raise exception 'Reports can only be written for the last 14 days'; end if;
    if new.status = 'submitted' then
      if btrim(new.work_done) = '' then raise exception 'Describe the work done before submitting'; end if;
      new.submitted_at := now();
    end if;
    return new;
  end if;
  -- update
  if new.project_id is distinct from old.project_id or new.report_date is distinct from old.report_date or new.author_id is distinct from old.author_id then
    raise exception 'The project, date and author of a report cannot change';
  end if;
  if old.status = 'submitted' then
    if not (new.status = 'draft' and current_setting('app.reopening', true) = '1') then
      raise exception 'A submitted report cannot be edited. Ask an engineer to reopen it';
    end if;
    new.submitted_at := null;
  elsif new.status = 'submitted' then
    if btrim(new.work_done) = '' then raise exception 'Describe the work done before submitting'; end if;
    new.submitted_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger daily_reports_prepare before insert or update on public.daily_reports
  for each row execute function public.prepare_daily_report();

create function public.trg_notify_daily_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    for r in select pm.user_id from public.project_members pm where pm.project_id = new.project_id and pm.member_role = 'engineer' and pm.user_id is distinct from new.author_id loop
      perform public.notify_user(r.user_id, 'report.submitted', 'Daily report: ' || to_char(new.report_date, 'Mon DD'), 'By ' || public.display_name(new.author_id),
        '/engineer/reports?project=' || new.project_id, new.project_id, new.id, 'report-' || new.id || '-' || floor(extract(epoch from new.submitted_at) * 1000000)::bigint);
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'submitted' and new.status = 'draft' then
    perform public.notify_user(new.author_id, 'report.reopened', 'Report reopened: ' || to_char(new.report_date, 'Mon DD'), 'An engineer asked you to review it',
      '/foreman/daily-report?project=' || new.project_id, new.project_id, new.id);
  end if;
  return new;
end;
$$;
create trigger daily_reports_notify after insert or update on public.daily_reports
  for each row execute function public.trg_notify_daily_report();

alter table public.daily_reports enable row level security;
create policy "read reports" on public.daily_reports
  for select to authenticated using (public.can_view_project(project_id) and (author_id = auth.uid() or status = 'submitted'));
create policy "write own report" on public.daily_reports
  for insert to authenticated with check (author_id = auth.uid() and public.can_report_on_project(project_id) and public.is_active());
create policy "edit own draft" on public.daily_reports
  for update to authenticated using (author_id = auth.uid() and status = 'draft' and public.can_report_on_project(project_id))
  with check (author_id = auth.uid() and public.can_report_on_project(project_id));
create policy "delete own draft" on public.daily_reports
  for delete to authenticated using (author_id = auth.uid() and status = 'draft');
revoke all on public.daily_reports from anon, authenticated;
grant select, delete on public.daily_reports to authenticated;
grant insert (project_id, report_date, weather, workers_count, work_done, issues, delays, safety, status) on public.daily_reports to authenticated;
grant update (weather, workers_count, work_done, issues, delays, safety, status) on public.daily_reports to authenticated;

-- An engineer of the project (or an admin with blueprints.manage) sends a submitted report back to its author.
create function public.reopen_daily_report(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.daily_reports;
begin
  select * into r from public.daily_reports where id = p_id;
  if r.id is null or not public.can_edit_blueprints(r.project_id) then
    raise exception 'Report not found or you are not allowed to reopen it';
  end if;
  if r.status <> 'submitted' then raise exception 'Only a submitted report can be reopened'; end if;
  perform set_config('app.reopening', '1', true);
  update public.daily_reports set status = 'draft' where id = p_id;
  perform set_config('app.reopening', '0', true);
end;
$$;

-- ---------------------------------------------------------------- client questions
create table public.project_questions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  pin_id uuid references public.pins (id) on delete set null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 3 and 1000),
  answer text check (answer is null or char_length(btrim(answer)) between 1 and 2000),
  answered_by uuid references auth.users (id) on delete set null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index project_questions_project_idx on public.project_questions (project_id, created_at desc);

create function public.prepare_question()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := auth.uid();
  new.answer := null;
  new.answered_by := null;
  new.answered_at := null;
  if new.pin_id is not null and not exists (select 1 from public.pins where id = new.pin_id and project_id = new.project_id) then
    raise exception 'That pin is not part of this project';
  end if;
  if (select count(*) from public.project_questions where author_id = new.author_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have asked many questions today. Please wait for answers';
  end if;
  return new;
end;
$$;
create trigger project_questions_prepare before insert on public.project_questions
  for each row execute function public.prepare_question();

create function public.trg_notify_question()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select pm.user_id from public.project_members pm where pm.project_id = new.project_id and pm.member_role = 'engineer' loop
    perform public.notify_user(r.user_id, 'question.new', 'Client question', left(new.question, 200), '/engineer/reports?project=' || new.project_id || '&tab=questions', new.project_id, new.id);
  end loop;
  return new;
end;
$$;
create trigger project_questions_notify after insert on public.project_questions
  for each row execute function public.trg_notify_question();

alter table public.project_questions enable row level security;
create policy "read questions" on public.project_questions
  for select to authenticated using (public.can_view_project(project_id) and (author_id = auth.uid() or not public.is_project_client(project_id)));
create policy "clients ask" on public.project_questions
  for insert to authenticated with check (author_id = auth.uid() and public.is_project_client(project_id) and public.is_active());
revoke all on public.project_questions from anon, authenticated;
grant select on public.project_questions to authenticated;
grant insert (project_id, pin_id, question) on public.project_questions to authenticated;

create function public.answer_question(p_id uuid, p_answer text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  q public.project_questions;
begin
  select * into q from public.project_questions where id = p_id;
  if q.id is null or not public.can_edit_blueprints(q.project_id) then
    raise exception 'Question not found or you are not allowed to answer it';
  end if;
  if btrim(coalesce(p_answer, '')) = '' or char_length(btrim(p_answer)) > 2000 then
    raise exception 'Write an answer of up to 2000 characters';
  end if;
  update public.project_questions set answer = btrim(p_answer), answered_by = auth.uid(), answered_at = now() where id = p_id;
  perform public.notify_user(q.author_id, 'question.answered', 'Your question was answered', left(btrim(p_answer), 200), '/client/communication?project=' || q.project_id, q.project_id, q.id);
end;
$$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.prepare_daily_report(), public.trg_notify_daily_report(), public.prepare_question(), public.trg_notify_question()
  from public, anon, authenticated;
revoke execute on function public.reopen_daily_report(uuid), public.answer_question(uuid, text) from public, anon;
grant execute on function public.reopen_daily_report(uuid), public.answer_question(uuid, text) to authenticated;

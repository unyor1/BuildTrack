-- 0028: Email copies of notifications (sent through Brevo by the Edge Function `send-notifications`).
--   * Every notification can also be emailed. Each person can switch it off (notification_prefs, default ON).
--   * The database keeps the queue: claim_email_batch() picks what is due (skips people who opted out, are not active, or have already
--     received 20 emails in 24 hours; those rows are closed with a note, never retried), mark_email_result() records the outcome.
--   * email_log is written only by those functions and readable by nobody through the API (service role / owner only).
--   * History is not emailed: every notification that exists today is marked as handled.

alter table public.notifications add column emailed_at timestamptz, add column email_attempts smallint not null default 0;
update public.notifications set emailed_at = now() where emailed_at is null;
create index notifications_to_email_idx on public.notifications (created_at) where emailed_at is null;

create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
create policy "read own prefs" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "add own prefs" on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "change own prefs" on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_prefs from anon, authenticated;
grant select on public.notification_prefs to authenticated;
grant insert (user_id, email_enabled) on public.notification_prefs to authenticated;
grant update (email_enabled) on public.notification_prefs to authenticated;

create function public.touch_notification_prefs()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger notification_prefs_touch before update on public.notification_prefs for each row execute function public.touch_notification_prefs();

create table public.email_log (
  id bigint generated always as identity primary key,
  notification_id uuid references public.notifications (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  detail text check (detail is null or char_length(detail) <= 300),
  created_at timestamptz not null default now()
);
create index email_log_user_idx on public.email_log (user_id, created_at desc);
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;

create function public.claim_email_batch(p_limit integer default 25)
returns table (id uuid, user_id uuid, kind text, title text, body text, link text, to_email text, to_name text)
language plpgsql security definer set search_path = '' as $$
begin
  -- Close what must not be sent (opted out, not active, no email address, over the daily cap), with the reason.
  with skipped as (
    update public.notifications n set emailed_at = now()
    where n.emailed_at is null and n.created_at > now() - interval '2 days'
      and (
        not exists (select 1 from public.profiles p where p.id = n.user_id and p.status = 'active' and nullif(btrim(p.email), '') is not null)
        or coalesce((select np.email_enabled from public.notification_prefs np where np.user_id = n.user_id), true) = false
        or (select count(*) from public.email_log l where l.user_id = n.user_id and l.status = 'sent' and l.created_at > now() - interval '24 hours') >= 20
      )
    returning n.id, n.user_id
  )
  insert into public.email_log (notification_id, user_id, status, detail)
  select s.id, s.user_id, 'skipped', 'opted out, not active, or daily limit reached' from skipped s;
  -- Very old rows are closed quietly (an outage must not email last week's news).
  update public.notifications n set emailed_at = now() where n.emailed_at is null and n.created_at <= now() - interval '2 days';

  return query
  with picked as (
    select n.id from public.notifications n
    where n.emailed_at is null and n.email_attempts < 3
    order by n.created_at limit greatest(1, least(p_limit, 100))
    for update skip locked
  ), bumped as (
    update public.notifications n set email_attempts = n.email_attempts + 1 from picked where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.title, n.body, n.link
  )
  select b.id, b.user_id, b.kind, b.title, b.body, b.link, p.email, p.full_name
  from bumped b join public.profiles p on p.id = b.user_id;
end;
$$;

create function public.mark_email_result(p_id uuid, p_ok boolean, p_detail text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare n public.notifications;
begin
  select * into n from public.notifications where id = p_id;
  if n.id is null then return; end if;
  if p_ok then update public.notifications set emailed_at = now() where id = p_id; end if;
  insert into public.email_log (notification_id, user_id, status, detail) values (p_id, n.user_id, case when p_ok then 'sent' else 'failed' end, left(p_detail, 300));
  -- three failed attempts close the row so it is not retried forever
  if not p_ok and n.email_attempts >= 3 then update public.notifications set emailed_at = now() where id = p_id; end if;
end;
$$;

revoke execute on function public.claim_email_batch(integer), public.mark_email_result(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_email_batch(integer), public.mark_email_result(uuid, boolean, text) to service_role;

revoke execute on function public.touch_notification_prefs() from public, anon, authenticated; -- applied right after the migration (trigger function, not an API)

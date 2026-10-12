-- 0022: System settings (one place for numbers the whole product uses) and the inactive-accounts report.
--   * system_settings: key -> jsonb. Every active person can READ (the app shows thresholds and working hours); only a Super Admin
--     with MFA can WRITE, and only through set_setting(), which validates each key and writes the audit log.
--   * get_inactive_users(): accounts that have not signed in for N days (needs users.view). Used by the Access review page.
-- The QA module will read qa.acceptance_threshold, qa.weights and standards from here.

create table public.system_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{2,60}$'),
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;
create policy "active people read settings" on public.system_settings for select to authenticated using (public.is_active());
revoke all on public.system_settings from anon, authenticated;
grant select on public.system_settings to authenticated;

insert into public.system_settings (key, value, description) values
  ('qa.acceptance_threshold', '90'::jsonb, 'Minimum weighted score (percent) for an inspection to pass'),
  ('qa.weights', '{"critical":5,"major":3,"minor":1}'::jsonb, 'Weight of a critical, major and minor checklist item in the score'),
  ('work.hours', '{"start":"07:00","end":"17:00","days":[1,2,3,4,5,6]}'::jsonb, 'Normal working hours (days: 1 = Monday ... 7 = Sunday)'),
  ('standards', '[]'::jsonb, 'Standards and codes that inspections may cite (code + title)'),
  ('access.inactive_days', '60'::jsonb, 'Days without signing in before an account shows on the Access review page')
on conflict (key) do nothing;

create function public.set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := p_value;
  code text;
  seen text[] := '{}';
  item jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'Only a Super Admin (with MFA) can change settings';
  end if;
  if not exists (select 1 from public.system_settings where key = p_key) then
    raise exception 'Unknown setting: %', p_key;
  end if;

  if p_key = 'qa.acceptance_threshold' then
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric not between 50 and 100 then
      raise exception 'The acceptance threshold is a whole number from 50 to 100';
    end if;
  elsif p_key = 'qa.weights' then
    if jsonb_typeof(v) <> 'object' or not (v ?& array['critical', 'major', 'minor']) or (select count(*) from jsonb_object_keys(v)) <> 3 then
      raise exception 'Weights need exactly critical, major and minor';
    end if;
    foreach code in array array['critical', 'major', 'minor'] loop
      if jsonb_typeof(v -> code) <> 'number' or (v ->> code)::numeric <> trunc((v ->> code)::numeric) or (v ->> code)::numeric not between 1 and 20 then
        raise exception 'Each weight is a whole number from 1 to 20';
      end if;
    end loop;
    if (v ->> 'critical')::int < (v ->> 'major')::int or (v ->> 'major')::int < (v ->> 'minor')::int then
      raise exception 'A critical item must weigh at least as much as a major one, and a major at least as much as a minor one';
    end if;
  elsif p_key = 'work.hours' then
    if jsonb_typeof(v) <> 'object' or (v ->> 'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (v ->> 'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Working hours need a start and an end time (HH:MM)';
    end if;
    if (v ->> 'start') >= (v ->> 'end') then raise exception 'The end time must be after the start time'; end if;
    if jsonb_typeof(v -> 'days') <> 'array' or jsonb_array_length(v -> 'days') not between 1 and 7 then
      raise exception 'Pick at least one working day';
    end if;
    for item in select * from jsonb_array_elements(v -> 'days') loop
      if jsonb_typeof(item) <> 'number' or (item #>> '{}') !~ '^[1-7]$' or (item #>> '{}') = any (seen) then
        raise exception 'Working days are the numbers 1 to 7, each once';
      end if;
      seen := seen || (item #>> '{}');
    end loop;
  elsif p_key = 'standards' then
    if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 30 then raise exception 'Up to 30 standards'; end if;
    for item in select * from jsonb_array_elements(v) loop
      if jsonb_typeof(item) <> 'object' or char_length(coalesce(item ->> 'code', '')) not between 2 and 40 or char_length(coalesce(item ->> 'title', '')) not between 2 and 120 then
        raise exception 'Each standard needs a code (2-40 characters) and a title (2-120 characters)';
      end if;
      if lower(item ->> 'code') = any (seen) then raise exception 'Each standard code can appear once'; end if;
      seen := seen || lower(item ->> 'code');
    end loop;
  elsif p_key = 'access.inactive_days' then
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric not between 14 and 365 then
      raise exception 'Inactive days is a whole number from 14 to 365';
    end if;
  end if;

  update public.system_settings set value = v, updated_by = auth.uid(), updated_at = now() where key = p_key;
  insert into public.audit_log (actor_id, action, details) values (auth.uid(), 'settings.update', jsonb_build_object('key', p_key, 'value', v));
end;
$$;

create function public.get_inactive_users(p_days integer default null)
returns table (id uuid, full_name text, email text, role public.app_role, status public.user_status, last_sign_in_at timestamptz, created_at timestamptz, days_inactive integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  d integer := coalesce(p_days, (select (value #>> '{}')::integer from public.system_settings where key = 'access.inactive_days'), 60);
begin
  if not public.has_permission('users.view') then
    raise exception 'Missing permission: users.view';
  end if;
  return query
  select p.id, p.full_name, p.email, p.role, p.status, u.last_sign_in_at, p.created_at,
         floor(extract(epoch from (now() - coalesce(u.last_sign_in_at, p.created_at))) / 86400)::integer
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.status = 'active'
    and p.role in ('engineer', 'foreman', 'client', 'user')
    and coalesce(u.last_sign_in_at, p.created_at) < now() - make_interval(days => d)
  order by coalesce(u.last_sign_in_at, p.created_at) asc
  limit 500;
end;
$$;

revoke execute on function public.set_setting(text, jsonb), public.get_inactive_users(integer) from public, anon;
grant execute on function public.set_setting(text, jsonb), public.get_inactive_users(integer) to authenticated;

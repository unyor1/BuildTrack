-- BuildTrack 0020: notification centre, invitation codes, pin severity, audit log viewer, profile photos.
--   * notifications: one row per person per event, written only by database triggers / functions. People read, mark read and
--     clear their own. Triggers cover: new access request (admins who review), request declined, role granted, pin sent for
--     review / sent back / verified / marked an issue, pin assigned. generate_due_notifications() adds deadline reminders
--     for the caller (once per pin per day).
--   * invite_codes + redeem_invite(): an admin who reviews users creates a code for Engineer / Foreman / Client; a signed-in
--     basic user with a confirmed email redeems it and gets the role at once. Single or limited use, expiring, rate limited.
--   * pins.severity (low / medium / high / critical) for the issue register.
--   * get_audit_log(): searchable audit trail for admins who may view users (MFA).
--   * Profile photos: public `avatars` bucket (each person writes only inside their own folder) and the avatar_url column
--     becomes editable by its owner.
-- Requires 0001-0019. Applied through the BUILDTRACK_MIGRATIONS connector.

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 500),
  link text check (link is null or link ~ '^/[a-z0-9/_-]*(\?[A-Za-z0-9=&_.-]*)?$'),
  project_id uuid references public.projects (id) on delete cascade,
  entity_id uuid,
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 120),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;

alter table public.notifications enable row level security;
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "clear own notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;

create function public.role_home(p_role public.app_role)
returns text language sql immutable set search_path = '' as $$
  select case p_role
    when 'super_admin' then '/admin/dashboard' when 'admin' then '/admin/dashboard'
    when 'engineer' then '/engineer/dashboard' when 'foreman' then '/foreman/dashboard'
    when 'client' then '/client/overview' else '/user/home' end;
$$;

-- Internal: one notification for one active person. Returns true when a row was written (false when a duplicate was skipped).
create function public.notify_user(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_project uuid, p_entity uuid, p_dedupe text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into public.notifications (user_id, kind, title, body, link, project_id, entity_id, dedupe_key)
  select p.id, p_kind, left(p_title, 160), left(p_body, 500), p_link, p_project, p_entity, p_dedupe
  from public.profiles p where p.id = p_user and p.status = 'active'
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create function public.display_name(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(full_name), ''), email, 'Someone') from public.profiles where id = p_user;
$$;

-- Admins who review access requests: Super Admins and admins holding users.approve.
create function public.trg_notify_access_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if tg_op = 'INSERT' then
    for r in
      select p.id from public.profiles p
      where p.status = 'active' and p.id <> new.user_id
        and (p.role = 'super_admin' or (p.role = 'admin' and exists (select 1 from public.admin_permissions ap where ap.user_id = p.id and ap.permission = 'users.approve')))
    loop
      perform public.notify_user(r.id, 'access.request', 'New access request',
        public.display_name(new.user_id) || ' asked for ' || initcap(new.requested_role::text) || ' access', '/admin/user-management', null, new.id);
    end loop;
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public.notify_user(new.user_id, 'access.declined', 'Your access request was not approved',
      coalesce(nullif(btrim(new.decision_note), ''), 'You can send a new request any time.'), '/user/home', null, new.id);
  end if;
  return new;
end;
$$;
create trigger access_requests_notify after insert or update of status on public.access_requests
  for each row execute function public.trg_notify_access_request();

create function public.trg_notify_role_granted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role is not distinct from new.role then
    return new;
  end if;
  if coalesce(old.role::text, 'user') = 'user' and new.role in ('engineer', 'foreman', 'client', 'admin') then
    perform public.notify_user(new.id, 'access.granted', 'You now have ' || initcap(new.role::text) || ' access',
      'Open your dashboard to start working.', public.role_home(new.role), null, new.id);
  end if;
  return new;
end;
$$;
create trigger profiles_role_notify after update of role on public.profiles
  for each row execute function public.trg_notify_role_granted();

-- Pin workflow: who needs to know when the status or the assignee changes.
create function public.trg_notify_pin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r record;
  who text := coalesce(public.display_name(me), 'Someone');
begin
  if new.status is distinct from old.status then
    if new.status = 'for_review' or new.status = 'issue' then
      for r in select pm.user_id from public.project_members pm where pm.project_id = new.project_id and pm.member_role = 'engineer' and pm.user_id is distinct from me loop
        perform public.notify_user(r.user_id, case when new.status = 'issue' then 'pin.issue' else 'pin.review' end,
          case when new.status = 'issue' then 'Issue reported: ' || new.title else 'Ready for review: ' || new.title end,
          who, '/engineer/verification?project=' || new.project_id, new.project_id, new.id);
      end loop;
    elsif new.status = 'verified' then
      if new.assigned_to is not null and new.assigned_to is distinct from me then
        perform public.notify_user(new.assigned_to, 'pin.verified', 'Verified: ' || new.title, 'Approved by ' || who, '/foreman/dashboard?project=' || new.project_id, new.project_id, new.id);
      end if;
      for r in select pm.user_id from public.project_members pm where pm.project_id = new.project_id and pm.member_role = 'client' loop
        perform public.notify_user(r.user_id, 'pin.milestone', 'Milestone verified: ' || new.title, null, '/client/overview?project=' || new.project_id, new.project_id, new.id);
      end loop;
    elsif old.status = 'for_review' and new.status in ('in_progress', 'not_started') and new.assigned_to is not null and new.assigned_to is distinct from me then
      perform public.notify_user(new.assigned_to, 'pin.returned', 'Sent back: ' || new.title, who || ' asked for more work', '/foreman/dashboard?project=' || new.project_id, new.project_id, new.id);
    end if;
  end if;
  if new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to and new.assigned_to is distinct from me then
    perform public.notify_user(new.assigned_to, 'pin.assigned', 'Assigned to you: ' || new.title, new.due_date::text, '/foreman/dashboard?project=' || new.project_id, new.project_id, new.id);
  end if;
  return new;
end;
$$;
create trigger pins_notify after update on public.pins
  for each row execute function public.trg_notify_pin();

-- Deadline reminders for the caller (Foremen: their pins; Engineers: pins of their projects). Once per pin and day.
create function public.generate_due_notifications()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  r record;
  total integer := 0;
  late boolean;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.status <> 'active' or me.role not in ('engineer', 'foreman') then
    return 0;
  end if;
  for r in
    select pn.id, pn.title, pn.project_id, pn.due_date from public.pins pn
    where pn.status <> 'verified' and pn.due_date is not null and pn.due_date <= current_date + 2
      and ((me.role = 'foreman' and pn.assigned_to = me.id)
        or (me.role = 'engineer' and exists (select 1 from public.project_members pm where pm.project_id = pn.project_id and pm.user_id = me.id)))
    order by pn.due_date limit 50
  loop
    late := r.due_date < current_date;
    if public.notify_user(me.id, case when late then 'pin.overdue' else 'pin.due' end,
         case when late then 'Overdue: ' else 'Due soon: ' end || r.title,
         (case when late then 'Was due ' else 'Due ' end) || to_char(r.due_date, 'Mon DD, YYYY'),
         case when me.role = 'foreman' then '/foreman/dashboard?project=' else '/engineer/dashboard?project=' end || r.project_id,
         r.project_id, r.id, (case when late then 'late:' else 'soon:' end) || r.id::text || ':' || current_date::text) then
      total := total + 1;
    end if;
  end loop;
  return total;
end;
$$;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------- pin severity
alter table public.pins add column severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical'));

create or replace function public.record_pin_events()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, to_status, note)
    values (new.id, new.project_id, auth.uid(), 'created', new.status, new.title);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, from_status, to_status)
    values (new.id, new.project_id, auth.uid(), 'status', old.status, new.status);
  end if;
  if new.x is distinct from old.x or new.y is distinct from old.y then
    insert into public.pin_events (pin_id, project_id, actor_id, kind)
    values (new.id, new.project_id, auth.uid(), 'moved');
  end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.category is distinct from old.category or new.discipline is distinct from old.discipline
     or new.assigned_to is distinct from old.assigned_to or new.due_date is distinct from old.due_date
     or new.severity is distinct from old.severity then
    insert into public.pin_events (pin_id, project_id, actor_id, kind)
    values (new.id, new.project_id, auth.uid(), 'edited');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- invitation codes
create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{12}$'),
  assigned_role public.app_role not null check (assigned_role in ('engineer', 'foreman', 'client')),
  discipline text check (discipline is null or discipline in ('civil_structural', 'architectural', 'mep')),
  note text check (note is null or char_length(note) <= 200),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  disabled boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.invite_redemptions (
  code_id uuid not null references public.invite_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code_id, user_id)
);
create table public.invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index invite_attempts_user_idx on public.invite_attempts (user_id, created_at desc);

alter table public.invite_codes enable row level security;
alter table public.invite_redemptions enable row level security;
alter table public.invite_attempts enable row level security;
create policy "admins who review users read invite codes" on public.invite_codes
  for select to authenticated using (public.has_permission('users.approve') or public.has_permission('users.view'));
create policy "admins who review users read redemptions" on public.invite_redemptions
  for select to authenticated using (public.has_permission('users.approve') or public.has_permission('users.view'));
revoke all on public.invite_codes, public.invite_redemptions, public.invite_attempts from anon, authenticated;
grant select on public.invite_codes, public.invite_redemptions to authenticated;

create function public.create_invite(p_role public.app_role, p_discipline text default null, p_note text default null, p_max_uses integer default 1, p_days integer default 14)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_try integer := 0;
begin
  if not public.has_permission('users.approve') then
    raise exception 'Missing permission: users.approve';
  end if;
  if p_role not in ('engineer', 'foreman', 'client') then
    raise exception 'Invitations can give Engineer, Foreman or Client access';
  end if;
  if p_days not between 1 and 90 then
    raise exception 'Choose between 1 and 90 days';
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (select 1 from public.invite_codes where code = v_code);
    v_try := v_try + 1;
    exit when v_try > 5;
  end loop;
  insert into public.invite_codes (code, assigned_role, discipline, note, max_uses, expires_at, created_by)
  values (v_code, p_role, p_discipline, nullif(btrim(p_note), ''), p_max_uses, now() + make_interval(days => p_days), auth.uid());
  insert into public.audit_log (actor_id, action, details)
  values (auth.uid(), 'invite.create', jsonb_build_object('role', p_role, 'max_uses', p_max_uses, 'days', p_days));
  return v_code;
end;
$$;

create function public.set_invite_disabled(p_id uuid, p_disabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_permission('users.approve') then
    raise exception 'Missing permission: users.approve';
  end if;
  update public.invite_codes set disabled = p_disabled where id = p_id;
  insert into public.audit_log (actor_id, action, details)
  values (auth.uid(), case when p_disabled then 'invite.disable' else 'invite.enable' end, jsonb_build_object('id', p_id));
end;
$$;

-- A basic user types a code. Wrong guesses are limited: 8 misses per hour, then the answer is "try later".
create function public.redeem_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  c public.invite_codes;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  confirmed timestamptz;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if me.role is distinct from 'user' then
    return jsonb_build_object('ok', false, 'reason', 'already_has_role');
  end if;
  select email_confirmed_at into confirmed from auth.users where id = me.id;
  if confirmed is null then
    return jsonb_build_object('ok', false, 'reason', 'unconfirmed');
  end if;
  if (select count(*) from public.invite_attempts where user_id = me.id and not ok and created_at > now() - interval '1 hour') >= 8 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  select * into c from public.invite_codes
  where code = v_code and not disabled and expires_at > now() and uses < max_uses for update;
  if c.id is null then
    insert into public.invite_attempts (user_id, ok) values (me.id, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  update public.profiles
    set role = c.assigned_role, discipline = coalesce(c.discipline, discipline), approved_by = c.created_by, approved_at = now()
    where id = me.id;
  update public.invite_codes set uses = uses + 1 where id = c.id;
  insert into public.invite_redemptions (code_id, user_id) values (c.id, me.id) on conflict do nothing;
  insert into public.invite_attempts (user_id, ok) values (me.id, true);
  update public.access_requests
    set status = 'approved', decided_by = c.created_by, decided_at = now(), decision_note = 'Joined with an invitation code'
    where user_id = me.id and status = 'pending';
  insert into public.audit_log (actor_id, target_id, action, details)
  values (c.created_by, me.id, 'invite.redeem', jsonb_build_object('role', c.assigned_role, 'email', me.email));
  return jsonb_build_object('ok', true, 'role', c.assigned_role);
end;
$$;

-- ---------------------------------------------------------------- audit log viewer
create function public.get_audit_log(p_search text default null, p_action text default null, p_from timestamptz default null, p_to timestamptz default null, p_limit integer default 100, p_offset integer default 0)
returns table (id bigint, created_at timestamptz, actor_name text, actor_email text, action text, target_name text, summary text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission('users.view') then
    raise exception 'Missing permission: users.view';
  end if;
  return query
  select l.id, l.created_at, coalesce(a.full_name, a.email, 'System'), a.email, l.action, coalesce(t.full_name, t.email), left(l.details::text, 400)
  from public.audit_log l
  left join public.profiles a on a.id = l.actor_id
  left join public.profiles t on t.id = l.target_id
  where (p_action is null or p_action = '' or l.action = p_action)
    and (p_from is null or l.created_at >= p_from)
    and (p_to is null or l.created_at < p_to)
    and (p_search is null or p_search = '' or l.action ilike '%' || p_search || '%' or a.email ilike '%' || p_search || '%'
         or a.full_name ilike '%' || p_search || '%' or t.email ilike '%' || p_search || '%' or l.details::text ilike '%' || p_search || '%')
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------------------------------------------------------------- profile photos
grant update (avatar_url) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
create policy "avatars: anyone can look" on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy "avatars: write only in your own folder" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy "avatars: replace only your own" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);
create policy "avatars: delete only your own" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- ---------------------------------------------------------------- grants
revoke execute on function public.role_home(public.app_role), public.notify_user(uuid, text, text, text, text, uuid, uuid, text),
  public.display_name(uuid), public.trg_notify_access_request(), public.trg_notify_role_granted(), public.trg_notify_pin()
  from public, anon, authenticated;
revoke execute on function public.generate_due_notifications(), public.mark_notifications_read(uuid[]),
  public.create_invite(public.app_role, text, text, integer, integer), public.set_invite_disabled(uuid, boolean),
  public.redeem_invite(text), public.get_audit_log(text, text, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.generate_due_notifications(), public.mark_notifications_read(uuid[]),
  public.create_invite(public.app_role, text, text, integer, integer), public.set_invite_disabled(uuid, boolean),
  public.redeem_invite(text), public.get_audit_log(text, text, timestamptz, timestamptz, integer, integer) to authenticated;
revoke execute on function public.prepare_pin(), public.record_pin_events() from public, anon, authenticated;

-- 0039: time and place stamp on site photos (closes loophole L2 in docs/BUILDTRACK_INTEGRITY_NOTES.md as far as software can).
--   * A project may have a SITE LOCATION (centre + radius in metres), set by an admin who manages projects.
--   * Every pin photo and QA evidence photo can carry the phone's time, GPS position and accuracy at the moment it was taken.
--     The database never blocks a photo (field work and offline queues must keep working); it records WHAT it found and flags it:
--       at_site          GPS inside the site radius (a reading as poor as 100 m is forgiven up to its accuracy)
--       away_from_site   GPS outside the radius; the distance in metres is stored
--       no_site_set      a position was sent but the project has no site location yet
--       no_location      no position (denied, unavailable, or an old app)
--       clock_ahead      the phone's time is more than 10 minutes in the future
--       old_photo        the phone's time is more than 3 days before it was received (a re-upload of an old picture)
--     The server time `created_at` is always the real upload time; `taken_at` is the phone's claim.
--   * What this is not: GPS and phone clocks can be faked by someone determined; this raises the bar and leaves evidence of the
--     attempt. Rows are immutable (no update policy exists), and the flags are computed here, never trusted from the browser.
--   * The stamp is personal location data of the person taking the photo: the privacy notice says so (src/lib/privacy.ts).

alter table public.projects
  add column site_lat numeric(9, 6) check (site_lat between -90 and 90),
  add column site_lng numeric(9, 6) check (site_lng between -180 and 180),
  add column site_radius_m integer not null default 150 check (site_radius_m between 20 and 5000),
  add constraint projects_site_both check ((site_lat is null) = (site_lng is null));

alter table public.pin_photos
  add column taken_at timestamptz,
  add column lat numeric(9, 6) check (lat between -90 and 90),
  add column lng numeric(9, 6) check (lng between -180 and 180),
  add column accuracy_m integer check (accuracy_m is null or accuracy_m between 0 and 100000),
  add column distance_m integer,
  add column stamp_flag text check (stamp_flag in ('at_site', 'away_from_site', 'no_site_set', 'no_location', 'clock_ahead', 'old_photo')),
  add constraint pin_photos_position_both check ((lat is null) = (lng is null));

alter table public.qa_photos
  add column taken_at timestamptz,
  add column lat numeric(9, 6) check (lat between -90 and 90),
  add column lng numeric(9, 6) check (lng between -180 and 180),
  add column accuracy_m integer check (accuracy_m is null or accuracy_m between 0 and 100000),
  add column distance_m integer,
  add column stamp_flag text check (stamp_flag in ('at_site', 'away_from_site', 'no_site_set', 'no_location', 'clock_ahead', 'old_photo')),
  add constraint qa_photos_position_both check ((lat is null) = (lng is null));

-- Great-circle distance in metres (haversine).
create function public.distance_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns integer language sql immutable set search_path = '' as $$
  select round(2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2)
    + cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2)
  ))))::integer;
$$;

-- Fills distance_m and stamp_flag on insert (never rejects the photo).
create function public.stamp_evidence_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_lat numeric;
  v_lng numeric;
  v_radius integer;
begin
  select p.site_lat, p.site_lng, p.site_radius_m into v_lat, v_lng, v_radius from public.projects p where p.id = new.project_id;
  new.distance_m := null;
  if new.lat is not null and v_lat is not null then
    new.distance_m := public.distance_m(new.lat, new.lng, v_lat, v_lng);
  end if;
  new.stamp_flag := case
    when new.taken_at is not null and new.taken_at > now() + interval '10 minutes' then 'clock_ahead'
    when new.taken_at is not null and new.taken_at < now() - interval '3 days' then 'old_photo'
    when new.lat is null then 'no_location'
    when v_lat is null then 'no_site_set'
    when new.distance_m - least(coalesce(new.accuracy_m, 0), 100) <= v_radius then 'at_site'
    else 'away_from_site'
  end;
  return new;
end;
$$;

-- QA photos are written with column-level grants: the browser may send the phone's claim, never the flag or the distance.
grant insert (taken_at, lat, lng, accuracy_m) on public.qa_photos to authenticated;

create trigger pin_photos_stamp before insert on public.pin_photos for each row execute function public.stamp_evidence_photo();
create trigger qa_photos_stamp before insert on public.qa_photos for each row execute function public.stamp_evidence_photo();

revoke execute on function public.stamp_evidence_photo() from public, anon, authenticated;
revoke execute on function public.distance_m(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.distance_m(numeric, numeric, numeric, numeric) to authenticated;

-- 0033: evidence lock. Once work has been sent for review or verified, its record is evidence and cannot disappear.
--   * A pin that is "for review" or "verified" now, or ever reached one of those states (its timeline shows it, because
--     un-verifying clears verified_at), cannot be deleted. This also holds when a sheet or a project is deleted (cascade),
--     so evidence cannot vanish with its sheet.
--   * The photos of such a pin cannot be deleted, by anyone, including admins.
--   * Every photo removal that is still allowed is written to the pin's timeline (kind 'photo_removed').
--   * The storage file of a pin photo can only be removed after its database record is gone (no orphan-free shortcut).

alter table public.pin_events drop constraint pin_events_kind_check;
alter table public.pin_events add constraint pin_events_kind_check
  check (kind in ('created', 'moved', 'edited', 'status', 'comment', 'photo', 'checklist', 'photo_removed'));

-- True when the pin's work was submitted or verified at any time.
create function public.pin_has_evidence(p_pin uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pins where id = p_pin and (status in ('for_review', 'verified') or verified_at is not null))
      or exists (select 1 from public.pin_events where pin_id = p_pin and kind = 'status' and to_status in ('for_review', 'verified'));
$$;

create function public.guard_pin_evidence_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.pin_has_evidence(old.id) then
    raise exception 'This work was sent for review or verified, so its record is evidence and cannot be deleted. Change its status instead.'
      using hint = 'evidence_locked';
  end if;
  return old;
end;
$$;
create trigger pins_evidence_lock before delete on public.pins
  for each row execute function public.guard_pin_evidence_delete();

create function public.guard_pin_photo_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- When the pin itself is being deleted (cascade) it no longer exists here; that path is guarded on pins.
  if exists (select 1 from public.pins where id = old.pin_id) and public.pin_has_evidence(old.pin_id) then
    raise exception 'This photo is evidence for work that was sent for review or verified. It cannot be removed.'
      using hint = 'evidence_locked';
  end if;
  return old;
end;
$$;
create trigger pin_photos_evidence_lock before delete on public.pin_photos
  for each row execute function public.guard_pin_photo_delete();

create function public.record_photo_removed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.pins where id = old.pin_id) then
    insert into public.pin_events (pin_id, project_id, actor_id, kind, note)
    values (old.pin_id, old.project_id, auth.uid(), 'photo_removed', left(coalesce(old.caption, 'Photo removed'), 2000));
  end if;
  return old;
end;
$$;
create trigger pin_photos_removed_event after delete on public.pin_photos
  for each row execute function public.record_photo_removed();

-- Storage: a pin photo file may only be removed when no record points to it (the record is removed first, under the rules above).
create function public.pin_photo_in_use(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pin_photos where path = p_path);
$$;

drop policy "pin photos: delete" on storage.objects;
create policy "pin photos: delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pin-photos' and (owner = auth.uid() or public.has_permission('blueprints.manage')) and not public.pin_photo_in_use(name));

revoke execute on function public.guard_pin_evidence_delete(), public.guard_pin_photo_delete(), public.record_photo_removed() from public, anon, authenticated;
revoke execute on function public.pin_has_evidence(uuid), public.pin_photo_in_use(text) from public, anon;
grant execute on function public.pin_has_evidence(uuid), public.pin_photo_in_use(text) to authenticated;

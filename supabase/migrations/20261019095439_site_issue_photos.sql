-- Site issue observations share the work pin's status; photos are original bytes + versioned, editable markup.
-- Local CLI-created filename aligned to hosted migration version 20261019095439 after deployment.
create function public.valid_issue_markup(p_value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb; pt jsonb; field text; ids text[] := '{}';
begin
  if p_value is null or jsonb_typeof(p_value)<>'array' then return false; end if;
  if jsonb_array_length(p_value)>150 or octet_length(p_value::text)>262144 then return false; end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item)<>'object' or not (item ?& array['id','kind','x','y','x2','y2','color','stroke','fontSize','text','points']) then return false; end if;
    if (select count(*) from jsonb_object_keys(item))<>11 then return false; end if;
    if jsonb_typeof(item->'id')<>'string' or (item->>'id') !~ '^[a-zA-Z0-9-]{1,64}$' or item->>'id'=any(ids) then return false; end if;
    ids:=array_append(ids,item->>'id');
    if coalesce(item->>'kind','') not in ('text','line','arrow','rectangle','ellipse','draw') then return false; end if;
    foreach field in array array['x','y','x2','y2'] loop
      if jsonb_typeof(item->field)<>'number' or (item->>field)::numeric not between 0 and 100 then return false; end if;
    end loop;
    if jsonb_typeof(item->'color')<>'string' or (item->>'color') !~ '^#[a-fA-F0-9]{6}$' then return false; end if;
    if jsonb_typeof(item->'stroke')<>'number' or (item->>'stroke')::numeric not between 1 and 12 then return false; end if;
    if jsonb_typeof(item->'fontSize')<>'number' or (item->>'fontSize')::numeric not between 12 and 72 then return false; end if;
    if jsonb_typeof(item->'text')<>'string' or char_length(item->>'text')>300 or (item->>'kind'='text' and btrim(item->>'text')='') then return false; end if;
    if jsonb_typeof(item->'points')<>'array' then return false; end if;
    if jsonb_array_length(item->'points')>500 or (item->>'kind'='draw' and jsonb_array_length(item->'points')<2) then return false; end if;
    for pt in select value from jsonb_array_elements(item->'points') loop
      if jsonb_typeof(pt)<>'object' or not(pt ?& array['x','y']) or (select count(*) from jsonb_object_keys(pt))<>2 then return false; end if;
      foreach field in array array['x','y'] loop
        if jsonb_typeof(pt->field)<>'number' or (pt->>field)::numeric not between 0 and 100 then return false; end if;
      end loop;
    end loop;
  end loop;
  return true;
exception when others then return false;
end; $$;
revoke all on function public.valid_issue_markup(jsonb) from public,anon;
grant execute on function public.valid_issue_markup(jsonb) to authenticated;

create table public.site_issue_reports (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  description text not null check(char_length(btrim(description)) between 5 and 1000),
  severity text not null check(severity in ('low','medium','high','critical')),
  raised_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index site_issue_reports_pin on public.site_issue_reports(pin_id,created_at desc);
create index site_issue_reports_project on public.site_issue_reports(project_id,created_at desc);

create table public.site_issue_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.site_issue_reports(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null unique,
  caption text not null default '' check(char_length(caption)<=500),
  annotations jsonb not null default '[]' check(public.valid_issue_markup(annotations)),
  version integer not null default 1,
  uploaded_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index site_issue_photos_report on public.site_issue_photos(report_id,created_at);
create index site_issue_photos_project on public.site_issue_photos(project_id);
create table public.site_issue_photo_revisions (
  photo_id uuid not null references public.site_issue_photos(id) on delete cascade,
  version integer not null,
  project_id uuid not null references public.projects(id) on delete cascade,
  annotations jsonb not null,
  caption text not null,
  edited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(photo_id,version)
);
create index site_issue_photo_revisions_project on public.site_issue_photo_revisions(project_id);
alter table public.site_issue_reports enable row level security;
alter table public.site_issue_photos enable row level security;
alter table public.site_issue_photo_revisions enable row level security;
revoke all on public.site_issue_reports,public.site_issue_photos,public.site_issue_photo_revisions from anon,authenticated;
grant select on public.site_issue_reports,public.site_issue_photos,public.site_issue_photo_revisions to authenticated;
create policy "staff read site issues" on public.site_issue_reports for select to authenticated using(public.is_staff() and public.can_view_project(project_id));
create policy "staff read site issue photos" on public.site_issue_photos for select to authenticated using(public.is_staff() and public.can_view_project(project_id));
create policy "staff read site photo revisions" on public.site_issue_photo_revisions for select to authenticated using(public.is_staff() and public.can_view_project(project_id));

-- Invoker-only helper: called inside the authorized transaction, not exposed as an RPC.
create function public.insert_site_issue_photos(p_report uuid,p_photos jsonb) returns void
language plpgsql set search_path='' as $$
declare r public.site_issue_reports; photo jsonb; ph public.site_issue_photos;
begin
  select * into r from public.site_issue_reports where id=p_report for update;
  if r.id is null or auth.uid() is null or not public.can_edit_blueprints(r.project_id) then raise exception 'Only the project Engineer can add issue photos'; end if;
  if jsonb_typeof(p_photos)<>'array' or p_photos is null then raise exception 'Photos must be an array'; end if;
  if jsonb_array_length(p_photos)+(select count(*) from public.site_issue_photos where report_id=p_report)>40 then raise exception 'At most 40 photos per issue observation'; end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    if not public.valid_issue_markup(coalesce(photo->'annotations','[]'::jsonb)) then raise exception 'Invalid photo markup'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='issue-photos' and o.name=photo->>'path' and o.owner=auth.uid()
      and o.name ~ ('^'||r.project_id::text||'/'||r.pin_id::text||'/[a-zA-Z0-9-]+\.(jpg|png|webp)$')) then raise exception 'Upload your photo to this work pin before attaching it'; end if;
    insert into public.site_issue_photos(report_id,project_id,path,caption,annotations,uploaded_by,updated_by)
      values(r.id,r.project_id,photo->>'path',coalesce(photo->>'caption',''),coalesce(photo->'annotations','[]'::jsonb),auth.uid(),auth.uid()) returning * into ph;
    insert into public.site_issue_photo_revisions(photo_id,version,project_id,annotations,caption,edited_by)
      values(ph.id,ph.version,ph.project_id,ph.annotations,ph.caption,auth.uid());
  end loop;
end; $$;
revoke all on function public.insert_site_issue_photos(uuid,jsonb) from public,anon,authenticated;

-- One transaction: status, actual issue description, timeline and all attached photos either save together or not at all.
create function public.log_site_issue(p_id uuid,p_pin uuid,p_severity text,p_description text,p_photos jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare pn public.pins; existing public.site_issue_reports;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or auth.uid() is null or not public.can_edit_blueprints(pn.project_id) then raise exception 'Only the project Engineer can log a site issue'; end if;
  select * into existing from public.site_issue_reports where id=p_id;
  if existing.id is not null then
    if existing.pin_id=p_pin and existing.raised_by=auth.uid() then return existing.id; end if;
    raise exception 'That issue request ID is already in use';
  end if;
  if pn.category='note' then raise exception 'Choose a work pin, not a note'; end if;
  if pn.status='verified' then raise exception 'Reopen completed work on the plan before logging an issue'; end if;
  insert into public.site_issue_reports(id,pin_id,project_id,description,severity,raised_by)
    values(p_id,p_pin,pn.project_id,btrim(p_description),p_severity,auth.uid());
  update public.pins set status='issue',severity=p_severity where id=p_pin;
  insert into public.pin_events(pin_id,project_id,kind,note) values(p_pin,pn.project_id,'comment','Issue: '||btrim(p_description));
  perform public.insert_site_issue_photos(p_id,p_photos);
  return p_id;
end; $$;

create function public.add_site_issue_photos(p_report uuid,p_photos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare r public.site_issue_reports; pn public.pins;
begin
  select * into r from public.site_issue_reports where id=p_report;
  select * into pn from public.pins where id=r.pin_id for update;
  if r.id is null or auth.uid() is null or not public.can_edit_blueprints(r.project_id) then raise exception 'Only the project Engineer can add issue photos'; end if;
  if pn.status='verified' then raise exception 'Reopen completed work before adding evidence'; end if;
  perform public.insert_site_issue_photos(p_report,p_photos);
end; $$;

create function public.save_site_issue_photo(p_photo uuid,p_version integer,p_annotations jsonb,p_caption text) returns integer
language plpgsql security definer set search_path='' as $$
declare ph public.site_issue_photos; pid uuid; pn public.pins;
begin
  select r.pin_id into pid from public.site_issue_photos p join public.site_issue_reports r on r.id=p.report_id where p.id=p_photo;
  select * into pn from public.pins where id=pid for update;
  select * into ph from public.site_issue_photos where id=p_photo for update;
  if ph.id is null or auth.uid() is null or not public.can_edit_blueprints(ph.project_id) then raise exception 'Only the project Engineer can edit issue photos'; end if;
  if pn.status='verified' then raise exception 'Reopen completed work before editing evidence'; end if;
  if p_version is null or ph.version<>p_version then raise exception 'This photo was edited by someone else. Close it and reopen the latest version'; end if;
  if not public.valid_issue_markup(p_annotations) then raise exception 'Invalid photo markup'; end if;
  update public.site_issue_photos set annotations=p_annotations,caption=coalesce(p_caption,''),version=version+1,updated_by=auth.uid(),updated_at=now()
    where id=p_photo returning * into ph;
  insert into public.site_issue_photo_revisions(photo_id,version,project_id,annotations,caption,edited_by)
    values(ph.id,ph.version,ph.project_id,ph.annotations,ph.caption,auth.uid());
  insert into public.pin_events(pin_id,project_id,kind,note) values(pid,ph.project_id,'comment','Issue photo markup saved: version '||ph.version::text);
  return ph.version;
end; $$;

create function public.return_site_issue(p_pin uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare pn public.pins;
begin
  select * into pn from public.pins where id=p_pin for update;
  if pn.id is null or auth.uid() is null or not public.can_edit_blueprints(pn.project_id) then raise exception 'Only the project Engineer can return a site issue'; end if;
  if pn.status<>'issue' then raise exception 'This work is no longer marked as an open issue. Refresh the register'; end if;
  if p_note is null or char_length(btrim(p_note)) not between 5 and 1000 then raise exception 'Give the Foreman instructions (5 to 1000 characters)'; end if;
  update public.pins set status='in_progress' where id=p_pin;
  insert into public.pin_events(pin_id,project_id,kind,note) values(p_pin,pn.project_id,'comment','Please fix: '||btrim(p_note));
end; $$;
revoke all on function public.log_site_issue(uuid,uuid,text,text,jsonb),public.add_site_issue_photos(uuid,jsonb),public.save_site_issue_photo(uuid,integer,jsonb,text),public.return_site_issue(uuid,text) from public,anon;
grant execute on function public.log_site_issue(uuid,uuid,text,text,jsonb),public.add_site_issue_photos(uuid,jsonb),public.save_site_issue_photo(uuid,integer,jsonb,text),public.return_site_issue(uuid,text) to authenticated;

create trigger site_issue_reports_audit after insert on public.site_issue_reports for each row execute function public.log_row_change();
create trigger site_issue_photos_audit after insert or update on public.site_issue_photos for each row execute function public.log_row_change();

-- Storage cleanup must see attachments even after the caller loses project access (RLS would hide them).
create function public.site_issue_photo_in_use(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.site_issue_photos where path=p_path);
$$;
revoke all on function public.site_issue_photo_in_use(text) from public,anon;
grant execute on function public.site_issue_photo_in_use(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('issue-photos','issue-photos',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy "issue photos upload" on storage.objects for insert to authenticated with check(bucket_id='issue-photos' and exists(
  select 1 from public.pins pn where public.can_edit_blueprints(pn.project_id) and pn.status<>'verified'
  and name ~ ('^'||pn.project_id::text||'/'||pn.id::text||'/[a-zA-Z0-9-]+\.(jpg|png|webp)$')));
create policy "issue photos read" on storage.objects for select to authenticated using(bucket_id='issue-photos' and (
  exists(select 1 from public.site_issue_photos ph where ph.path=name) or (owner=(select auth.uid()) and exists(
    select 1 from public.pins pn where public.can_edit_blueprints(pn.project_id) and name ~ ('^'||pn.project_id::text||'/'||pn.id::text||'/[a-zA-Z0-9-]+\.(jpg|png|webp)$')))));
-- Cleanup can only remove the caller's unattached uploads. Referenced originals cannot be overwritten or deleted.
create policy "issue photos cleanup unused" on storage.objects for delete to authenticated using(bucket_id='issue-photos' and owner=(select auth.uid())
  and not public.site_issue_photo_in_use(name));
alter publication supabase_realtime add table public.site_issue_reports,public.site_issue_photos,public.site_issue_photo_revisions;
do $$
declare t text;
begin
  foreach t in array array['blueprints','blueprint_revisions'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end; $$;
create index pin_events_project_issues on public.pin_events(project_id,id) where kind='status' and to_status='issue';
notify pgrst,'reload schema';

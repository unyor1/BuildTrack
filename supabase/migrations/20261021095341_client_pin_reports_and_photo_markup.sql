-- Client problem reports link to the same project work pin; photo bytes remain
-- unmarked originals and validated annotations are a separate immutable overlay.
alter table public.client_snags add column pin_id uuid references public.pins(id) on delete set null;
create index client_snags_pin_idx on public.client_snags(pin_id) where pin_id is not null;
alter table public.snag_photos
  add column caption text not null default '' check(char_length(caption)<=500),
  add column annotations jsonb not null default '[]' check(public.valid_issue_markup(annotations));
grant insert(caption,annotations) on public.snag_photos to authenticated;

-- This narrow wrapper is privileged because clients have no direct INSERT/UPDATE
-- grant on reports. Preserve the existing quota, notifications and author logic.
create function public.submit_linked_snag(p_project uuid,p_title text,p_description text,p_location text,p_urgency text default 'normal',p_pin uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare report_id uuid;
begin
  if auth.uid() is null or not (public.is_active() and public.is_project_client(p_project)) then
    raise exception 'Only the assigned active client can report a problem';
  end if;
  if p_pin is not null then
    perform 1 from public.pins where id=p_pin and project_id=p_project and category<>'note' for key share;
    if not found then raise exception 'Choose a work pin from this project'; end if;
  end if;
  report_id:=public.submit_snag(p_project,p_title,p_description,p_location,p_urgency);
  update public.client_snags set pin_id=p_pin where id=report_id and author_id=auth.uid();
  return report_id;
end; $$;
revoke all on function public.submit_linked_snag(uuid,text,text,text,text,uuid) from public,anon;
grant execute on function public.submit_linked_snag(uuid,text,text,text,text,uuid) to authenticated;

-- Engineer acceptance still uses decide_snag. Its new NCR inherits the original
-- pin link, so the Foreman's corrections and checklist completion guards agree.
create function public.link_client_snag_defect_pin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.pin_id is not null and new.defect_id is not null then
    update public.qa_defects set pin_id=new.pin_id
      where id=new.defect_id and project_id=new.project_id and pin_id is null;
  end if;
  return new;
end; $$;
revoke all on function public.link_client_snag_defect_pin() from public,anon,authenticated;
create trigger client_snag_link_defect_pin after update of defect_id on public.client_snags
  for each row when (old.defect_id is distinct from new.defect_id)
  execute function public.link_client_snag_defect_pin();

-- Serialize photo attachment before the existing four-photo limit is checked.
-- This also requires a current project assignment, not just historical authorship.
create function public.lock_client_snag_photo() returns trigger
language plpgsql security definer set search_path='' as $$
declare report_row public.client_snags;
begin
  select * into report_row from public.client_snags where id=new.snag_id for update;
  if auth.uid() is null or not public.is_active() or report_row.author_id is distinct from auth.uid()
    or not public.is_project_client(report_row.project_id) then
    raise exception 'You can only add photos to your own reports as an assigned active client';
  end if;
  return new;
end; $$;
revoke all on function public.lock_client_snag_photo() from public,anon,authenticated;
create trigger snag_photos_a_lock before insert on public.snag_photos
  for each row execute function public.lock_client_snag_photo();

-- Communication is the existing private client question -> Engineer answer
-- workflow, not a public chat. Notifications open the exact question thread.
create or replace function public.trg_notify_question() returns trigger
language plpgsql security definer set search_path='' as $$
declare member record;
begin
  for member in select user_id from public.project_members where project_id=new.project_id and member_role='engineer' loop
    perform public.notify_user(member.user_id,'question.new','Client question',left(new.question,200),
      '/engineer/reports?project='||new.project_id||'&tab=questions&question='||new.id,new.project_id,new.id);
  end loop;
  return new;
end; $$;
create or replace function public.answer_question(p_id uuid,p_answer text) returns void
language plpgsql security definer set search_path='' as $$
declare question_row public.project_questions;
begin
  select * into question_row from public.project_questions where id=p_id for update;
  if auth.uid() is null or question_row.id is null or not public.can_edit_blueprints(question_row.project_id) then
    raise exception 'Question not found or you are not allowed to answer it';
  end if;
  if btrim(coalesce(p_answer,''))='' or char_length(btrim(p_answer))>2000 then raise exception 'Write an answer of up to 2000 characters'; end if;
  update public.project_questions set answer=btrim(p_answer),answered_by=auth.uid(),answered_at=now() where id=p_id;
  perform public.notify_user(question_row.author_id,'question.answered','Your question was answered',left(btrim(p_answer),200),
    '/client/communication?project='||question_row.project_id||'&question='||p_id,question_row.project_id,p_id);
end; $$;

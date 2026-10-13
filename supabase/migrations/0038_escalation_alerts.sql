-- 0038: late-work alerts that reach the people who decide.
-- Until now only the assigned foreman was reminded (0020, 0025). Nobody on the engineering side was told when work was days
-- late, and nothing went upward. `generate_escalations()` adds two daily digests (one notification per person and project per day,
-- so a late project never floods the bell or the email queue):
--   * ENGINEER on a project: "work is running late" when open work items are 3 or more days past their due date, or any defect
--     report (NCR) is past its deadline. Link: the engineer dashboard of that project.
--   * ADMIN who manages projects (and Super Admin): "needs your attention" only for serious cases: an open CRITICAL defect report
--     past its deadline, a defect report overdue by 5 or more days, or open work 7 or more days late.
-- Like the existing reminders it is created on request when a person opens the app (the database de-duplicates by day), so it
-- works without a scheduled job. Thresholds are the constants below; change them here (and in docs/audits/sql/0038) if the
-- company's policy differs.

create function public.generate_escalations()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles;
  r record;
  total integer := 0;
  day_key text := to_char(current_date, 'YYYYMMDD');
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.status <> 'active' or me.role not in ('engineer', 'admin', 'super_admin') then
    return 0;
  end if;

  for r in
    select p.id as project_id, p.code, p.name,
           (select count(*) from public.pins pn
             where pn.project_id = p.id and pn.category <> 'note' and pn.status <> 'verified' and pn.due_date is not null and pn.due_date <= current_date - 3) as pins_late,
           (select count(*) from public.pins pn
             where pn.project_id = p.id and pn.category <> 'note' and pn.status <> 'verified' and pn.due_date is not null and pn.due_date <= current_date - 7) as pins_very_late,
           (select count(*) from public.qa_defects d
             where d.project_id = p.id and d.status <> 'closed' and d.due_date is not null and d.due_date < current_date) as ncr_late,
           (select count(*) from public.qa_defects d
             where d.project_id = p.id and d.status <> 'closed' and d.severity = 'critical' and d.due_date is not null and d.due_date < current_date) as ncr_critical_late,
           (select count(*) from public.qa_defects d
             where d.project_id = p.id and d.status <> 'closed' and d.due_date is not null and d.due_date <= current_date - 5) as ncr_very_late
    from public.projects p
    where p.status in ('planning', 'active', 'on_hold')
      and ((me.role = 'engineer' and exists (select 1 from public.project_members m where m.project_id = p.id and m.user_id = me.id and m.member_role = 'engineer'))
        or (me.role in ('admin', 'super_admin') and public.has_permission('projects.manage')))
  loop
    if me.role = 'engineer' then
      if r.pins_late + r.ncr_late > 0 then
        if public.notify_user(me.id, 'alert.overdue',
             r.code || ': work is running late',
             case when r.pins_late > 0 then r.pins_late || ' work item' || case when r.pins_late = 1 then ' is' else 's are' end || ' 3 or more days late' else '' end
               || case when r.pins_late > 0 and r.ncr_late > 0 then ' and ' else '' end
               || case when r.ncr_late > 0 then r.ncr_late || ' defect report' || case when r.ncr_late = 1 then ' is' else 's are' end || ' past the deadline' else '' end || '.',
             '/engineer/dashboard?project=' || r.project_id, r.project_id, null, 'late:' || r.project_id || ':' || day_key) then
          total := total + 1;
        end if;
      end if;
    elsif r.ncr_critical_late + r.ncr_very_late + r.pins_very_late > 0 then
      if public.notify_user(me.id, 'alert.escalation',
           r.code || ': needs your attention',
           concat_ws('; ',
             case when r.ncr_critical_late > 0 then r.ncr_critical_late || ' critical defect report' || case when r.ncr_critical_late = 1 then '' else 's' end || ' past the deadline' end,
             case when r.ncr_very_late > 0 then r.ncr_very_late || ' defect report' || case when r.ncr_very_late = 1 then '' else 's' end || ' overdue by 5 or more days' end,
             case when r.pins_very_late > 0 then r.pins_very_late || ' work item' || case when r.pins_very_late = 1 then '' else 's' end || ' 7 or more days late' end) || '.',
           '/admin/project-overview?project=' || r.project_id, r.project_id, null, 'escalate:' || r.project_id || ':' || day_key) then
        total := total + 1;
      end if;
    end if;
  end loop;
  return total;
end;
$$;

revoke execute on function public.generate_escalations() from public, anon;
grant execute on function public.generate_escalations() to authenticated;

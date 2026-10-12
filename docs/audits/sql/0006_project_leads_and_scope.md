# 0006: Person in charge, scope of work, project team API

| Field | Value |
|---|---|
| File | `supabase/migrations/0006_project_leads_and_scope.sql` |
| Written | 2026-10-09 |
| Applied | by hand before 2026-10-09 (verified through the connector: columns, indexes, triggers, function) |
| Depends on | 0001-0005 |
| Status | Applied |
| Reversible | Yes (drops columns, triggers, function) |

## Purpose
Project creation needed a place to say **who takes care of the project** and **what work it covers**, and assigned users needed to see who is on their project without being able to read other people's profiles.

## Objects
| Type | Name | Notes |
|---|---|---|
| Columns on `projects` | `manager_name` | free text, max 120: the person in charge (may have no login) |
| | `lead_engineer_id`, `lead_foreman_id` | real users (FK to `profiles`, `on delete set null`) |
| | `disciplines` | `text[]`, subset of `civil_structural`, `architectural`, `mep` (check constraint) |
| Indexes | `projects_status_idx`, `projects_created_idx`, `projects_lead_engineer_idx`, `projects_lead_foreman_idx` | for the filters/sorts the app uses |
| Function + trigger | `sync_project_leads()` / `projects_sync_leads` | lead must be an ACTIVE user with the matching role (engineer / foreman) else error; lead is auto-added to `project_members` |
| Function + trigger | `clear_lead_on_member_removal()` / `project_members_clear_lead` | removing someone from the team clears them as lead |
| Function + trigger | `clear_lead_on_profile_change()` / `profiles_clear_lead` | a lead who is disabled/rejected or changes role stops being lead |
| Function | `get_project_team(pid)` | returns user_id, full_name, role, is_lead for a project; empty unless caller has `projects.manage` (with MFA) or is a member; no emails/phones; not callable by `anon` |

## Security
- Writes to the new columns follow the existing `projects` policies (`projects.manage` + aal2 only).
- Assigned users learn teammates' names and roles only through `get_project_team`; `profiles` stays private.
- Triggers are `security definer` with `search_path = ''`.

## Tests (supabase/tests, `pnpm test:sql`)
Lead sync into team; wrong role / pending user rejected as lead; invalid discipline rejected; changing lead; removing lead from team; disabled lead cleared; team API visible to members, empty for outsiders, empty for admin without MFA, blocked for anon; client cannot self-assign.

## Verification (after applying)
```sql
select column_name from information_schema.columns where table_name = 'projects'
  and column_name in ('manager_name','lead_engineer_id','lead_foreman_id','disciplines');
select tgname from pg_trigger where tgname in ('projects_sync_leads','project_members_clear_lead','profiles_clear_lead');
```
App: create a project with an Engineer and Foreman in charge, then check Manage access lists both.

## Rollback
```sql
drop trigger if exists projects_sync_leads on public.projects;
drop trigger if exists project_members_clear_lead on public.project_members;
drop trigger if exists profiles_clear_lead on public.profiles;
drop function if exists public.sync_project_leads(), public.clear_lead_on_member_removal(),
  public.clear_lead_on_profile_change(), public.get_project_team(uuid);
drop index if exists public.projects_status_idx, public.projects_created_idx,
  public.projects_lead_engineer_idx, public.projects_lead_foreman_idx;
alter table public.projects drop column if exists manager_name, drop column if exists lead_engineer_id,
  drop column if exists lead_foreman_id, drop column if exists disciplines;
```

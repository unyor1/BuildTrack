# 0007: Close internal functions to the public API

| Field | Value |
|---|---|
| File | `supabase/migrations/0007_lock_down_function_execute.sql` |
| Written / applied | 2026-10-09, by the agent through the BUILDTRACK_MIGRATIONS connector (project `ruimjlhsfpaezkgfphsz`, verified before use) |
| Connector version id | `lock_down_function_execute` (see `list_migrations`) |
| Depends on | 0001-0006 |
| Status | **Applied** and verified (advisor 23 findings -> 5, remaining 5 intentional) |
| Reversible | Yes |

## Why
Supabase's security advisor (lints 0028 / 0029) reported 23 findings: `SECURITY DEFINER` functions in `public` were executable through `/rest/v1/rpc/...` by anonymous and signed-in users. Supabase grants EXECUTE on new `public` functions to `anon` and `authenticated` by default.

## Change
| Group | Functions | Result |
|---|---|---|
| Trigger-only | `handle_new_user`, `touch_updated_at`, `check_project_member`, `log_project_change`, `set_actor_columns`, `sync_project_leads`, `clear_lead_on_member_removal`, `clear_lead_on_profile_change`, `grant_default_admin_permissions` | EXECUTE revoked from public, anon, authenticated. Triggers still fire (Postgres checks EXECUTE only when a trigger is created). |
| RLS helpers | `is_active`, `is_super_admin`, `has_permission(text)`, `is_project_member(uuid)`, `is_aal2` | revoked from public and anon; `authenticated` keeps EXECUTE (policies call them as the signed-in user) |
| Already restricted | `get_project_team(uuid)` | authenticated only (0006) |

## Accepted remaining advisor findings (5, level WARN)
`get_project_team`, `has_permission`, `is_active`, `is_project_member`, `is_super_admin` stay callable by signed-in users on purpose. They only reveal facts about the caller (booleans) or data the caller is already allowed to read (`get_project_team` re-checks access inside).

## Not fixable in SQL
`auth_leaked_password_protection` (checks passwords against HaveIBeenPwned): a Supabase Auth dashboard setting (Authentication > Sign In / Providers > Password security; may need the Pro plan). Owner action.

## Tests (`pnpm test:sql`, 25/25)
Trigger functions are not callable by Engineer, Admin or anon; RLS helpers closed to anon but working for signed-in users; triggers still fire after the revoke (lead sync, disabled lead cleared). Verified the new tests FAIL when 0007 is not applied.

## Rollback
```sql
grant execute on function public.handle_new_user(), public.touch_updated_at(), public.check_project_member(),
  public.log_project_change(), public.set_actor_columns(), public.sync_project_leads(),
  public.clear_lead_on_member_removal(), public.clear_lead_on_profile_change(),
  public.grant_default_admin_permissions() to anon, authenticated;
grant execute on function public.is_active(), public.is_super_admin(), public.has_permission(text),
  public.is_project_member(uuid), public.is_aal2() to anon;
```

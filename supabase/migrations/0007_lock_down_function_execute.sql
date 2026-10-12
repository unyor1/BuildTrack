-- BuildTrack 0007: stop exposing internal functions through the public API (/rest/v1/rpc/...).
-- Found by the Supabase security advisor (lints 0028 / 0029) after applying 0005:
--   * trigger-only functions (handle_new_user, sync_project_leads, ...) were callable by anon and signed-in users
--   * RLS helper functions (has_permission, is_super_admin, ...) were callable by anon
-- Trigger functions run when their trigger fires; Postgres does not check EXECUTE at that moment, so revoking is safe.
-- RLS helpers stay executable by `authenticated` (policies evaluate them as the signed-in user) and are removed for anon.
-- Requires 0001-0006. Applied through the BUILDTRACK_MIGRATIONS connector (BuildTrack project only).

revoke execute on function
  public.handle_new_user(),
  public.touch_updated_at(),
  public.check_project_member(),
  public.log_project_change(),
  public.set_actor_columns(),
  public.sync_project_leads(),
  public.clear_lead_on_member_removal(),
  public.clear_lead_on_profile_change(),
  public.grant_default_admin_permissions()
from public, anon, authenticated;

revoke execute on function
  public.is_active(),
  public.is_super_admin(),
  public.has_permission(text),
  public.is_project_member(uuid),
  public.is_aal2()
from public, anon;

grant execute on function
  public.is_active(),
  public.is_super_admin(),
  public.has_permission(text),
  public.is_project_member(uuid),
  public.is_aal2()
to authenticated;

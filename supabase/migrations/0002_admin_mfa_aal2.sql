-- BuildTrack 0002: admin privileges require a verified authenticator (TOTP) session.
-- Supabase marks a session "aal2" once the user passes the TOTP challenge. Admin / Super Admin
-- helper functions now return false for aal1 sessions, so RLS blocks admin data until MFA is done.
-- Safe to run before enrolling: users can still read their OWN profile (policy "own profile").
-- Run in Supabase SQL Editor (BuildTrack project only).

create or replace function public.is_aal2()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_aal2() and exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = 'super_admin'
  );
$$;

create or replace function public.has_permission(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or (
    public.is_aal2() and exists (
      select 1 from public.profiles pr
      join public.admin_permissions ap on ap.user_id = pr.id
      where pr.id = auth.uid() and pr.status = 'active' and pr.role = 'admin' and ap.permission = p
    )
  );
$$;

grant execute on function public.is_aal2() to authenticated;

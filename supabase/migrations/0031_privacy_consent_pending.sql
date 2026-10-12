-- 0031: a Google sign-up that is still waiting for approval (status `pending`) must be able to record that it accepted the data privacy
-- notice while it sends its registration details. Everything else about record_privacy_consent (own record only, known scopes) is unchanged.
create or replace function public.record_privacy_consent(p_scope text, p_version text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles where id = auth.uid() and status in ('active', 'pending')) then raise exception 'Not signed in'; end if;
  if p_scope not in ('registration', 'identity', 'profile', 'admin_account', 'whitelist', 'client_report', 'general') then raise exception 'Unknown privacy scope'; end if;
  insert into public.privacy_consents (user_id, scope, version) values (auth.uid(), p_scope, left(btrim(p_version), 20)) on conflict do nothing;
end;
$$;

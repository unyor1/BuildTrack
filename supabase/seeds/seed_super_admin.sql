-- Run ONCE in the SQL Editor, AFTER you have signed up in the app with your own email and verified the OTP.
-- Replace the email, then run. This is the only way a Super Admin is created.
update public.profiles
set role = 'super_admin', status = 'active', approved_at = now()
where email = lower('YOUR-EMAIL@example.com');

# Seed: first Super Admin

| Field | Value |
|---|---|
| File | `supabase/seeds/seed_super_admin.sql` |
| Run | once, manually, in the SQL Editor, after the owner has registered and verified the email OTP |
| Depends on | 0001 |
| Status | Not yet confirmed as run |
| Reversible | Yes |

## Purpose
The only way a Super Admin comes to exist. The app cannot create one: roles cannot be self-assigned, and `admin-users` refuses to assign admin roles unless the caller is already a Super Admin.

## What it does
Updates the owner's profile to `role = 'super_admin'`, `status = 'active'`, `approved_at = now()`. Replace the placeholder email before running.

## Security
- Run only for the project owner's email. Never commit a real email into the file.
- First sign-in as Super Admin forces authenticator (MFA) enrollment.

## Verification
```sql
select email, role, status from public.profiles where role = 'super_admin';
```

## Rollback
```sql
update public.profiles set role = null, status = 'pending' where email = lower('OWNER-EMAIL');
```

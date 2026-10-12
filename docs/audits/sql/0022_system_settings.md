# 0022: System settings and the inactive-accounts report

| Field | Value |
|---|---|
| File | `supabase/migrations/0022_system_settings.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `system_settings` |
| Depends on | 0001-0021 |
| Status | **Applied** and verified (rolled-back live check, advisor reviewed) |
| Reversible | Yes, see Rollback |

## Purpose
One place for the numbers the whole product shares, edited by the Super Admin, and a report of accounts that have gone quiet. The QA module will read the acceptance threshold, the weights and the standards list from here.

## Objects
| Type | Name | Notes |
|---|---|---|
| Table | `system_settings` | `key` -> `value jsonb`. Everyone active can read; nobody writes directly. Defaults: `qa.acceptance_threshold` 90, `qa.weights` {critical 5, major 3, minor 1}, `work.hours` 07:00-17:00 Mon-Sat, `standards` [], `access.inactive_days` 60 |
| RPC | `set_setting(key, value)` | `is_super_admin()` (includes MFA); the key must exist; per-key validation (threshold 50-100 whole, weights 1-20 and critical >= major >= minor, hours HH:MM with end after start and days 1-7 once each, up to 30 standards with unique codes, inactive days 14-365); writes `settings.update` to the audit log |
| RPC | `get_inactive_users(days)` | needs `users.view`; active engineers / foremen / clients / basic users whose last sign-in (or sign-up date) is older than the limit; admins are never listed; capped at 500 rows |

## Tests (`supabase/tests/98-settings.cases.mjs`, suite 188/188)
Read access for every role, no direct writes, Super Admin + MFA only, audit row, validation of every key, inactive report (permission, filters, day limit, disabled and recent accounts excluded). The test harness's `auth.users` stand-in gained `last_sign_in_at` to match Supabase.

## Verification (2026-10-11, live, rolled back)
5 defaults present; threshold changed to 88 inside the transaction; an invalid threshold (20) refused; the inactive report ran. Nothing left behind. Advisor: `set_setting` and `get_inactive_users` are new intended SECURITY DEFINER RPCs that check the caller inside.

## Rollback
```sql
drop function if exists public.get_inactive_users(integer), public.set_setting(text, jsonb);
drop table if exists public.system_settings;
```

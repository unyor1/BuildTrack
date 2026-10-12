# 0028: Email copies of notifications

| Field | Value |
|---|---|
| File | `supabase/migrations/0028_email_notifications.sql` |
| Applied | 2026-10-12, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Depends on | 0020 (`notifications`) |
| Status | **Applied** and verified (delivery itself waits for the Brevo API key, see `docs/BUILDTRACK_EMAIL_SETUP.md`) |
| Reversible | Yes |

## Objects
| Type | Name | Notes |
|---|---|---|
| Columns | `notifications.emailed_at`, `notifications.email_attempts` | all existing notifications were marked handled, so history is never emailed |
| Table | `notification_prefs` | one row per person, `email_enabled` default ON; the person reads and changes only their own (switch at the bottom of the bell menu) |
| Table | `email_log` | sent / failed / skipped with a short detail; RLS on, no policy: nobody reads it through the API |
| Function | `claim_email_batch(limit)` | service role only. Closes (as "skipped") what must not be sent: opted out, not active, no address, or 20 emails already in 24 hours; closes rows older than 2 days quietly; returns the next batch with each address and bumps the attempt counter |
| Function | `mark_email_result(id, ok, detail)` | service role only. Success closes the row; three failures close it too |
| Edge Function | `send-notifications` (v2, `verify_jwt` on) | callable only with the service role (or the `CRON_SECRET` header); builds the email from `supabase/functions/_shared/emailModel.ts` (escaped, links only for safe in-app paths on an https `APP_URL`) and sends it through the Brevo HTTP API |

## Why the Brevo HTTP API and not SMTP
Supabase Edge Functions cannot open outbound SMTP connections (ports 25 and 587 are blocked). The SMTP login and key already stored in `.env.secrets` are used by Supabase Auth for sign-up codes and work (a login-only test on `smtp-relay.brevo.com:587` returned 235; no email was sent). Notification emails need a Brevo API key (a different credential) stored as the Supabase secret `BREVO_API_KEY`.

## Tests (`supabase/tests/99-qa-snags-email.cases.mjs`, suite 229/229, plus `pnpm test:lib` for the email builder)
Own preference only; claim and result callable only by the service role; opted-out people skipped and logged; claim returns the address; success closes; three failures close and are logged; daily cap; very old rows never sent; inactive accounts never emailed.

## Verification (live)
0 pending after the migration; function privileges (service role only); function deployed: no auth -> 401, anon key -> 403, service role -> 200 `{"configured":false}` until the secrets are set.

## Rollback
```sql
drop function public.claim_email_batch(integer), public.mark_email_result(uuid, boolean, text), public.touch_notification_prefs();
drop table public.email_log, public.notification_prefs;
alter table public.notifications drop column emailed_at, drop column email_attempts;
```
(and delete the Edge Function in the dashboard)

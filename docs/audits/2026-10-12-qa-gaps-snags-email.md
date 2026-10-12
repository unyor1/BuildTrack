# 2026-10-12: QA follow-ups, client reports, email notifications

Migrations 0027 and 0028 (`sql/0027_client_snags.md`, `sql/0028_email_notifications.md`), Edge Function `send-notifications`, and UI only changes.

## 1. Real-environment check of QA (live project, rolled back)
As the real foreman and engineer: request, start, record results; storage policies exercised with real inserts into `storage.objects` (project folder allowed, another project's folder denied, `snag-photos` denied to a foreman); completion correctly refused until the required photo exists. No real client account exists yet, so the client flow was tested in SQL (PGlite) and in the browser against the temporary mock backend. A final pass with real accounts remains advisable.

## 2. QA gaps closed (UI)
- Sidebar badges: Engineer "QA / QC" (inspections waiting + repairs to verify), Foreman "Defects (NCR)" (own open repairs). `lib/qaLite.ts`, pure rule `qaBadge` in `lib/qaModel.ts`.
- Engineer dashboard: "QA to action" card, inspections / NCRs in "Needs your attention", QA button per project. Foreman dashboard: "Quality tasks" (my NCRs with deadline, my inspection requests).
- Admin project health: open / critical / overdue NCRs and first-time pass rate per project; critical NCRs count towards "at risk".
- Verification queue: a "Quality record" of the pin's inspections and defects, and a warning (not a block) in the confirmation when the latest inspection failed, one is still open or defects are open (`pinQualityWarning`).

## 3. Client reports (migration 0027)
Client "Report a problem" (replaces the sample ticket form, its banner is gone): title, details, place, urgency, up to 4 photos, own list with plain-language progress. Engineer QA tab "Client reports": triage with photos, accept (raises an NCR, assign foreman, class, deadline, message to the client) or decline with a reason. Notifications `snag.new / accepted / declined / resolved`; deep links `?snag=<id>`.

## 4. Email notifications (migration 0028)
Queue and preference in the database, Edge Function deployed and guarded, switch "Also email me" in the bell menu. **Not yet sending**: needs the Brevo API key and sender as Supabase secrets plus a cron job (`docs/BUILDTRACK_EMAIL_SETUP.md`). The Brevo SMTP credentials already stored were checked with a login-only test (accepted, nothing sent).

## Bug found while testing
Client photo picker cleared its file list before React read it (photos silently dropped); fixed by copying the files first. Found in the browser test, not by the type-checker.

## Verification
`pnpm test:sql` 229/229, `pnpm test:lib` 56/56, `npx tsc --noEmit` clean, `pnpm build` ok. Browser (temporary mock backend, removed afterwards, `.env.local` untouched): client report with photo, engineer triage and accept (NCR opened, tab switch), foreman dashboard tasks and badge, email switch (preference row written), engineer dashboard items and deep link, verification quality record, admin project health.

## Limits
Emails not yet delivered end to end (needs your secrets); the mock backend re-implements the rules, the SQL is the authority; no real client account tested live.

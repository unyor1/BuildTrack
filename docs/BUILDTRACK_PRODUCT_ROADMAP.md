# BuildTrack: product audit and roadmap to production

Last audit: 2026-10-12. Status words: **Live** = reads and writes the real database. **Mock** = screen with fixed sample data (looks real, is not). **Missing** = does not exist.

## 1. Honest state of the product

| Area | Live | Mock / Missing |
|---|---|---|
| Auth, roles, MFA, whitelist, access requests, impersonation, audit log table | Live | Audit log has no viewer (Missing) |
| Projects, team, leads | Live | |
| Blueprint workspace (sheets, revisions, pins, timeline, photos, drawings, images, layers, locks, history, export, compare, present) | Live | |
| Admin: dashboard, users, projects, project overview, blueprint upload, mapping, progress tracking, version control | Live | Only Biometrics is still Mock |
| Engineer: dashboard, projects, blueprints, editor, verification queue, issue register, progress, assignments | Live | none (fake sidebar badge and sync text removed) |
| Foreman: dashboard (my work + report), daily work (plan) | Live | Only attendance (biometrics) is still Mock; quality control, QA workflow and issues are the live QA module (0025) |
| Client: overview, blueprint, report a problem, site logs, communication | Live | Nothing Mock |
| Notifications (bell + triggers), invite codes, audit log viewer, project health, verification queue, issue register, progress by zone, assignment board, profile photo / completeness | Live (Phase 1) | |
| Reports, attendance data, daily reports, settings, global search, PWA/offline | | Missing |

Consequence: before QA can be built on top, the engineer / foreman / client areas need real data behind them. The plan below replaces each Mock screen with a Live one, in an order where every phase is usable on its own.

## 2. Additional recommendations found during the audit
Production basics that were not on the earlier list:
1. **Remove all fake numbers** (sidebar badges, "synced" text, "v2.4.1", mock tables) so nothing misleads a client or panelist.
2. **Error boundary and offline banner** around every screen; friendly 404 for unknown routes.
3. **Notification delivery by email** (Brevo) for decisions, reviews and due dates, with per-user opt-out.
4. **Per-project activity feed** visible to Engineers and Foremen (the data exists).
5. **Data retention and privacy page** (Terms, Privacy, biometric consent) linked from sign-up. Required before collecting biometric or attendance data.
6. **Backups and export**: per-project export (JSON + files) and a documented restore procedure.
7. **Rate limits** on invite-code redemption and sign-up (done for codes in this phase).
8. **Observability**: error reporting hook (Sentry-compatible), health check, and an uptime note in the runbook.
9. **Automated end-to-end smoke test** for the five role journeys; CI that runs `pnpm test:sql`, `pnpm test:lib`, type check and build.
10. **Seed / demo project** script so a new environment (and the defense demo) starts with realistic data.
11. **Accessibility pass** (focus order, labels, contrast already audited) and **Filipino/English** string readiness.
12. **Deployment runbook**: environments, secrets, Supabase Auth settings (OTP length, leaked-password protection), domain, CORS.

## 3. Phases

### Phase 1: foundation and the engineer's day (DELIVERED 2026-10-11)
- **Notification centre** (bell, unread count, mark read) fed by database triggers: access request decided, new request (admins), pin sent for review / sent back / verified / marked issue, pin assigned, deadline reminders.
- **Basic user:** request status tracker (already present) + profile completeness meter with photo upload, guided "what each role does" explainer, **invitation codes** (admin creates, user redeems, rate-limited).
- **Engineer:** real **verification queue** (approve / send back with a reason), **progress-by-zone dashboard**, **issue register** with severity and CSV export, **assignment board** (drag pins to foremen), real dashboard and sidebar.
- **Admin:** **audit log viewer** (search, filter, CSV), **project health** cards.
- Fake sidebar numbers removed.

### Phase 2: the field (foreman) and attendance (non-biometric part DELIVERED 2026-10-11: daily reports, photo documentation, corrective actions, client views, report printing; biometric attendance, PWA/offline, QR and voice note still open)
- Real daily report (weather, manpower, work done, issues) and photo documentation linked to pins.
- **Biometric attendance** (see decision A): worker roster, clock in / out, on-site-today list, late / absent flags.
- Mobile-first field mode, installable app (PWA), offline capture queue, QR scan to open a pin.
- Voice / short note on a pin.

### Phase 3: client and reports
- Plain-language progress view, milestone timeline, photo gallery by area, comments on pins routed to the engineer, milestone notifications.
- **Report centre**: progress, attendance and issue reports as PDF (the PDF writer already exists), weekly digest.

### Phase 4: administration
- Attendance reports and payroll export, biometric enrolment management, access review (inactive accounts), CSV whitelist import, system settings (acceptance threshold, weights, working hours, standards list), project backup / export.

### Phase 5: cross-cutting
- Global search, @mentions on pins, guided tours per role, email digests, observability, CI, runbook.

### Follow-ups built 2026-10-12
QA badges and dashboard cards, Admin project health QA numbers, quality record in the verification queue, client reports (0027), email notification queue and Edge Function (0028, waiting for the Brevo API key). See `docs/audits/2026-10-12-qa-gaps-snags-email.md` and `docs/BUILDTRACK_EMAIL_SETUP.md`.

### QA inspection module: BUILT (2026-10-11, migrations 0025 and 0026)
See `docs/audits/2026-10-11-qa-module-pages-bar.md`. Decisions taken: QA is an engineer duty (no new role), the company library of checklists is Super Admin only, standards are cited by name and the exact clause is typed per project. Not built yet: QA numbers on the Admin project health page, a QA step in the pin verification queue, optional "QA inspector" flag on project members.

### (Original plan, kept for reference) QA inspection module
Waiting only on the two decisions in section 5. It plugs into: pins (location), pin photos (evidence), notifications (failed item, re-inspection due), system settings (threshold and weights), the report centre (QA summary PDF) and the foreman's corrective-action inbox.

## 4. QA readiness checklist (what Phase 1 already provides for it)
- Notifications for assignment, review, sent-back, verified: reused for failed items and re-inspections.
- Pin severity and the issue register: the QA corrective-action list builds on them.
- Verification queue: becomes the inspection queue.
- Progress dashboards: add QA pass rate next to percent verified.
- Settings table (Phase 4) holds the acceptance threshold and weights.

## 5. Decisions needed
**A. How biometrics are captured (blocks Phase 2).** Recommended: staff (engineers, foremen, admins) verify with their own device's fingerprint or face through the browser (WebAuthn platform authenticator, no extra hardware); laborers on the roster are marked present by the foreman with a live photo as evidence, and the attendance table has a `source` column so an external fingerprint terminal can post logs later. Alternative: face recognition in the browser (heavier, more privacy and accuracy risk).
**B. QA:** is "Inspector" a new role or an engineer duty, and which two or three standards will you cite?
**C. Email provider:** keep Brevo (already configured for sign-up) and send notification emails through an Edge Function with the Brevo API key stored as a Supabase secret.

# 2026-10-13: Weekly report, late-work alerts, photo stamp

Three features from `docs/BUILDTRACK_PANEL_FEATURES.md`, built so they feed each other.

| Feature | Database | App | Connected to |
|---|---|---|---|
| Weekly progress report | none | `lib/weeklyReport.ts` (tested), `WeeklyReportModal`, buttons on Engineer Reports and Client Overview | Reads the same pins, NCRs, inspections, daily reports and questions as the dashboards; draws the S-curve; the client version leaves out quality and safety |
| Late-work alerts | 0038 `generate_escalations()` | `refreshReminders`, bell labels | Uses `notify_user`, so the bell, realtime and the email queue all carry it; links to the engineer dashboard or the admin project overview |
| Photo time and place stamp | 0039 site location + stamp trigger | `photoStamp.ts`, `StampChip`, project form, offline queue payload, privacy notice | Pin photos and QA evidence; feeds the verification queue (a warning line above a photo set), the evidence lock story and the integrity notes (L2, F1, F2) |

## Behaviour to know
- Alerts are created when someone opens the app (like the existing reminders), at most one per person and project per day. They do not need a scheduled job; email still needs the owner's Brevo steps.
- A photo is never blocked for location or time reasons; it is flagged. Location is asked only when a photo is added. `PRIVACY_VERSION` is now `2026-10-13`.
- Only the Super Admin and admins with the Projects permission can set a project's site location.

## Checks
SQL tests 284/284 (new: `99-escalations`, `99-photo-stamp`), lib tests 74/74 (new: weekly report, photo stamp), type-check and build clean. Live: migrations applied and verified (privileges, columns, triggers, haversine sample, advisors); rolled-back dry run of the alerts for every real engineer / admin (nothing due today). Browser (temporary harness, deleted): weekly dialog and printed layout, stamp chips and warning line, project site form.

Not verified: a real phone's GPS prompt and a real print dialog (the print layout was checked as rendered HTML).

# 2026-10-11: Phase 2 (without biometrics): daily reports, client portal, field screens

Database: migration 0021 (`sql/0021_daily_reports_and_questions.md`). The biometric parts were left out on purpose (decision pending).

## What users get
| Who | New |
|---|---|
| Foreman | **Daily progress report**: pick today or any of the last 13 days, weather, head count, work done, issues, delays, safety; save a draft, submit (confirmation), print / save as PDF. **Corrective actions**: everything sent back or marked as a problem, with the engineer's reason. **Photo documentation**: gallery of all project photos. Shared **Report dialog** (checklist, photos, note, start work / send for review). |
| Engineer | **Site logs and reports** page: submitted daily reports (search, expand, print, reopen for correction, CSV), **client questions** (answer in plain language), **Print progress report** (summary, by sheet, open issues, late work). |
| Client | **Overview** in plain language (approved share, schedule message, target date, progress by area, recently finished, latest site log), **Site logs and photos** (daily logs, photo gallery with viewer), **Ask the team** (questions with or without a work item, answers and notifications). |
| Everyone | Notification kinds for report submitted / reopened and question asked / answered. |

## Honesty and structure
- `SampleNotice` banner on every screen that still shows example data (Admin biometrics, mapping, progress, version control; Foreman attendance, quality control, QA workflow, issues, and the lower half of Daily Work; Client ticket).
- `lib/reportFormat.ts` holds the pure parts (dates, print HTML) so they are tested without a database client.

## Verification
`pnpm test:sql` 184/184 (13 new), `pnpm test:lib` 41/41 (2 new), `npx tsc --noEmit`, `pnpm build`. Browser pass with the temporary mock backend (removed afterwards): foreman report (validation, draft, submit with confirmation, read-only after), engineer reopen and answer, client overview / logs / photo viewer / question form (validation, send), foreman corrective list with the engineer's note, console clean. The print dialog itself was not driven; the print HTML is covered by unit tests (escaping, structure).

## Not done
Biometric attendance, PWA / offline queue, QR scan, voice notes, email delivery of notifications, global search, report PDFs beyond the print route.

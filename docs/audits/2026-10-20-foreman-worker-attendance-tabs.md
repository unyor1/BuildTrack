# Foreman worker directory and daily attendance

2026-10-20. Foreman Biometric Attendance only; no schema, grants or production data changed.

- Two distinct tabs: Workers (searchable, paginated project worker directory) and Attendance records (today by default, calendar-selected past dates, paginated scan records). Workers without scans and inactive workers remain visible for history.
- Clicking a worker or a worker name in the daily records opens a read-only details dialog with private portrait, profile/contact information, selected-day clock-in/out counts, first clock-in, last clock-out and records. Counts/boundary times query the entire selected day, not the current 30-record page. No payroll hours or absence assumptions are invented.
- Removed the Foreman notice, old live clock/summary/latest-scan dashboard and text standalone button. The standalone launch link is an accessible, labelled icon opening the same selected-project URL in a new tab.
- New queries explicitly filter project/worker and use Philippine-midnight inclusive/exclusive date bounds. Live project worker/event subscriptions, a 15-second fallback and reconnect/visibility refresh update the directory/details. State keys and effect cleanup prevent previous project/date/worker results appearing after navigation. Existing live RLS was verified read-only: project staff read only projects they can view.
- Standalone source SHA-256 values before and after matched exactly for `BiometricAttendancePage.tsx`, `AttendanceBoard.tsx`, `attendance.ts` and `attendanceModel.ts`. None of those files were edited for this task.

Verification: `pnpm check` passed outside the sandbox (TypeScript, 109 helper tests, component/handler suites, 412 SQL cases and production build). The new `test:foreman-attendance` suite tests actual tab/search/calendar/detail/pagination controls, read-only UI, icon-only link, stale project guards, query scoping, Manila midnight/end bounds, counts beyond a single record page, errors and resource subscription cleanup/recovery. Existing standalone attendance interaction tests passed. No browser visual check or real biometric scan was performed during this task.

# Admin worker profile details — 2026-10-20

## Fix

Admin profile row clicks previously populated the edit form and invoked `onRegister`, switching to the Register worker tab. Profile selection now opens `WorkerAttendanceDetails`; only the explicit Admin **Edit profile** action switches tabs.

The Admin profiles tab reuses the Foreman detailed `WorkerDirectory` table: worker name/code, trade, contact/email, active status, fingerprint status and a keyboard-accessible View details button. It keeps search/pagination when closing a profile, resets the page on search, and uses the shared project-scoped database loader and automatic updates instead of a separate 200-record capped list.

The profile dialog includes the saved private portrait, contact details, attendance date selector, whole-day summary, paginated attendance records and daily/weekly/monthly reports. Edit uses the freshly loaded profile rather than a possibly stale directory row. Foreman callers do not supply an edit callback and remain read-only. Registration, camera capture and physical fingerprint enrollment retain their existing workflow.

## Database and security

No migration or policy change is needed. Existing `attendance_workers` and `biometric_attendance_events` SELECT queries retain project and worker filters; existing staff/project RLS and private photo access apply. The Admin role, biometric-management permission and MFA checks remain in `BiometricAdminGuard`. Opening/closing profiles performs no registration, enrollment or database mutation.

The standalone attendance page, board and shared attendance model/data files are unchanged (SHA-256 verified).

## Checks

- `test-admin-worker-profiles`: actual Admin component selection/close/edit navigation, project/today props, preserved search/page, fresh edit field values and no accidental database writes.
- `test-foreman-attendance`: actual detailed table and shared modal, attendance scoping/pagination/summary, explicit Admin edit with fresh data, no edit control for Foreman or failed profile loads.
- Existing Admin access, camera/private-photo-save and sensor enrollment tests remain in the full `pnpm check` pipeline.
- Full `pnpm check` passed: TypeScript, all component/helper suites, 412 SQL regression cases and the production build.

UI behavior is covered through isolated component interaction tests; no visual browser or physical sensor test was performed for this change.

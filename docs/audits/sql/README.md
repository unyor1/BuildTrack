# SQL documentation (BuildTrack Supabase project only)

One document per SQL file in `supabase/`. Same sections every time so changes are easy to review.

| Doc | SQL file | Status |
|---|---|---|
| [0001_profiles_rbac](0001_profiles_rbac.md) | `supabase/migrations/0001_profiles_rbac.sql` | Applied |
| [0002_admin_mfa_aal2](0002_admin_mfa_aal2.md) | `supabase/migrations/0002_admin_mfa_aal2.sql` | Applied |
| [0003_projects](0003_projects.md) | `supabase/migrations/0003_projects.sql` | Applied |
| [0004_default_admin_permissions](0004_default_admin_permissions.md) | `supabase/migrations/0004_default_admin_permissions.sql` | Applied |
| [0005_fix_project_audit_trigger](0005_fix_project_audit_trigger.md) | `supabase/migrations/0005_fix_project_audit_trigger.sql` | Applied (completed via connector 2026-10-09) |
| [0006_project_leads_and_scope](0006_project_leads_and_scope.md) | `supabase/migrations/0006_project_leads_and_scope.sql` | Applied |
| [0007_lock_down_function_execute](0007_lock_down_function_execute.md) | `supabase/migrations/0007_lock_down_function_execute.sql` | Applied (connector) |
| [0008_activity_feed](0008_activity_feed.md) | `supabase/migrations/0008_activity_feed.sql` | Applied (connector) |
| [0009_blueprints](0009_blueprints.md) | `supabase/migrations/0009_blueprints.sql` | Applied (connector) |
| [0010_pins](0010_pins.md) | `supabase/migrations/0010_pins.sql` | Applied (connector) |
| [0011_pin_timeline_names](0011_pin_timeline_names.md) | `supabase/migrations/0011_pin_timeline_names.sql` | Applied (connector) |
| [0012_user_role](0012_user_role.md) | `supabase/migrations/0012_user_role.sql` | Applied (connector) |
| [0013_access_requests](0013_access_requests.md) | `supabase/migrations/0013_access_requests.sql` | Applied (connector) |
| [0014_editor_data](0014_editor_data.md) | `supabase/migrations/0014_editor_data.sql` | Applied (connector) |
| [0015_email_whitelist](0015_email_whitelist.md) | `supabase/migrations/0015_email_whitelist.sql` | Applied (connector) |
| [0016_fix_access_request_guard](0016_fix_access_request_guard.md) | `supabase/migrations/0016_fix_access_request_guard.sql` | Applied (connector) |
| [0017_editor_v2](0017_editor_v2.md) | `supabase/migrations/0017_editor_v2.sql` | Applied (connector) |
| [0018_editor_objects_groups](0018_editor_objects_groups.md) | `supabase/migrations/0018_editor_objects_groups.sql` | Applied (connector) |
| [0019_editor_images_reorder](0019_editor_images_reorder.md) | `supabase/migrations/0019_editor_images_reorder.sql` | Applied (connector) |
| [0020_notifications_invites_audit](0020_notifications_invites_audit.md) | `supabase/migrations/0020_notifications_invites_audit.sql` | Applied (connector) |
| [0021_daily_reports_and_questions](0021_daily_reports_and_questions.md) | `supabase/migrations/0021_daily_reports_and_questions.sql` | Applied (connector) |
| [0022_system_settings](0022_system_settings.md) | `supabase/migrations/0022_system_settings.sql` | Applied (connector) |
| [0023_project_export_audit](0023_project_export_audit.md) | `supabase/migrations/0023_project_export_audit.sql` | Applied (connector) |
| [0024_annotation_text_format](0024_annotation_text_format.md) | `supabase/migrations/0024_annotation_text_format.sql` | Applied (connector) |
| [0025_qa_module](0025_qa_module.md) | `supabase/migrations/0025_qa_module.sql` | Applied (connector) |
| [0026_qa_measure_requires_value](0026_qa_measure_requires_value.md) | `supabase/migrations/0026_qa_measure_requires_value.sql` | Applied (connector) |
| [0027_client_snags](0027_client_snags.md) | `supabase/migrations/0027_client_snags.sql` | Applied (connector) |
| [0028_email_notifications](0028_email_notifications.md) | `supabase/migrations/0028_email_notifications.sql` | Applied (connector) |
| [0029_google_registration_gate](0029_google_registration_gate.md) | `supabase/migrations/0029_google_registration_gate.sql` | Applied (connector) |
| [0030_identity_verification_privacy](0030_identity_verification_privacy.md) | `supabase/migrations/0030_identity_verification_privacy.sql` (+ `0031_privacy_consent_pending.sql`) | Applied (connector) |
| [0032_data_requests](0032_data_requests.md) | `supabase/migrations/0032_data_requests.sql` | Applied (connector) |
| [0033_evidence_lock](0033_evidence_lock.md) | `supabase/migrations/0033_evidence_lock.sql` (+ `0035_history_photo_removed.sql`, `0037_evidence_check_visibility.sql`) | Applied (connector) |
| [0034_realtime](0034_realtime.md) | `supabase/migrations/0034_realtime.sql` | Applied (connector) |
| [0036_rls_performance](0036_rls_performance.md) | `supabase/migrations/0036_rls_performance.sql` | Applied (connector) |
| [0038_escalation_alerts](0038_escalation_alerts.md) | `supabase/migrations/0038_escalation_alerts.sql` | Applied (connector) |
| [0039_photo_stamp](0039_photo_stamp.md) | `supabase/migrations/0039_photo_stamp.sql` | Applied (connector) |
| [seed_super_admin](seed_super_admin.md) | `supabase/seeds/seed_super_admin.sql` | Done (1 Super Admin exists) |

## Document template (copy for every new migration)
1. Header table: file, date written, date applied, depends on, status, reversible
2. Purpose (why, 2-3 lines)
3. Objects created or changed (table)
4. Security and RLS (who can do what)
5. Verification (queries to prove it worked)
6. Rollback (SQL to undo)
7. Notes / known limits

Also add a row to `../migrations-log.md` and an audit note in `docs/audits/`.
Every migration must also get tests in `supabase/tests/` and pass `pnpm test:sql` before it is handed over.
Order matters: run migrations in numeric order, never edit an applied file (add a new migration instead).

# 0023: Audit trail for project backups

| Field | Value |
|---|---|
| File | `supabase/migrations/0023_project_export_audit.sql` |
| Written / applied | 2026-10-11, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Connector migration name | `project_export_audit` |
| Depends on | 0001-0022 |
| Status | **Applied** and verified (rolled-back live check, advisor reviewed) |
| Reversible | Yes: `drop function public.log_project_export(uuid, boolean, integer);` |

## Purpose
The project backup (Admin > Backup and export) is built in the admin's browser from data and files the admin may already read. This function records that a backup was made.

## Objects
| Type | Name | Notes |
|---|---|---|
| RPC | `log_project_export(project, with_files, rows)` | needs `projects.manage` (includes MFA); the project must exist; writes one `project.export` row to `audit_log` with the project id, whether files were included and the row count |

## Tests (`supabase/tests/99-export-audit.cases.mjs`, suite 189/189)
Permission and MFA, unknown project, the audit row's content, and that nobody can write the audit log directly.

## Verification (2026-10-11, live, rolled back)
As the Super Admin the function wrote one `project.export` row inside a transaction that was rolled back. Advisor: `log_project_export` is a new intended SECURITY DEFINER RPC that checks the caller inside.

# Local/offline synchronization recommendation — 2026-10-22

## Documentation request

Saved the requested explanation and recommendation in `docs/BUILDTRACK_LOCAL_OFFLINE_SYNC_RECOMMENDATION.md`. Added the requested assessment of keeping online routes and automatically continuing locally during an internet outage.

## Scope and conclusions

- Documentation only: no changes to application source, database schemas, cloud/local records, authentication configuration, Docker installation, DNS or deployment.
- Distinguishes PostgreSQL, Docker, Supabase, pgAdmin and custom synchronization. Records the current limited browser queue and does not claim full offline operation exists.
- Covers local hosting, account provisioning, scoped data/files, durable pending operations, deduplication, permissions, conflicts, evidence preservation, tests, backups and operational requirements.
- Same route paths are feasible. Same full URL requires domain/DNS/HTTPS and identity/backend planning. Recommends stable on-site local gateway access with background sync, rather than changing independent backends during saves.
- Separately documents cloud-first fallback, unreliable online indicators, ambiguous mutation outcomes, browser local-network protections and the inability of remote users to reach an isolated site automatically.
- Official Supabase guidance informed the distinction between a development stack and a production self-hosted deployment, plus separate database/file/authentication requirements. Network/browser recommendations are linked to official documentation and labelled as proposals.

## Verification and handoff

Both new Markdown files passed UTF-8, trailing-whitespace and known-secret checks. Required-topic coverage and all seven reference entries were checked; `git diff --check` passed. No application regression/build or database test was run for these documentation-only additions. Do not infer implementation, approval to copy live data, or a deployment from this document. No commit/push was requested or performed for this turn.

Unrelated working-tree changes in `supabase/.temp/cli-latest` and untracked `package-lock.json` are preserved.

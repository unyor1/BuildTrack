# 2026-10-09: Guarded migration runner (`pnpm db:status` / `pnpm db:apply`)

Category: tooling / process. Database: creates schema `supabase_migrations` + table `schema_migrations` on first run.

## Why
Migrations were applied by hand in the SQL Editor. One run failed because the Markdown doc was pasted instead of the `.sql` file. The owner asked for the agent to edit AND execute migrations, still audited.

## What it does (`scripts/db-migrate.mjs`)
- Talks to the Supabase Management API (`POST /v1/projects/<ref>/database/query`) with a personal access token.
- **Pinned to the BuildTrack project ref** (`ruimjlhsfpaezkgfphsz`); there is no option to point it elsewhere.
- Tracks applied files in `supabase_migrations.schema_migrations` (version, name, SHA-256 checksum, applied_at, baselined). On the first run it probes the database and marks migrations that were applied by hand as `baselined` (no SQL is re-run).
- `apply`: runs `pnpm test:sql` first (abort on failure); blocks if an applied file was edited (checksum drift); blocks destructive SQL (DROP / ALTER ... DROP / TRUNCATE / DELETE FROM) unless `--allow-destructive`; runs each migration and its tracking row in one transaction; stops at the first failure.
- Appends every run (time, file, APPLIED/FAILED, checksum) to the "Execution history" table in `migrations-log.md`.
- `--dry-run` lists what would run.

## Security notes
- A Supabase personal access token is **account-wide** (it can reach every project on the account, including non-BuildTrack ones). The script only ever targets the BuildTrack ref and `CLAUDE.md` forbids any other project, but the token itself is broader than that. Use a dedicated token, keep it only in `.env.secrets` (gitignored), and revoke it when you no longer want the agent to run migrations.
- The token is never printed or written anywhere except where the owner puts it.
- No backups are taken (needs the database password). Keep migrations additive; for risky changes export data first.

## Verification status
- Verified: argument handling, clear "no token" message, API error reporting (a fake token returns a clean 401), syntax.
- NOT yet verified against the real project (no valid token available in this session): the first `db:status` run must confirm the endpoint, the probes and the baselining.

## Rules for future migrations
Write the `.sql`, add tests in `supabase/tests/`, add `sql/NNNN_*.md` doc and a log row, run `pnpm db:apply`, then update statuses.

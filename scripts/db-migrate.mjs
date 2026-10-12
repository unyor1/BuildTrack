// BuildTrack migration runner. Applies supabase/migrations/*.sql to the BuildTrack Supabase project through the
// Supabase Management API, with guardrails, and writes every run to docs/audits/migrations-log.md.
//
//   pnpm db:status                      show applied / pending / changed migrations (read-only)
//   pnpm db:apply                       run the SQL tests, then apply pending migrations in order
//   pnpm db:apply -- --dry-run          show what would run, change nothing
//   pnpm db:apply -- --allow-destructive   needed when a migration drops/deletes/truncates something
//
// Guardrails: pinned to ONE project ref (never any other project); tests must pass first; destructive SQL needs a flag;
// each migration runs in its own transaction together with its tracking row; applied files that were edited are blocked.
// The access token comes from the SUPABASE_ACCESS_TOKEN environment variable or .env.secrets (gitignored). It is never printed.
import { createHash } from "node:crypto"
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const PROJECT_REF = "ruimjlhsfpaezkgfphsz" // BuildTrack only. Do not change to another project.
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const migrationsDir = join(root, "supabase", "migrations")
const logFile = join(root, "docs", "audits", "migrations-log.md")

const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith("--")) ?? "status"
const dryRun = args.includes("--dry-run")
const allowDestructive = args.includes("--allow-destructive")

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim()
  const file = join(root, ".env.secrets")
  if (existsSync(file)) {
    const match = readFileSync(file, "utf8").match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)
    if (match) return match[1].trim()
  }
  return ""
}
const token = loadToken()

async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Supabase API ${response.status}: ${text.slice(0, 600)}`)
  return text ? JSON.parse(text) : []
}

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`
const checksum = (text) => createHash("sha256").update(text).digest("hex")

const migrations = readdirSync(migrationsDir)
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort()
  .map((file) => {
    const body = readFileSync(join(migrationsDir, file), "utf8")
    return { file, version: file.slice(0, 4), name: file.slice(5, -4), body, sum: checksum(body) }
  })

// Used ONCE, to recognise migrations that were applied by hand in the SQL Editor before this runner existed.
const probes = {
  "0001": "select to_regclass('public.profiles') is not null as applied",
  "0002": "select to_regprocedure('public.is_aal2()') is not null as applied",
  "0003": "select to_regclass('public.projects') is not null as applied",
  "0004": "select to_regprocedure('public.grant_default_admin_permissions()') is not null as applied",
  "0005": "select exists (select 1 from pg_trigger where tgname = 'projects_actor') as applied",
  "0006": "select to_regprocedure('public.get_project_team(uuid)') is not null as applied",
}

async function ensureTracking() {
  await sql(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text not null primary key, statements text[], name text,
      checksum text, applied_at timestamptz not null default now(), baselined boolean not null default false
    );
    alter table supabase_migrations.schema_migrations add column if not exists checksum text;
    alter table supabase_migrations.schema_migrations add column if not exists applied_at timestamptz not null default now();
    alter table supabase_migrations.schema_migrations add column if not exists baselined boolean not null default false;
  `)
  const existing = await sql("select count(*)::int as n from supabase_migrations.schema_migrations")
  if (existing[0].n > 0) return
  for (const migration of migrations) {
    const probe = probes[migration.version]
    if (!probe) continue
    const [{ applied }] = await sql(probe)
    if (applied) {
      await sql(
        `insert into supabase_migrations.schema_migrations (version, name, checksum, baselined)
         values (${quote(migration.version)}, ${quote(migration.name)}, ${quote(migration.sum)}, true) on conflict do nothing`,
      )
      console.log(`  baseline: ${migration.file} was already applied by hand`)
    }
  }
}

async function state() {
  const rows = await sql("select version, checksum from supabase_migrations.schema_migrations")
  const applied = new Map(rows.map((row) => [row.version, row.checksum]))
  return migrations.map((m) => ({
    ...m,
    status: !applied.has(m.version) ? "pending" : applied.get(m.version) !== m.sum ? "CHANGED" : "applied",
  }))
}

function destructiveReasons(body) {
  const code = body.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  const patterns = [
    [/\bdrop\s+(table|schema|column|type|function|trigger|policy|index|view)\b/i, "DROP"],
    [/\balter\s+table\b[^;]*\bdrop\s+(column|constraint)\b/i, "ALTER TABLE ... DROP"],
    [/\btruncate\b/i, "TRUNCATE"],
    [/\bdelete\s+from\b/i, "DELETE FROM"],
  ]
  return patterns.filter(([re]) => re.test(code)).map(([, label]) => label)
}

function appendHistory(rows) {
  if (!existsSync(logFile)) return
  const text = readFileSync(logFile, "utf8")
  let out = ""
  if (!text.includes("## Execution history")) {
    out += [
      "",
      "## Execution history (written automatically by `pnpm db:apply`)",
      "| When (UTC) | Migration | Result | SHA-256 | Notes |",
      "|---|---|---|---|---|",
      "",
    ].join("\n")
  }
  const stamp = new Date().toISOString().slice(0, 19)
  out += rows
    .map((r) => `| ${stamp} | \`${r.file}\` | ${r.result} | ${r.sum.slice(0, 12)} | ${r.notes ?? ""} |\n`)
    .join("")
  appendFileSync(logFile, out)
}

function requireToken() {
  if (token) return
  console.error(
    "No SUPABASE_ACCESS_TOKEN found.\n" +
      "Create a personal access token at https://supabase.com/dashboard/account/tokens and either\n" +
      "  - set it in the terminal:   $env:SUPABASE_ACCESS_TOKEN = \"sbp_...\"   (PowerShell), or\n" +
      "  - add the line  SUPABASE_ACCESS_TOKEN=sbp_...  to .env.secrets (gitignored).",
  )
  process.exit(3)
}

async function main() {
  console.log(`BuildTrack migrations -> project ${PROJECT_REF}`)
  requireToken()
  await ensureTracking()
  const list = await state()
  for (const m of list) console.log(`  ${m.status.padEnd(8)} ${m.file}`)

  if (command === "status") return
  if (command !== "apply") {
    console.error(`Unknown command "${command}". Use: status | apply`)
    { process.exitCode = 1; return }
  }
  const changed = list.filter((m) => m.status === "CHANGED")
  if (changed.length) {
    console.error(`\nBlocked: already-applied migration(s) were edited: ${changed.map((m) => m.file).join(", ")}.\nNever edit an applied migration; add a new one instead.`)
    { process.exitCode = 4; return }
  }
  const pending = list.filter((m) => m.status === "pending")
  if (!pending.length) return console.log("\nNothing to apply.")

  for (const m of pending) {
    const reasons = destructiveReasons(m.body)
    if (reasons.length && !allowDestructive) {
      console.error(`\nBlocked: ${m.file} contains destructive SQL (${reasons.join(", ")}). Review it, then rerun with --allow-destructive.`)
      { process.exitCode = 5; return }
    }
  }
  if (dryRun) return console.log(`\nDry run: would apply ${pending.map((m) => m.file).join(", ")}`)

  console.log("\nRunning SQL tests first...")
  const tests = spawnSync(process.execPath, [join(root, "supabase", "tests", "run-sql-tests.mjs")], { stdio: "inherit" })
  if (tests.status !== 0) {
    console.error("\nBlocked: SQL tests failed. Nothing was applied.")
    { process.exitCode = 6; return }
  }

  const history = []
  for (const m of pending) {
    try {
      await sql(
        `begin;\n${m.body}\n;insert into supabase_migrations.schema_migrations (version, name, checksum) values (${quote(m.version)}, ${quote(m.name)}, ${quote(m.sum)});\ncommit;`,
      )
      console.log(`  applied  ${m.file}`)
      history.push({ ...m, result: "APPLIED", notes: allowDestructive ? "destructive allowed" : "" })
    } catch (error) {
      console.error(`  FAILED   ${m.file}\n  ${error.message}\n  (its transaction was not committed; later migrations were not run)`)
      history.push({ ...m, result: "FAILED", notes: error.message.slice(0, 120).replace(/\|/g, "/").replace(/\n/g, " ") })
      appendHistory(history)
      { process.exitCode = 7; return }
    }
  }
  appendHistory(history)
  console.log("\nDone. Update the status rows in docs/audits/migrations-log.md and docs/audits/sql/README.md.")
}

main().catch((error) => {
  console.error(error.message)
  { process.exitCode = 1; return }
})

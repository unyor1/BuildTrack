// Load test: one large project in the in-memory database (every migration, every trigger and Row Level Security on), then the
// queries the app really runs, timed as each role. Run: pnpm test:load   (optional: --pins 5000 --sheets 50 --ncr 500 --ir 300)
// What it measures: database work and the app's own maths. What it does not: network time to Supabase (add that on top).
import { createDatabase } from "../supabase/tests/harness.mjs"
import { byZone, manilaToday, sCurve, summarize } from "../src/lib/progress.ts"

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at > -1 ? Number(process.argv[at + 1]) : fallback
}
const SHEETS = arg("sheets", 50)
const PINS = arg("pins", 5000)
const NCRS = arg("ncr", 500)
const INSPECTIONS = arg("ir", 300)

const db = await createDatabase({ quiet: true })
const ids = {}
const asOwner = () => db.exec("reset role")
async function as(key, aal = "aal2") {
  await db.exec("reset role")
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: ids[key], aal, role: "authenticated" })])
  await db.exec("set role authenticated")
}
async function addUser(key, role) {
  const { rows } = await db.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [`${key}@load.test`, JSON.stringify({ full_name: key })])
  ids[key] = rows[0].id
  await db.query("update public.profiles set role = $2, status = 'active', identity_status = 'verified' where id = $1", [rows[0].id, role])
}
const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

// ---------- Seed ----------
const seedStart = process.hrtime.bigint()
await addUser("eng", "engineer")
await addUser("fore", "foreman")
await addUser("client", "client")
await asOwner()
const project = (await db.query("insert into public.projects (code, name, start_date, end_date) values ('LOAD-1', 'Load test tower', current_date - 180, current_date + 180) returning id")).rows[0].id
await db.query("insert into public.project_members (project_id, user_id) values ($1, $2), ($1, $3), ($1, $4)", [project, ids.eng, ids.fore, ids.client])

await as("eng")
const sheets = []
for (let s = 0; s < SHEETS; s++) sheets.push((await db.query("insert into public.blueprints (project_id, title, level) values ($1, $2, $3) returning id", [project, `Sheet ${s + 1}`, `L${(s % 12) + 1}`])).rows[0].id)
const statuses = ["not_started", "in_progress", "for_review", "issue", "verified"]
const pins = []
for (let i = 0; i < PINS; i++) {
  const due = `current_date + ${(i % 360) - 180}`
  const row = await db.query(`insert into public.pins (project_id, blueprint_id, x, y, title, due_date, assigned_to) values ($1, $2, $3, $4, $5, ${due}, $6) returning id`, [project, sheets[i % SHEETS], (i * 7) % 100, (i * 13) % 100, `Work item ${i + 1}`, ids.fore])
  pins.push(row.rows[0].id)
}
for (let i = 0; i < PINS; i++) {
  const status = statuses[i % statuses.length]
  if (status !== "not_started") await db.query("update public.pins set status = $2 where id = $1", [pins[i], status])
}
const template = (await db.query("select id from public.qa_templates where is_system order by name limit 1")).rows[0].id
for (let i = 0; i < INSPECTIONS; i++) await db.query("select public.request_inspection($1, $2, $3, $4)", [project, template, `Inspection ${i + 1}`, pins[i]])
for (let i = 0; i < NCRS; i++) await db.query("select public.raise_defect($1, $2, null, 'workmanship', $3, 'general', null, $4, $5)", [project, `Defect ${i + 1}`, ["minor", "major", "critical"][i % 3], pins[i], ids.fore])
await asOwner()
const events = Number((await db.query("select count(*) n from public.pin_events")).rows[0].n)
const seedSeconds = (ms(seedStart) / 1000).toFixed(1)

// ---------- Measure ----------
const results = []
async function measure(label, who, run, runs = 5) {
  const times = []
  let rows = 0
  for (let r = 0; r < runs; r++) {
    await as(who)
    const start = process.hrtime.bigint()
    rows = await run()
    times.push(ms(start))
  }
  await asOwner()
  results.push({ query: label, as: who, rows, "median ms": Math.round(median(times) * 10) / 10 })
}
const paged = async (sql, params) => {
  let total = 0
  for (let from = 0; ; from += 1000) {
    const page = (await db.query(`${sql} limit 1000 offset ${from}`, params)).rows.length
    total += page
    if (page < 1000) return total
  }
}

await measure("All pins of the project (paged, as the app reads them)", "eng", () => paged("select * from public.pins where project_id = $1 order by created_at, id", [project]))
await measure("Same, as the client (Row Level Security)", "client", () => paged("select * from public.pins where project_id = $1 order by created_at, id", [project]))
await measure("Sidebar badges (for review + issues)", "eng", async () => Number((await db.query("select count(*) filter (where status = 'for_review') + count(*) filter (where status = 'issue') n from public.pins where category <> 'note'")).rows[0].n))
await measure("Verification queue (for review, oldest first)", "eng", async () => (await db.query("select * from public.pins where project_id = $1 and status = 'for_review' order by updated_at", [project])).rows.length)
await measure("QA summary (get_qa_summary)", "eng", async () => ((await db.query("select public.get_qa_summary($1) s", [project])).rows[0].s ? 1 : 0))
await measure("NCR register (paged)", "eng", () => paged("select * from public.qa_defects where project_id = $1 order by number desc", [project]))
await measure("Inspection list (paged)", "eng", () => paged("select * from public.qa_inspections where project_id = $1 order by number desc", [project]))
await measure("Sheet history, newest 120 (get_sheet_history)", "eng", async () => (await db.query("select * from public.get_sheet_history($1, 120)", [sheets[0]])).rows.length)
await measure("Pin timeline (get_pin_timeline)", "fore", async () => (await db.query("select * from public.get_pin_timeline($1)", [pins[2]])).rows.length)
await measure("Evidence check (pin_has_evidence)", "fore", async () => ((await db.query("select public.pin_has_evidence($1) e", [pins[2]])).rows[0].e ? 1 : 0))

// The app's own maths on the same rows (what the browser does after loading).
await as("eng")
// Supabase sends dates as text; PGlite returns Date objects, so convert to what the browser really receives.
const asText = (value) => (value instanceof Date ? value.toISOString() : value)
const allPins = (await db.query("select * from public.pins where project_id = $1", [project])).rows.map((pin) => ({ ...pin, due_date: pin.due_date ? asText(pin.due_date).slice(0, 10) : null, verified_at: asText(pin.verified_at) }))
const blueprints = (await db.query("select id, title, level, discipline from public.blueprints where project_id = $1", [project])).rows
await asOwner()
const today = manilaToday()
const mathTimes = { summarize: [], byZone: [], sCurve: [] }
for (let r = 0; r < 5; r++) {
  let start = process.hrtime.bigint()
  summarize(allPins, today)
  mathTimes.summarize.push(ms(start))
  start = process.hrtime.bigint()
  byZone(blueprints, allPins, today)
  mathTimes.byZone.push(ms(start))
  start = process.hrtime.bigint()
  sCurve(allPins, null, null, today)
  mathTimes.sCurve.push(ms(start))
}
for (const [name, times] of Object.entries(mathTimes)) results.push({ query: `App maths: ${name}`, as: "browser", rows: allPins.length, "median ms": Math.round(median(times) * 10) / 10 })

console.log(`\nLoad test: ${SHEETS} sheets, ${PINS} pins, ${events} timeline entries, ${INSPECTIONS} inspections, ${NCRS} NCRs (seeded in ${seedSeconds} s through the real triggers)\n`)
console.table(results)
console.log("In-memory Postgres (PGlite) on this machine, every migration and RLS on. Add network time to Supabase on top.")

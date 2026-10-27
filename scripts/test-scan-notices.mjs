import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { ignoredNotice, noticeDuration, pendingNotices, recordedNotice, unregisteredNotice } from "../src/lib/scanNoticeModel.ts"

// Attendance screen pop-ups: message texts, which scans pop up, the live hook and the pop-up itself.
const ana = { full_name: "Ana Reyes", worker_code: "A-1", photo_path: null }
const at = (hhmm) => `2026-10-27T${hhmm}:00+08:00`

const timeIn = recordedNotice({ id: "e1", direction: "in", occurred_at: at("08:20"), received_at: at("08:20"), schedule_flag: "late", minutes_off: 20, worker: ana })
assert.equal(timeIn.tone, "ok"); assert.equal(timeIn.title, "Time IN recorded"); assert.match(timeIn.message, /^Ana Reyes · 08:20:00 (am|AM) · Late 20 min$/)
assert.equal(recordedNotice({ id: "e2", direction: "out", occurred_at: at("17:05"), received_at: at("17:05"), schedule_flag: null, minutes_off: null, worker: ana }).title, "Time OUT recorded")
const repeat = ignoredNotice({ id: "i1", reason: "repeat", occurred_at: at("08:21"), received_at: at("08:21"), worker: ana, kept: { direction: "in", occurred_at: at("08:20") } })
assert.equal(repeat.tone, "warn"); assert.equal(repeat.title, "Already timed IN")
assert.match(repeat.message, /Ana Reyes already timed IN at 08:20:00 (am|AM)\. This scan was not recorded again\./)
assert.equal(ignoredNotice({ id: "i2", reason: "repeat", occurred_at: at("17:06"), received_at: at("17:06"), worker: ana, kept: { direction: "out", occurred_at: at("17:05") } }).title, "Already timed OUT")
assert.match(ignoredNotice({ id: "i3", reason: "out_of_order", occurred_at: at("16:00"), received_at: at("17:10"), worker: ana, kept: { direction: "out", occurred_at: at("17:05") } }).message, /later scan today/)
const unknown = unregisteredNotice({ id: "u1", reason: "no_match", sensor_slot: null, occurred_at: at("09:00"), received_at: at("09:00"), worker: null })
assert.equal(unknown.tone, "error"); assert.equal(unknown.title, "Fingerprint not registered"); assert.match(unknown.message, /Nothing was recorded/)
assert.match(unregisteredNotice({ id: "u2", reason: "not_linked", sensor_slot: "7", occurred_at: at("09:00"), received_at: at("09:00"), worker: null }).message, /slot 7/)
assert.equal(unregisteredNotice({ id: "u3", reason: "inactive", sensor_slot: "3", occurred_at: at("09:00"), received_at: at("09:00"), worker: ana }).title, "Worker inactive")
assert.equal(unregisteredNotice({ id: "u4", reason: "other_device", sensor_slot: "3", occurred_at: at("09:00"), received_at: at("09:00"), worker: ana }).title, "Wrong scanner")
assert.ok(noticeDuration(timeIn) < noticeDuration(repeat), "Warnings stay longer than acknowledgements")

const rows = {
  recorded: [{ id: "old", direction: "in", occurred_at: at("07:00"), received_at: at("07:00"), worker: ana }, { id: "e1", direction: "in", occurred_at: at("08:20"), received_at: at("08:20"), worker: ana }],
  ignored: [{ id: "i1", reason: "repeat", occurred_at: at("08:21"), received_at: at("08:21"), worker: ana, kept: { direction: "in", occurred_at: at("08:20") } }],
  unregistered: [{ id: "u1", reason: "no_match", sensor_slot: null, occurred_at: at("08:22"), received_at: at("08:22"), worker: null }],
}
const fresh = pendingNotices(rows, Date.parse(at("08:00")), new Set(["recorded:e1"]))
assert.deepEqual(fresh.map((n) => n.key), ["unregistered:u1", "ignored:i1"], "Newest first; older than the screen and already shown are skipped")

// The hook and the pop-up with isolated React hooks and database.
const url = (source) => "data:text/javascript;base64," + Buffer.from(source).toString("base64")
let state = [], refs = [], effects = [], queued = [], cursor = 0
globalThis.__noticeHooks = {
  useState(initial) { const n = cursor++; if (!(n in state)) state[n] = initial; return [state[n], (v) => { state[n] = typeof v === "function" ? v(state[n]) : v }] },
  useRef(initial) { const n = cursor++; if (!(n in refs)) refs[n] = { current: initial }; return refs[n] },
  useCallback(fn, deps) { const n = cursor++; const old = state[n]; if (!old || deps.some((d, i) => d !== old.deps[i])) state[n] = { fn, deps }; return state[n].fn },
  useEffect(fn, deps) { const n = cursor++; const old = effects[n]; if (!old || deps.some((d, i) => d !== old.deps[i])) queued.push(() => { old?.cleanup?.(); effects[n] = { deps, cleanup: fn() } }) },
}
const hooks = url("const h=globalThis.__noticeHooks;export const useState=(...a)=>h.useState(...a);export const useRef=(...a)=>h.useRef(...a);export const useCallback=(...a)=>h.useCallback(...a);export const useEffect=(...a)=>h.useEffect(...a);")
let tables = { biometric_attendance_events: [], attendance_ignored_scans: [], attendance_unregistered_scans: [] }, queries = [], channels = [], intervals = []
let holdRead = null
globalThis.__noticeDB = {
  from(table) {
    const query = { table, filters: [] }
    queries.push(query)
    const chain = { select: (cols) => ((query.cols = cols), chain), eq: (c, v) => (query.filters.push(["eq", c, v]), chain), gte: (c, v) => (query.filters.push(["gte", c, v]), chain), order: () => chain,
      range: async (from, to) => {
        query.range = [from, to]
        const answer = table === "attendance_unregistered_scans" && tables.broken
          ? { data: null, error: { message: "missing" } } : { data: tables[table].slice(from, to + 1), error: null }
        if (holdRead) await holdRead
        return answer
      } }
    return chain
  },
  channel(name) { const ch = { name, listens: [], on: (kind, spec) => (ch.listens.push(spec.table), ch), subscribe: () => ch }; channels.push(ch); return ch },
  removeChannel(ch) { ch.removed = true },
}
globalThis.window = { setTimeout: (fn) => (fn(), 1), clearTimeout() {}, setInterval: (fn) => (intervals.push(fn), intervals.length), clearInterval() {} }
async function compile(path, replacements) {
  let source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [name, replacement] of Object.entries({ react: hooks, "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"), ...replacements })) source = source.replaceAll(`from "${name}"`, `from ${JSON.stringify(replacement)}`)
  return import(url(source))
}
const model = new URL("../src/lib/scanNoticeModel.ts", import.meta.url).href
const { useScanNotices } = await compile("../src/lib/scanNotices.ts", { "./supabase": url("export const supabase=globalThis.__noticeDB"), "./scanNoticeModel": model })
let result
async function run(projectId = "project") {
  for (let pass = 0; pass < 3; pass++) {
    cursor = 0
    result = useScanNotices(projectId)
    const tasks = queued; queued = []; tasks.forEach((fn) => fn())
    await new Promise((resolve) => setImmediate(resolve))
  }
}
const now = new Date().toISOString()
tables.biometric_attendance_events = [{ id: "before", direction: "in", occurred_at: "2026-01-01T00:00:00Z", received_at: "2026-01-01T00:00:00Z", worker: ana }]
await run()
assert.equal(result.current, null, "Scans from before the screen opened never pop up")
assert.deepEqual(channels[0].listens, ["biometric_attendance_events", "attendance_ignored_scans", "attendance_unregistered_scans"])
assert.ok(queries.every((q) => q.filters.some(([k, c, v]) => k === "eq" && c === "project_id" && v === "project")), "Only the selected project")
tables.attendance_ignored_scans = [{ id: "rep", reason: "repeat", occurred_at: now, received_at: now, worker: ana, kept: { direction: "in", occurred_at: now } }]
await intervals.at(-1)(); await run()
assert.equal(result.current?.title, "Already timed IN")
result.dismiss(); await run()
assert.equal(result.current, null)
await intervals.at(-1)(); await run()
assert.equal(result.current, null, "Each scan pops up once")
tables.broken = true
tables.biometric_attendance_events = [{ id: "new", direction: "out", occurred_at: now, received_at: now, worker: ana }]
await intervals.at(-1)(); await run()
assert.equal(result.current?.title, "Time OUT recorded", "A table that cannot be read does not hide the others")

// Regression: two simultaneous arrivals used to mark both seen but show just the newest.
result.dismiss(); await run()
tables.broken = false
tables.attendance_ignored_scans = []
const batchAt = new Date(Date.now()).toISOString()
tables.biometric_attendance_events = ["batch-1", "batch-2"].map((id) => ({ id, direction: "in", occurred_at: batchAt, received_at: batchAt, worker: ana }))
await intervals.at(-1)(); await run()
assert.equal(result.current?.key, "recorded:batch-2", "Newest in a batch is first")
const dismissFirst = result.dismiss
tables.attendance_unregistered_scans = [{ id: "later", reason: "no_match", sensor_slot: null, occurred_at: batchAt, received_at: batchAt, worker: null }]
await intervals.at(-1)(); await run()
assert.equal(result.current?.key, "recorded:batch-2", "A new scan never replaces the visible message")
dismissFirst(); await run()
assert.equal(result.current?.key, "recorded:batch-1", "The other worker is not dropped")
dismissFirst(); await run()
assert.equal(result.current?.key, "recorded:batch-1", "An old timer cannot dismiss the next worker")
result.dismiss(); await run()
assert.equal(result.current?.key, "unregistered:later", "Later arrivals wait behind queued workers")
result.dismiss(); await run()
await intervals.at(-1)(); await run()
assert.equal(result.current, null, "Queued and dismissed scans do not reappear")

// More than one query page after a connection interruption: every scan gets its own message.
tables.attendance_unregistered_scans = []
tables.biometric_attendance_events = Array.from({ length: 105 }, (_, i) => ({ id: `catchup-${String(i).padStart(3, "0")}`, direction: "in", occurred_at: batchAt, received_at: batchAt, worker: ana }))
await intervals.at(-1)(); await run()
const shown = new Set()
while (result.current) { shown.add(result.current.key); result.dismiss(); await run() }
assert.equal(shown.size, 105, "Pagination must not silently cap catch-up to the newest ten scans")
assert.ok(queries.some((q) => q.range?.[0] === 100))

// A late read from another project must never refill the new project's queue.
let release
holdRead = new Promise((resolve) => { release = resolve })
tables.biometric_attendance_events = [{ id: "old-project", direction: "in", occurred_at: batchAt, received_at: batchAt, worker: ana }]
const oldRead = intervals.at(-1)()
tables.biometric_attendance_events = []
await run("other-project")
release(); holdRead = null
await oldRead; await run("other-project")
assert.equal(result.current, null)
assert.ok(channels[0].removed, "Old project subscription removed")
await run(null)
assert.equal(result.current, null, "No project means no personal scan details")

const { default: Popup } = await compile("../src/components/attendance/ScanNoticePopup.tsx", {
  "../../lib/scanNotices": url("export const useScanNotices=()=>globalThis.__noticeState"),
  "../../lib/scanNoticeModel": model,
  "../../lib/attendanceModel": new URL("../src/lib/attendanceModel.ts", import.meta.url).href,
})
const all = (node) => (Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : [])
const text = (node) => (Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : "")
let dismissed = 0
globalThis.__noticeState = { current: null, dismiss: () => dismissed++ }
state = []; effects = []; queued = []; cursor = 0
assert.equal(Popup({ projectId: "project" }), null, "Nothing shown without a scan")
globalThis.__noticeState = { current: repeat, dismiss: () => dismissed++ }
cursor = 0
let tree = Popup({ projectId: "project" })
const box = all(tree).find((node) => node.props?.role)
assert.equal(box.props.role, "alert"); assert.equal(box.props["aria-live"], "assertive")
assert.match(text(tree), /Already timed IN.*not recorded again/)
all(tree).find((node) => node.type === "button").props.onClick(); assert.equal(dismissed, 1)
queued.forEach((fn) => fn()); queued = []
assert.equal(dismissed, 2, "Closes by itself")
globalThis.__noticeState = { current: timeIn, dismiss: () => dismissed++ }
cursor = 0
tree = Popup({ projectId: "project" })
assert.equal(all(tree).find((node) => node.props?.role).props.role, "status", "Acknowledgements are announced politely")
delete globalThis.__noticeHooks; delete globalThis.__noticeDB; delete globalThis.__noticeState
console.log("Scan pop-ups: message texts, lossless batch queue, active-message preservation, stale-timer protection, 105-scan pagination, project cleanup/late-read isolation, unavailable-table tolerance, OK and auto-close passed")

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { attendanceDay } from "../src/lib/attendanceModel.ts"

const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64")
let values = [], cursor = 0, writes = 0, tabChanges = 0
globalThis.__adminProfilesHooks = {
  useState(initial) {
    const index = cursor++
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial
    return [values[index], value => { values[index] = typeof value === "function" ? value(values[index]) : value }]
  },
}
globalThis.__adminProfilesDB = { from() { writes++; throw new Error("Viewing/navigating worker profiles must not write or enroll") } }
const shared = url("export function WorkerDirectory(){return null};export function WorkerAttendanceDetails(){return null}")
const { WorkerDirectory, WorkerAttendanceDetails } = await import(shared)
const replacements = {
  react: url("export const useState=(...args)=>globalThis.__adminProfilesHooks.useState(...args)"),
  "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"),
  "../../lib/supabase": url("export const supabase=globalThis.__adminProfilesDB"),
  "../../lib/attendanceModel": new URL("../src/lib/attendanceModel.ts", import.meta.url).href,
  "../../lib/workerRegistrationModel": new URL("../src/lib/workerRegistrationModel.ts", import.meta.url).href,
  "./BiometricAdminGuard": url("export default function Guard({children}){return children}"),
  "./WorkerCamera": url("export default function Camera(){return null}"),
  "./WorkerFingerprint": url("export default function Fingerprint(){return null}"),
  "./WorkerPortrait": url("export default function Portrait(){return null}"),
  "./ForemanWorkerAttendance": shared,
}
let source = ts.transpileModule(readFileSync(new URL("../src/components/attendance/WorkerManagement.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
for (const [name, replacement] of Object.entries(replacements)) source = source.replaceAll(`from "${name}"`, `from ${JSON.stringify(replacement)}`)
const { default: WorkerManagement } = await import(url(source))
const worker = {
  id: "worker", project_id: "selected-project", full_name: "Anna M Worker",
  first_name: "Anna", last_name: "Worker", middle_initial: "M",
  contact_number: "09123456789", email: "anna@example.com", worker_code: "W-001",
  trade: "Mason", active: true, photo_path: "selected-project/worker/portrait.jpg", biometric_uid: "7",
}
let props = { projectId: "selected-project", view: "profiles", onRegister: () => { tabChanges++ } }, tree
const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : []
const find = type => { const node = all(tree).find(node => node.type === type); assert.ok(node, `Expected ${type.name || type}`); return node }
function render() {
  cursor = 0
  tree = WorkerManagement(props)
  while (typeof tree.type === "function") tree = tree.type(tree.props)
}
render()
assert.equal(find(WorkerDirectory).props.projectId, "selected-project")
assert.ok(!all(tree).some(node => node.type === "form" || node.type === WorkerAttendanceDetails))
find(WorkerDirectory).props.onPage(3); render()
assert.equal(find(WorkerDirectory).props.page, 3)
find(WorkerDirectory).props.onSearch("Anna"); render()
assert.equal(find(WorkerDirectory).props.search, "Anna")
assert.equal(find(WorkerDirectory).props.page, 0, "Search resets pagination")
find(WorkerDirectory).props.onPage(1); render()
find(WorkerDirectory).props.onWorker(worker); render()
assert.equal(tabChanges, 0, "Viewing a profile must not switch to Register worker")
assert.equal(find(WorkerAttendanceDetails).props.worker, worker)
assert.equal(find(WorkerAttendanceDetails).props.projectId, "selected-project")
assert.equal(find(WorkerAttendanceDetails).props.initialDay, attendanceDay())
assert.ok(!all(tree).some(node => node.type === "form"))
find(WorkerAttendanceDetails).props.onClose(); render()
assert.ok(!all(tree).some(node => node.type === WorkerAttendanceDetails))
assert.equal(tabChanges, 0)
assert.equal(find(WorkerDirectory).props.search, "Anna")
assert.equal(find(WorkerDirectory).props.page, 1, "Closing details preserves directory position")
find(WorkerDirectory).props.onWorker(worker); render()
const fresh = { ...worker, first_name: "Ana", full_name: "Ana M Worker", contact_number: "09987654321", email: "updated@example.com", active: false }
find(WorkerAttendanceDetails).props.onEdit(fresh); render()
assert.equal(tabChanges, 1, "Only the explicit Admin Edit profile action opens registration")
assert.ok(!all(tree).some(node => node.type === WorkerAttendanceDetails))
props = { ...props, view: "register" }; render()
assert.ok(find("form"))
for (const name of ["first_name", "last_name", "middle_initial", "contact_number", "email", "worker_code", "trade"]) {
  assert.equal(all(tree).find(node => node.type === "input" && node.props.name === name)?.props.value, fresh[name], `Edit preloads ${name} from the current profile`)
}
assert.equal(all(tree).find(node => node.type === "input" && node.props.type === "checkbox")?.props.checked, false)
props = { ...props, view: "profiles" }; render()
assert.ok(find(WorkerDirectory))
assert.equal(tabChanges, 1, "Returning to profiles does not redirect back into registration")
assert.equal(writes, 0)
delete globalThis.__adminProfilesHooks; delete globalThis.__adminProfilesDB
console.log("Admin detailed worker directory, profile-only opening/closing, search/pagination preservation and explicit edit navigation passed")

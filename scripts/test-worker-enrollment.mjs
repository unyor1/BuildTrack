import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import {
  emptyWorkerRegistration,
  workerFullName,
  workerRegistrationProblem,
} from "../src/lib/workerRegistrationModel.ts"
import { receiveEnrollment } from "../supabase/functions/biometric-enrollment/handler.ts"

const details = {
  ...emptyWorkerRegistration,
  first_name: " Juan ",
  last_name: " Cruz ",
  middle_initial: "a.",
  contact_number: "09123456789",
  worker_code: "W-001",
  email: "juan@example.com",
}
assert.equal(workerFullName(details), "Juan A. Cruz")
assert.equal(workerFullName({ ...details, middle_initial: "" }), "Juan Cruz")
assert.equal(workerRegistrationProblem(details), "")
for (const patch of [
  { first_name: "" },
  { last_name: "" },
  { middle_initial: "AB" },
  { contact_number: "bad" },
  { email: "bad" },
  { worker_code: "" },
])
  assert.ok(workerRegistrationProblem({ ...details, ...patch }))

const device = "00000000-0000-4000-8000-000000000001",
  id = "00000000-0000-4000-8000-000000000002"
const token = "a".repeat(64)
const request = (body, headers = {}) =>
  new Request("https://test.invalid/enrollment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-device-token": token,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
let calls = []
const rpc = async (args) => {
  calls.push(args)
  return { data: { job: { id, slot: 1 } }, error: null }
}
assert.equal(
  (await receiveEnrollment(new Request("https://test.invalid"), rpc)).status,
  405,
)
assert.equal(
  (
    await receiveEnrollment(
      request({ device_id: device, action: "poll", capacity: 162 }, {
        "x-device-token": "bad",
      }),
      rpc,
    )
  ).status,
  401,
)
assert.equal(
  (await receiveEnrollment(request({}, { "content-type": "text/plain" }), rpc))
    .status,
  415,
)
for (const body of [
  null,
  [],
  "{",
  {},
  { device_id: device, action: "poll", capacity: 0 },
  { device_id: device, action: "poll", capacity: 1.5 },
  { device_id: device, action: "poll", capacity: 162, project_id: "forged" },
  { device_id: device, action: "completed", request_id: "bad" },
  { device_id: device, action: "completed", request_id: id, slot: 99 },
])
  assert.equal((await receiveEnrollment(request(body), rpc)).status, 400)
assert.equal(
  (await receiveEnrollment(request("x".repeat(2049)), rpc)).status,
  413,
)
assert.equal(calls.length, 0)
assert.equal(
  (
    await receiveEnrollment(
      request({ device_id: device, action: "poll", capacity: 162 }),
      rpc,
    )
  ).status,
  200,
)
assert.equal(calls[0].p_device, device)
assert.equal(calls[0].p_capacity, 162)
assert.match(calls[0].p_token_hash, /^[a-f0-9]{64}$/)
assert.notEqual(calls[0].p_token_hash, token)
assert.equal(Object.hasOwn(calls[0], "p_project"), false)
for (const action of ["completed", "failed"]) {
  await receiveEnrollment(
    request({
      device_id: device,
      action,
      request_id: id,
      error: action === "failed" ? "Finger did not match" : "",
    }),
    rpc,
  )
  assert.equal(calls.at(-1).p_action, action)
  assert.equal(calls.at(-1).p_request, id)
}
for (const [code, status] of [
  ["28000", 401],
  ["P0001", 422],
  ["XX000", 503],
]) {
  const result = await receiveEnrollment(
    request({ device_id: device, action: "poll", capacity: 162 }),
    async () => ({ data: null, error: { code, message: "SECRET" } }),
  )
  assert.equal(result.status, status)
  assert.doesNotMatch(await result.text(), /SECRET/)
}

const url = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
let state = [],
  effects = [],
  queued = [],
  cursor = 0
globalThis.__enrollHooks = {
  useState(initial) {
    const n = cursor++
    if (!(n in state)) state[n] = initial
    return [
      state[n],
      (value) => {
        state[n] = typeof value === "function" ? value(state[n]) : value
      },
    ]
  },
  useEffect(fn, deps) {
    const n = cursor++,
      old = effects[n]
    if (!old || deps.some((value, i) => value !== old.deps[i]))
      queued.push(() => {
        old?.cleanup?.()
        effects[n] = { deps, cleanup: fn() }
      })
  },
}
const hooks = url(
  "export const useState=(...a)=>globalThis.__enrollHooks.useState(...a);export const useEffect=(...a)=>globalThis.__enrollHooks.useEffect(...a);",
)
async function compile(path, replacements) {
  let source = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText
  for (const [name, replacement] of Object.entries({
    react: hooks,
    "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"),
    ...replacements,
  }))
    source = source.replaceAll(
      `from "${name}"`,
      `from ${JSON.stringify(replacement)}`,
    )
  return (await import(url(source))).default
}
const noOp = url("export default function Stub(){return null}")
const Worker = await import(noOp)
const Page = await compile("../src/pages/Admin/BiometricsRegistration.tsx", {
  "../../components/AdminProjectSelect": url(
    "export const useAdminProject=()=>({projects:[],project:{id:'project'},projectId:'project',error:'',choose(){}});export default function Picker(){return null}",
  ),
  "../../components/attendance/WorkerManagement": noOp,
  "../../components/attendance/DeviceManagement": url(
    "export default function Devices(){return null}",
  ),
  "../../components/attendance/BiometricAdminGuard": url(
    "export default function Guard({children}){return children}",
  ),
  "./AdminShell": url("export const PageIntro=()=>null"),
})
const all = (node) =>
  Array.isArray(node)
    ? node.flatMap(all)
    : node && typeof node === "object"
      ? [node, ...all(node.props?.children)]
      : []
const text = (node) =>
  Array.isArray(node)
    ? node.map(text).join("")
    : node?.props
      ? text(node.props.children)
      : typeof node === "string"
        ? node
        : ""
let tree
const find = (predicate) => {
  const found = all(tree).find(predicate)
  assert.ok(found, "Expected enrollment control")
  return found
}
const tab = (label) =>
  find((node) => node.props?.role === "tab" && text(node) === label)
function renderPage() {
  cursor = 0
  tree = Page({})
  while (typeof tree.type === "function") tree = tree.type(tree.props)
}
renderPage()
assert.equal(all(tree).filter((node) => node.props?.role === "tab").length, 3)
assert.equal(
  find((node) => node.type === Worker.default).props.view,
  "register",
)
tab("Worker profiles").props.onClick()
renderPage()
assert.equal(
  find((node) => node.type === Worker.default).props.view,
  "profiles",
)
find((node) => node.type === Worker.default).props.onRegister()
renderPage()
assert.equal(tab("Register worker").props["aria-selected"], true)
tab("Devices").props.onClick()
renderPage()
assert.ok(!all(tree).some((node) => node.type === Worker.default))
assert.doesNotMatch(text(tree), /Choose an unused|AS608 sensor enrollment ID/)

state = []
effects = []
queued = []
const originalWindow = globalThis.window
let tick,
  rpcCalls = [],
  data = {
    devices: [],
    job: null,
    worker: { biometric_uid: null },
    error: null,
  },
  rpcError = null
globalThis.window = {
  setInterval: (fn) => {
    tick = fn
    return 1
  },
  clearInterval() {},
}
globalThis.__enrollDB = {
  from(table) {
    const chain = {
      select() {
        return chain
      },
      eq() {
        return chain
      },
      order() {
        return chain
      },
      limit() {
        return chain
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      then(resolve) {
        return Promise.resolve(result()).then(resolve)
      },
    }
    const result = () => ({
      data:
        table === "attendance_devices"
          ? data.devices
          : table === "attendance_workers"
            ? data.worker
            : data.job,
      error: data.error,
    })
    return chain
  },
  rpc: async (name, args) => {
    rpcCalls.push({ name, args })
    return { data: id, error: rpcError }
  },
}
const Fingerprint = await compile(
  "../src/components/attendance/WorkerFingerprint.tsx",
  { "../../lib/supabase": url("export const supabase=globalThis.__enrollDB") },
)
const worker = { id: "worker", active: true, biometric_uid: null }
async function renderFingerprint() {
  for (let pass = 0; pass < 2; pass++) {
    cursor = 0
    tree = Fingerprint({ worker, projectId: "project" })
    const tasks = queued
    queued = []
    tasks.forEach((fn) => fn())
    await new Promise((resolve) => setImmediate(resolve))
  }
}
const button = (label) =>
  find((node) => node.type === "button" && text(node) === label)
await renderFingerprint()
assert.equal(button("Register fingerprint").props.disabled, true)
assert.match(text(tree), /No active device registered/)
data.devices = [{ id: device, label: "Main gate" }]
tick()
await renderFingerprint()
assert.equal(button("Register fingerprint").props.disabled, false)
await button("Register fingerprint").props.onClick()
await renderFingerprint()
assert.equal(rpcCalls[0].name, "request_worker_enrollment")
assert.deepEqual(rpcCalls[0].args, { p_worker: "worker", p_device: device })
data.job = {
  id,
  status: "queued",
  error_message: "",
  expires_at: "2099-01-01T00:00:00Z",
}
tick()
await renderFingerprint()
assert.match(text(tree), /Waiting for the ESP32/)
assert.ok(
  !all(tree).some(
    (node) => node.type === "button" && text(node) === "Register fingerprint",
  ),
)
data.job.status = "capturing"
tick()
await renderFingerprint()
assert.match(text(tree), /scan the same finger again/)
await button("Cancel enrollment").props.onClick()
await renderFingerprint()
assert.equal(rpcCalls.at(-1).name, "cancel_worker_enrollment")
data.job.status = "failed"
data.job.error_message = "Finger mismatch"
tick()
await renderFingerprint()
assert.match(text(tree), /Finger mismatch/)
rpcError = { message: "Another worker is using this device" }
await button("Register fingerprint").props.onClick()
await renderFingerprint()
assert.match(text(tree), /Another worker is using this device/)
rpcError = null
data.worker.biometric_uid = "1"
data.job.status = "completed"
tick()
await renderFingerprint()
assert.match(text(tree), /Fingerprint registered/)
assert.equal(
  all(tree).filter((node) => node.type === "select" || node.type === "button")
    .length,
  0,
)
effects.forEach((value) => value?.cleanup?.())
globalThis.window = originalWindow
delete globalThis.__enrollHooks
delete globalThis.__enrollDB
console.log(
  "Worker names/contact validation, separate registration/profile/device tabs, fingerprint UI request/pending/cancel/failure/success and authenticated device handler tests passed",
)

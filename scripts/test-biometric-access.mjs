import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const moduleUrl = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64")
const auth = moduleUrl("export const useAuth=()=>globalThis.__biometricAuth")
const database = moduleUrl(
  "export const supabase={from(){throw new Error('Unexpected database request during access check')}}",
)
const portrait = moduleUrl(
  "export default function WorkerPortrait(){return null}",
)
async function compile(path, replacements = {}) {
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
  for (const [name, url] of Object.entries({
    react: import.meta.resolve("react"),
    "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"),
    ...replacements,
  }))
    source = source.replaceAll(`from "${name}"`, `from ${JSON.stringify(url)}`)
  const url = moduleUrl(source)
  return { url, component: (await import(url)).default }
}
const guard = await compile(
  "../src/components/attendance/BiometricAdminGuard.tsx",
  { "../../lib/auth": auth },
)
const camera = await compile("../src/components/attendance/WorkerCamera.tsx", {
  "../../lib/attendanceModel": new URL("../src/lib/attendanceModel.ts", import.meta.url).href,
})
const managementImports = {
  "../../lib/workerRegistrationModel": new URL("../src/lib/workerRegistrationModel.ts", import.meta.url).href,
  "./WorkerFingerprint": (await compile("../src/components/attendance/WorkerFingerprint.tsx", { "../../lib/supabase": database })).url,
  "./WorkerCamera": camera.url,
  "./ForemanWorkerAttendance": moduleUrl("export function WorkerDirectory(){return null};export function WorkerAttendanceDetails(){return null}"),
  "../../lib/supabase": database,
  "./BiometricAdminGuard": guard.url,
  "./WorkerPortrait": portrait,
  "../../lib/attendanceModel": new URL(
    "../src/lib/attendanceModel.ts",
    import.meta.url,
  ).href,
}
const workers = await compile(
  "../src/components/attendance/WorkerManagement.tsx",
  managementImports,
)
const devices = await compile(
  "../src/components/attendance/DeviceManagement.tsx",
  managementImports,
)
const projects = moduleUrl(
  "export const useAdminProject=()=>({projects:[],project:{id:'project'},projectId:'project',error:'',choose(){}});export default function ProjectPicker(){return null}",
)
const intro = moduleUrl(
  "export const PageIntro=({title,description})=>[title,description]",
)
const page = await compile("../src/pages/Admin/BiometricsRegistration.tsx", {
  "../../components/AdminProjectSelect": projects,
  "../../components/attendance/WorkerManagement": workers.url,
  "../../components/attendance/DeviceManagement": devices.url,
  "../../components/attendance/BiometricAdminGuard": guard.url,
  "./AdminShell": intro,
})
const render = (component) =>
  renderToStaticMarkup(createElement(component, { projectId: "project" }))

for (const role of ["foreman", "engineer", "client", null]) {
  // Even an accidental true permission result must not delegate management to a non-Admin.
  globalThis.__biometricAuth = {
    profile: role ? { role } : null,
    can: () => true,
  }
  for (const { component } of [page, workers, devices]) {
    const html = render(component)
    assert.match(html, /restricted to Admins/)
    assert.doesNotMatch(
      html,
      /<form|Register device|AS608 sensor enrollment ID/,
    )
  }
}
for (const role of ["admin", "super_admin"]) {
  globalThis.__biometricAuth = { profile: { role }, can: () => false }
  for (const { component } of [page, workers, devices])
    assert.match(render(component), /restricted to Admins/)
  globalThis.__biometricAuth.can = (permission) =>
    permission === "biometrics.manage"
  const html = render(page.component)
  assert.match(html, /Worker biometric registration/)
  assert.match(html, /First name/)
  assert.match(html, /Last name/)
  assert.match(html, /Register worker/)
  assert.match(html, /Worker profiles/)
  assert.match(html, /Devices/)
  assert.doesNotMatch(html, /AS608 sensor enrollment ID|Choose an unused/)
  assert.match(render(devices.component), /Register device/)
  assert.match(
    html,
    /saving the form alone does not enroll a fingerprint/,
  )
  assert.doesNotMatch(html, /authorize foreman|delegate enrollment/i)
}
delete globalThis.__biometricAuth
console.log(
  "Admin-only biometric page/worker/device guards; non-Admin, anonymous and missing-permission denials; physical enrollment instructions passed",
)

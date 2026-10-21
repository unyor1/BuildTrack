import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { changePhotoScope, emptyPhotoScope } from "../src/lib/photoGalleryModel.ts"

const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64")
let slots = [], cursor = 0, tree, opened, navigated
globalThis.__qaLayoutHooks = {
  useState(initial) { const n = cursor++; if (!(n in slots)) slots[n] = typeof initial === "function" ? initial() : initial; return [slots[n], value => { slots[n] = typeof value === "function" ? value(slots[n]) : value }] },
  useMemo: fn => fn(), useEffect() {}, useCallback: fn => fn,
}
const pin = { id: "pin", project_id: "project", blueprint_id: "sheet", title: "Laundry", assigned_to: "foreman", status: "for_review" }
const row = (id, action, stage, owner) => ({ item: { id, text: id, review_status: stage === "completed" ? "verified" : "for_review" }, pin, view: { action, stage, owner, status: "Synthetic status", next: "Synthetic next action" }, ncrs: [], attempts: 1 })
const rows = [row("WALL", "inspect", "inspecting", "Engineer"), row("FLOOR", null, "completed", null)]
const workspace = { work: { pins: [pin], sheetOf: () => "Plan", nameOf: () => "Foreman" }, inspections: [{ id: "old-stage", number: 99, status: "requested", title: "Synthetic stage request", pin_id: pin.id }], defects: [], project: { id: "project" }, nameOf: () => "Engineer", loading: false }
globalThis.__qaLayoutDeps = {
  changePhotoScope, emptyPhotoScope,
  useAuth: () => ({ profile: { id: "foreman", role: "foreman" } }), getSelectedProjectId: () => "project",
  useQaWorkspace: () => workspace, useWorkItems: () => ({ rows, workInspectionIds: new Set(["work-inspection"]), loading: false }), useItemParam: () => [null, () => {}],
  selectedVerification: () => null,
  supabase: { from() { throw new Error("Layout changes must not mutate database records") } },
}
async function compile(file) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const declaration of ast.statements.filter(ts.isImportDeclaration)) {
    if (!declaration.importClause || declaration.importClause.isTypeOnly) continue
    const name = declaration.moduleSpecifier.text, exports = []
    if (declaration.importClause.name) exports.push(name.endsWith("/WorkItemBoard") ? "export default globalThis.__qaLayoutBoard" : "export default function Stub(){return null}")
    for (const binding of declaration.importClause.namedBindings?.elements ?? []) {
      if (binding.isTypeOnly) continue
      const key = binding.propertyName?.text ?? binding.name.text
      exports.push(`export const ${key}=globalThis.${name === "react" ? "__qaLayoutHooks" : "__qaLayoutDeps"}.${key} ?? function Stub(){return null}`)
    }
    output = output.replaceAll(`from "${name}"`, `from ${JSON.stringify(url(exports.join(";")))}`)
  }
  output = output.replaceAll('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`)
  return (await import(url(output))).default
}
const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : []
const text = node => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const find = predicate => { const node = all(tree).find(predicate); assert.ok(node, "Expected QA layout control"); return node }
const render = (Component, props) => { cursor = 0; tree = Component(props); return tree }
const filters = () => all(find(node => node.props?.["aria-label"] === "Show work items")).filter(node => node.type === "button")
const Board = await compile("../src/components/qa/WorkItemBoard.tsx")
globalThis.__qaLayoutBoard = Board
const boardProps = { groups: [
  { key: "submit", title: "Submit QA", short: "Submit QA", rows: [row("CEILING", "submit", "preparing", "Foreman")] },
  { key: "waiting", title: "Waiting", short: "Waiting", rows: [rows[0]] },
  { key: "completed", title: "Completed", short: "Completed", rows: [rows[1]] },
], loading: false, nameOf: () => "Engineer", sheetOf: () => "Plan", onOpen: id => { opened = id } }
render(Board, boardProps)
assert.deepEqual(filters().map(text), ["Submit QA 1", "Waiting 1", "Completed 1", "All 3"])
assert.equal(filters().at(-1).props["aria-pressed"], true, "Moving All must not change its default selection")
filters()[0].props.onClick(); render(Board, boardProps)
assert.match(text(tree), /Showing 1 of 3/)
find(node => node.type === "button" && text(node) === "Open").props.onClick(); assert.equal(opened, "CEILING")
filters().at(-1).props.onClick(); render(Board, boardProps)
assert.match(text(tree), /Showing 3 of 3/)
find(node => node.type === "input").props.onChange({ target: { value: "FLOOR" } }); render(Board, boardProps)
assert.equal(text(filters().at(-1)), "All 1"); assert.match(text(tree), /Showing 1 of 3/)
find(node => node.type === "input").props.onChange({ target: { value: "missing" } }); render(Board, boardProps)
assert.equal(text(filters().at(-1)), "All 0")
const originalWindow = globalThis.window
globalThis.window = { location: { search: "" } }
const Foreman = await compile("../src/pages/Foreman/ForemanQualityControl.tsx")
slots = []; render(Foreman, { onNavigate() {} })
assert.doesNotMatch(text(tree), /Stage and hold|Synthetic stage request/)
assert.ok(!all(tree).some(node => node.props?.inspectionKind === "stage"))
let groups = find(node => node.type === Board).props.groups
slots = []; render(Board, { ...boardProps, groups })
assert.deepEqual(filters().map(text), ["Waiting 1", "Completed 1", "All 2"])
const Engineer = await compile("../src/pages/Engineer/EngineerProgressVerification.tsx")
slots = []; render(Engineer, { onNavigate: page => { navigated = page } })
assert.doesNotMatch(text(tree), /Stage and hold|Synthetic stage request/)
assert.equal(find(node => node.props?.label === "Waiting for you").props.value, 1, "Hidden stage requests are not counted as inbox tasks")
groups = find(node => node.type === Board).props.groups
slots = []; render(Board, { ...boardProps, groups })
assert.deepEqual(filters().map(text), ["Inspect 1", "All 1"])
rows[0].item.review_status = "verified"
slots = []; render(Engineer, { onNavigate: page => { navigated = page } })
find(node => node.type === "button" && text(node) === "QA register").props.onClick()
assert.equal(navigated, "qa", "Existing inspection blockers retain a route to the register")
assert.equal(workspace.inspections.length, 1, "Removing stage UI never deletes historical inspection data")
globalThis.window = originalWindow
delete globalThis.__qaLayoutHooks; delete globalThis.__qaLayoutDeps; delete globalThis.__qaLayoutBoard
console.log("QA board All-last ordering/filter behavior, Engineer/Foreman checklist-only pages, corrected inbox counts and retained history/register route passed")

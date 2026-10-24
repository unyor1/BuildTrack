import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { itemAttempts, pinLevelDefects, irRef, ncrRef } from "../src/lib/workItemModel.ts"
import { submittedChecklistItems } from "../src/lib/qaChecklistModel.ts"
import { photoPreviewBlocked } from "../src/lib/photoStamp.ts"

const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64")
let values = [], cursor = 0, tree
globalThis.__evidenceHooks = {
  useState(initial) { const n = cursor++; if (!(n in values)) values[n] = typeof initial === "function" ? initial() : initial; return [values[n], value => { values[n] = typeof value === "function" ? value(values[n]) : value }] },
  useRef(initial) { const n = cursor++; return values[n] ??= { current: initial } },
  useMemo: fn => fn(), useEffect() {}, useId: () => "evidence-test",
}
globalThis.__evidenceDeps = {
  itemAttempts, submittedChecklistItems, pinLevelDefects, irRef, ncrRef, photoPreviewBlocked,
  formatStamp: value => value, inputClass: "input", inspectionTone: { passed: "good", failed: "bad" },
  inspectionStatusLabels: { passed: "Passed", failed: "Failed" }, defectTone: { closed: "good" }, defectStatusLabels: { closed: "Closed" },
  useAuth: () => ({ profile: { id: "engineer", role: "engineer", status: "active" } }),
  useToast: () => ({}), useConfirm: () => () => false, useProject: () => ({ project: null }),
  useProjectTeam: () => ({ team: [{ user_id: "foreman", full_name: "Test Foreman" }] }), useSettings: () => ({ settings: {} }),
  useTemplates: () => ({ templates: [] }), completionProblem: () => "", manilaToday: () => "2026-10-21",
}
async function compile(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const declaration of ast.statements.filter(ts.isImportDeclaration)) {
    if (!declaration.importClause || declaration.importClause.isTypeOnly) continue
    const name = declaration.moduleSpecifier.text, exports = []
    if (declaration.importClause.name) exports.push(name === "./SubmittedEvidence" ? "export default globalThis.__submittedEvidenceUI" : "export default function Stub(){return null}")
    for (const binding of declaration.importClause.namedBindings?.elements ?? []) {
      if (binding.isTypeOnly) continue
      const key = binding.propertyName?.text ?? binding.name.text
      exports.push(`export const ${key}=globalThis.${name === "react" ? "__evidenceHooks" : "__evidenceDeps"}.${key} ?? function Stub(){return null}`)
    }
    output = output.replaceAll(`from "${name}"`, `from ${JSON.stringify(url(exports.join(";")))}`)
  }
  output = output.replaceAll('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`)
  return (await import(url(output))).default
}
const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : []
const text = node => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const find = predicate => { const node = all(tree).find(predicate); assert.ok(node, "Expected evidence control"); return node }
function render(Component, props) { cursor = 0; tree = Component(props); return tree }
const reset = () => { values = []; cursor = 0 }
const photo = (id, item = "floor") => ({ id, checklist_item_id: item, path: `${id}.jpg`, caption: null, uploaded_by: "foreman", created_at: "2026-10-20T01:00:00Z", stamp_flag: "at_site" })
const submission = (id, inspection, remark, photos = [photo(id)]) => ({ id, pin_id: "pin", inspection_id: inspection, item_ids: ["floor"], submitted_by: "foreman", submitted_at: "2026-10-20T02:00:00Z", checklist_snapshot: [{ id: "floor", text: "FLOOR", done: false, remark, remark_at: "2026-10-20T01:30:00Z" }, { id: "wall", text: "WALL", done: true, remark: "Other item's private remark" }], photos_snapshot: photos })
const original = submission("original", "ir-1", "Original floor remark", [photo("one"), photo("wall", "wall")])
const corrected = submission("corrected", "ir-2", "Corrected floor remark", [photo("two")])
const inspections = [{ id: "ir-1", number: 1, status: "failed" }, { id: "ir-2", number: 2, status: "passed" }]
const props = { pinId: "pin", itemId: "floor", submissions: [original], inspections, loading: false, error: "", nameOf: () => "Test Foreman" }
const Evidence = await compile("../src/components/qa/SubmittedEvidence.tsx")
globalThis.__submittedEvidenceUI = Evidence
const grid = () => find(node => node.props?.bucket === "pin-photos" && Array.isArray(node.props.photos))
render(Evidence, props)
assert.match(text(tree), /Original floor remark/)
assert.match(text(tree), /Original request · IR-0001/)
assert.match(text(tree), /2026-10-20T02:00:00Z.*Test Foreman/)
assert.match(text(tree), /Remark saved 2026-10-20T01:30:00Z/)
assert.equal(grid().props.photos.length, 1, "A single saved photo must be displayed without requiring a comparison")
assert.equal(grid().props.photos[0].id, "one")
assert.equal(grid().props.photos[0].recordState, "snapshot")
assert.equal(grid().props.photos[0].checklist.remark, "Original floor remark")
assert.equal(grid().props.onRemove, undefined, "Submitted evidence cannot be deleted")
assert.doesNotMatch(text(tree), /Other item's private remark/)
assert.ok(!all(tree).some(node => node.type === "select"))
const multiple = { ...props, submissions: [corrected, original, { ...original, id: "outsider", pin_id: "other", checklist_snapshot: [{ ...original.checklist_snapshot[0], remark: "Wrong pin" }] }] }
render(Evidence, multiple)
assert.match(text(tree), /Corrected floor remark/)
assert.match(text(tree), /Resubmission 1 · IR-0002/)
assert.equal(grid().props.photos[0].id, "two")
find(node => node.type === "select").props.onChange({ target: { value: original.id } })
render(Evidence, multiple)
assert.match(text(tree), /Original floor remark/); assert.doesNotMatch(text(tree), /Corrected floor remark|Wrong pin/)
assert.equal(grid().props.photos[0].id, "one", "Switching requests keeps photo and remark snapshots together")
render(Evidence, { ...multiple, itemId: "wall" })
assert.equal(all(tree).filter(node => node.props?.bucket).length, 0, "Explicit item IDs exclude unfinished/unsubmitted legacy snapshot entries")
reset(); render(Evidence, { ...props, submissions: [{ ...original, photos_snapshot: [], checklist_snapshot: [{ ...original.checklist_snapshot[0], remark: null }] }] })
assert.match(text(tree), /No Foreman remark recorded/); assert.equal(grid().props.photos.length, 0)
reset(); render(Evidence, { ...props, loading: true }); assert.match(text(tree), /Loading submitted evidence/)
render(Evidence, { ...props, error: "Cannot load QA history" }); assert.match(text(tree), /Cannot load QA history/); assert.ok(!all(tree).some(node => node.props?.bucket))
render(Evidence, { ...props, submissions: [] }); assert.match(text(tree), /No submitted evidence yet/)

const data = { item: { id: "floor", text: "FLOOR", review_status: "for_review" }, pin: { id: "pin", project_id: "project", assigned_to: "foreman", title: "Kitchen" }, photos: [], defects: [], history: { ...props, attempts: [], events: [] }, qa: {}, stage: { view: { stage: "passed", action: "complete" }, current: inspections[1], ncrs: [], attempts: itemAttempts("floor", [original], inspections) } }
globalThis.__evidenceDeps.useWorkItem = () => data
const Workspace = await compile("../src/components/qa/WorkItemWorkspace.tsx")
reset(); render(Workspace, { itemId: "floor", onClose() {} })
assert.ok(all(tree).some(node => node.type === Evidence), "Workspace embeds the saved gallery instead of directing users away")
assert.match(text(tree), /No NCR recorded for FLOOR/)
assert.match(text(tree), /No NCR correction is required/)
assert.doesNotMatch(text(tree), /Submitted photos and remarks are kept.*Attempts/)
find(node => node.props?.role === "tab" && text(node) === "Evidence").props.onClick()
render(Workspace, { itemId: "floor", onClose() {} })
assert.equal(find(node => node.props?.id === "evidence-test-panel-evidence").props.hidden, false)
let comparison = find(node => node.props?.draftPhotos)
assert.equal(comparison.type(comparison.props), null, "One request is not a before/after comparison")
const compareComponent = comparison.type
tree = compareComponent({ ...comparison.props, attempts: [original, corrected] })
assert.equal(find(node => node.props?.before).props.before.path, "one.jpg")
assert.equal(find(node => node.props?.after).props.after.path, "two.jpg", "Keep the interactive comparison for corrected photos")
assert.equal(compareComponent({ ...comparison.props, attempts: [original, { photos_snapshot: [photo("blocked", "floor")] }], draftPhotos: [ { ...photo("bad"), stamp_flag: "clock_ahead" } ], role: "engineer" }), null, "Comparison must preserve Engineer photo restrictions")
data.error = "Could not load NCRs"
render(Workspace, { itemId: "floor", onClose() {} })
assert.match(text(tree), /NCR information is unavailable/); assert.doesNotMatch(text(tree), /No NCR recorded/)
data.error = ""; data.stage.ncrs = [{ id: "closed", number: 3, status: "closed", title: "Old defect" }]
render(Workspace, { itemId: "floor", onClose() {} })
assert.match(text(tree), /0 open · 1 closed/)
assert.ok(all(tree).some(node => node.props?.defect?.id === "closed"), "Closed NCRs remain available")
delete globalThis.__evidenceHooks; delete globalThis.__evidenceDeps; delete globalThis.__submittedEvidenceUI
console.log("Saved single-photo evidence/remarks, request selection, item/pin isolation, snapshots, empty/error states, NCR closure visibility and retained comparison/access guards passed")

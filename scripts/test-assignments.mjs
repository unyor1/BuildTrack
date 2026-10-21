import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

// Exercise the real detailed list and controls without network access or real project writes.
let slots = [], cursor = 0, effects = [], tree, calls = [], fail = false, hold = false, finish, links = [], conflict = false, reloads = 0, projectId = "project"
const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64")
const hooks = {
  useState(initial) { const at = cursor++; if (!(at in slots)) slots[at] = typeof initial === "function" ? initial() : initial; return [slots[at], value => { slots[at] = typeof value === "function" ? value(slots[at]) : value }] },
  useRef(initial) { const at = cursor++; return slots[at] ??= { current: initial } },
  useMemo(fn) { return fn() },
  useEffect(fn, deps) { const at = cursor++; if (!slots[at] || deps.some((value, i) => value !== slots[at][i])) { effects.push(fn); slots[at] = deps } },
}
const pin = (id, assigned_to, blueprint_id = "sheet1", extra = {}) => ({ id, title: id, project_id: "project", blueprint_id, assigned_to, status: "in_progress", category: "work", locked: false, severity: "medium", description: "Work detail", due_date: "2026-01-02", updated_at: "2026-10-21T00:00:00Z", x: 1, y: 1, ...extra })
const original = [pin("FLOOR", null), pin("WALL", "foreman"), pin("ROOF", "former", "sheet2"), pin("LOCKED", "foreman", "sheet1", { locked: true }), pin("REVIEW", "foreman", "sheet1", { status: "for_review" }), pin("COMPLETE", "foreman", "sheet1", { status: "verified" }), pin("NOTE", null, "sheet1", { category: "note" })]
let pins = original.map(row => ({ ...row }))
const work = {
  get pins() { return pins }, setPins(fn) { pins = fn(pins) }, loading: false, error: "", today: "2026-01-03",
  team: [{ role: "foreman", user_id: "foreman", full_name: "Test Foreman" }], blueprints: [{ id: "sheet1", title: "Ground floor" }, { id: "sheet2", title: "Roof plan" }],
  nameOf: id => id === "foreman" ? "Test Foreman" : "Previous Foreman", sheetOf: id => id === "sheet1" ? "Ground floor" : "Roof plan", reload: async () => { reloads++ },
}
const deps = {
  useProjectWork: () => work, getSelectedProjectId: () => projectId, dbMessage: error => error.message,
  isOverdue: row => Boolean(row.due_date && row.due_date < "2026-01-03"), statusChip: {}, severityChip: {}, statusLabels: { in_progress: "In progress", for_review: "For review", verified: "Completed" }, severityLabels: { medium: "Medium" },
  followLink: (...args) => links.push(args), useToast: () => ({ success() {}, error() {} }), inputClass: "input",
  supabase: {
    from(table) {
      let payload, filters = {}
      const chain = {
        update(value) { payload = value; return chain },
        eq(key, value) { filters[key] = value; return chain },
        async select(columns) {
          const before = pins.find(row => row.id === filters.id)
          calls.push({ table, payload, filters: { ...filters }, columns })
          if (hold) await new Promise(resolve => { finish = resolve })
          if (fail) return { data: null, error: { message: "Assignment refused" } }
          if (conflict || before?.updated_at !== filters.updated_at || before?.project_id !== filters.project_id) return { data: [], error: null }
          return { data: [{ ...before, ...payload, updated_at: "2026-10-21T01:00:00Z" }], error: null }
        },
      }; return chain
    },
  },
}
globalThis.__assignmentHooks = hooks; globalThis.__assignmentDeps = deps
const file = new URL("../src/pages/Engineer/EngineerAssignments.tsx", import.meta.url)
const source = readFileSync(file, "utf8")
const ast = ts.createSourceFile(file.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
for (const declaration of ast.statements.filter(ts.isImportDeclaration)) {
  if (!declaration.importClause || declaration.importClause.isTypeOnly) continue
  const path = declaration.moduleSpecifier.text, exports = []
  if (declaration.importClause.name) exports.push("export default function Stub(){return null}")
  for (const binding of declaration.importClause.namedBindings?.elements ?? []) {
    if (binding.isTypeOnly) continue
    const name = binding.propertyName?.text ?? binding.name.text
    exports.push(`export const ${name}=globalThis.${path === "react" ? "__assignmentHooks" : "__assignmentDeps"}[${JSON.stringify(name)}] ?? function Stub(){return null}`)
  }
  output = output.replaceAll(`from "${path}"`, `from ${JSON.stringify(url(exports.join(";\n")))}`)
}
output = output.replaceAll('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`)
const { default: Board } = await import(url(output))
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children), ...nodes(node.props?.actions)]
const text = node => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : ""
const render = () => { for (let n = 0; n < 2; n++) { cursor = 0; effects = []; tree = Board({}); effects.forEach(fn => fn()) } }
const find = predicate => { const node = nodes(tree).find(predicate); assert.ok(node, "Assignment control not found"); return node }
const filter = label => find(node => node.type === "button" && text(node).startsWith(label))
const rows = () => nodes(tree).filter(node => node.props?.pin && node.props?.onAssign)
const ids = () => rows().map(node => node.props.pin.id)
const rowTree = id => { const row = rows().find(node => node.props.pin.id === id); assert.ok(row); return row.type(row.props) }
const control = id => nodes(rowTree(id)).find(node => node.type === "select")
const tick = () => new Promise(resolve => setTimeout(resolve, 0))

render()
assert.deepEqual(ids(), ["FLOOR", "WALL", "ROOF", "LOCKED", "REVIEW", "COMPLETE"])
assert.match(text(filter("Assigned")), /\(5\)/); assert.match(text(filter("Unassigned")), /\(1\)/)
assert.equal(control("COMPLETE").props.disabled, true)
find(node => node.type === "select" && node.props["aria-label"] === "Filter by work status").props.onChange({ target: { value: "open" } }); render()
assert.deepEqual(ids(), ["FLOOR", "WALL", "ROOF", "LOCKED", "REVIEW"])
assert.match(text(filter("Assigned")), /\(4\)/)
find(node => node.type === "select" && node.props["aria-label"] === "Filter by work status").props.onChange({ target: { value: "verified" } }); render()
assert.deepEqual(ids(), ["COMPLETE"])
find(node => node.type === "select" && node.props["aria-label"] === "Filter by work status").props.onChange({ target: { value: "all" } }); render()
assert.match(text(rowTree("ROOF")), /Previous Foreman.*not in current team/)
assert.match(text(rowTree("WALL")), /Work detail.*Ground floor|Ground floor.*Work detail/)
assert.match(text(rowTree("WALL")), /Overdue/)
assert.equal(control("LOCKED").props.disabled, true); assert.equal(control("REVIEW").props.disabled, true)
filter("Assigned").props.onClick(); render()
assert.deepEqual(ids(), ["WALL", "ROOF", "LOCKED", "REVIEW", "COMPLETE"])
filter("Unassigned").props.onClick(); render(); assert.deepEqual(ids(), ["FLOOR"])
filter("All work").props.onClick(); render()
find(node => node.type === "select" && node.props["aria-label"] === "Filter by sheet").props.onChange({ target: { value: "sheet2" } }); render()
assert.deepEqual(ids(), ["ROOF"]); assert.match(text(filter("Assigned")), /\(1\)/)
filter("Unassigned").props.onClick(); render(); assert.equal(rows().length, 0)
assert.ok(nodes(tree).some(node => node.props?.title === "No unassigned work in this selection"))
assert.equal(calls.length, 0, "Filtering must never write to the database")
find(node => node.type === "select" && node.props["aria-label"] === "Filter by sheet").props.onChange({ target: { value: "all" } }); render()
hold = true
control("FLOOR").props.onChange({ target: { value: "foreman" } }); render()
assert.equal(pins.find(row => row.id === "FLOOR").assigned_to, null, "Pending writes must not invent saved assignments")
filter("Assigned").props.onClick(); render(); assert.equal(control("WALL").props.disabled, true)
rows().find(node => node.props.pin.id === "WALL").props.onAssign("unassigned")
assert.equal(calls.length, 1, "In-flight assignment must block a second write")
finish(); await tick(); hold = false; render()
assert.deepEqual(calls[0], { table: "pins", payload: { assigned_to: "foreman" }, filters: { id: "FLOOR", project_id: "project", updated_at: "2026-10-21T00:00:00Z" }, columns: "*" })
assert.equal(pins.find(row => row.id === "FLOOR").assigned_to, "foreman")
assert.equal(pins.find(row => row.id === "FLOOR").updated_at, "2026-10-21T01:00:00Z", "Use the server's canonical row/version")
fail = true; control("WALL").props.onChange({ target: { value: "unassigned" } }); await tick(); render()
assert.equal(pins.find(row => row.id === "WALL").assigned_to, "foreman", "Failed assignment must roll back")
fail = false; control("WALL").props.onChange({ target: { value: "unassigned" } }); await tick(); render()
assert.ok(!ids().includes("WALL"), "Successful unassignment must leave the Assigned filter")
rows()[0].props.onOpen(); assert.match(links[0][0], /project=project&sheet=sheet1&pin=FLOOR/)
conflict = true
control("FLOOR").props.onChange({ target: { value: "unassigned" } }); await tick(); render()
assert.equal(pins.find(row => row.id === "FLOOR").assigned_to, "foreman", "A stale/zero-row update must not overwrite the board")
assert.ok(reloads >= 4, "Success and failure both reload authoritative project data")
conflict = false; hold = true
control("FLOOR").props.onChange({ target: { value: "unassigned" } })
projectId = "different-project"; pins = [pin("OTHER", null, "sheet1", { project_id: projectId })]; render()
finish(); await tick(); render()
assert.deepEqual(ids(), ["OTHER"])
assert.equal(pins[0].assigned_to, null, "A late save response cannot change the newly selected project")
console.log("Assignments: complete/open status filters and counts, confirmed canonical saves, project/version guards, concurrent/stale saves, locks, reload, unassignment and plan links passed")

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { markupProblem } from "../src/lib/issueMarkup.ts"
import { stampFields } from "../src/lib/photoStamp.ts"
import { applyMarkupChanges } from "../src/lib/photoEditorModel.ts"

// Inspection / NCR evidence photos use the client's markup editor before upload: the real lib/qa upload, EvidenceStrip,
// IssuePhotoPicker (prepare mode) and PhotoViewer overlay, each compiled with stubbed imports (no browser, no network).
const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64")
let slots = [], effects = [], pending = [], cursor = 0, tree
globalThis.__markupHooks = {
  useState(initial) { const n = cursor++; if (!(n in slots)) slots[n] = typeof initial === "function" ? initial() : initial; return [slots[n], value => { slots[n] = typeof value === "function" ? value(slots[n]) : value }] },
  useRef(initial) { const n = cursor++; return slots[n] ??= { current: initial } },
  useMemo: fn => fn(),
  useCallback(fn) { cursor++; return fn },
  useEffect(fn, deps) { const n = cursor++, old = effects[n]; if (!old || !deps || deps.some((value, i) => value !== old.deps?.[i])) pending.push(() => { old?.cleanup?.(); effects[n] = { deps, cleanup: fn() } }) },
  useId: () => "test-id",
}
const deps = globalThis.__markupDeps = {}
async function compile(file, overrides = {}) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const replacements = { "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"), ...overrides }
  for (const declaration of ast.statements.filter(ts.isImportDeclaration)) {
    if (!declaration.importClause || declaration.importClause.isTypeOnly) continue
    const name = declaration.moduleSpecifier.text, exports = []
    if (name in replacements) continue
    if (declaration.importClause.name) exports.push(`export default function ${declaration.importClause.name.text}(){return null}`)
    for (const binding of declaration.importClause.namedBindings?.elements ?? []) {
      if (binding.isTypeOnly) continue
      const key = binding.propertyName?.text ?? binding.name.text
      exports.push(`export const ${key}=globalThis.${name === "react" ? "__markupHooks" : "__markupDeps"}.${key} ?? function ${key}(){return null}`)
    }
    replacements[name] = url(exports.join(";") + `\n// isolated dependency bindings for ${file}`)
  }
  for (const [name, replacement] of Object.entries(replacements)) output = output.replaceAll(`from "${name}"`, `from ${JSON.stringify(replacement)}`)
  return import(url(output))
}
const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children), ...all(node.props?.footer)] : []
const text = node => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const render = (Component, props = {}) => { cursor = 0; tree = Component(props); const jobs = pending; pending = []; jobs.forEach(fn => fn()); return tree }
const reset = () => { effects.forEach(effect => effect?.cleanup?.()); slots = []; effects = []; pending = [] }
const find = predicate => { const node = all(tree).find(predicate); assert.ok(node, "Expected a photo markup control"); return node }
const has = predicate => all(tree).some(predicate)
const button = label => find(node => node.type === "button" && text(node) === label)
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0)) }
globalThis.window = { addEventListener() {}, removeEventListener() {}, confirm: () => true }
globalThis.document = { querySelectorAll: () => [] }
const markup = [{ id: "arrow-1", kind: "arrow", x: 10, y: 10, x2: 40, y2: 35, color: "#d93a3a", stroke: 4, fontSize: 30, text: "", points: [] }]
const photoFile = (name, size = 10) => new File([new Uint8Array(size)], name, { type: "image/jpeg" })

// ---- lib/qa: prepareQaPhoto shrinks once; uploadQaPhoto stores that file and records caption + markup ----
const store = { uploads: [], removes: [], inserts: [], uploadError: null, insertError: null }
Object.assign(deps, {
  markupProblem, stampFields,
  prepareImage: async file => ({ blob: new Blob(["small"], { type: "image/webp" }), ext: "webp", width: 10, height: 5, source: file.name }),
  supabase: {
    storage: { from: bucket => ({ upload: async (path, file, options) => { store.uploads.push({ bucket, path, file, options }); return { error: store.uploadError } }, remove: async paths => { store.removes.push({ bucket, paths }); return { error: null } } }) },
    from: table => ({ insert: async row => { store.inserts.push({ table, row }); return { error: store.insertError } } }),
  },
})
const qa = await compile("../src/lib/qa.ts", { "./qaModel": url("export {}") })
const prepared = await qa.prepareQaPhoto(photoFile("IMG_0042.JPG", 5000))
assert.equal(prepared.name, "IMG_0042.webp"); assert.equal(prepared.type, "image/webp")
const stamp = { taken_at: "2026-10-21T02:00:00.000Z", lat: 14.6, lng: 121, accuracy_m: 8 }
await qa.uploadQaPhoto("P", { itemId: "I" }, { file: prepared, caption: "  Joint gap  ", annotations: markup }, stamp)
assert.equal(store.uploads[0].bucket, "qa-evidence"); assert.match(store.uploads[0].path, /^P\/item-I\/\d+-[a-f0-9]{8}\.webp$/)
assert.equal(store.uploads[0].file, prepared, "the prepared file is stored as is, not shrunk again")
assert.deepEqual(store.inserts[0].row.annotations, markup); assert.equal(store.inserts[0].row.caption, "Joint gap"); assert.equal(store.inserts[0].row.taken_at, stamp.taken_at)
await qa.uploadQaPhoto("P", { defectId: "D" }, { file: prepared })
assert.ok(!("annotations" in store.inserts[1].row), "a photo without markup sends no annotations column"); assert.equal(store.inserts[1].row.caption, null)
assert.match(store.uploads[1].path, /^P\/ncr-D\//)
await assert.rejects(qa.uploadQaPhoto("P", { itemId: "I" }, { file: prepared, annotations: [{ kind: "script" }] }), /Invalid annotation/)
assert.equal(store.uploads.length, 2, "invalid markup is refused before anything is stored")
store.insertError = { message: "Photos can only be added while the inspection is requested (Foremen) or in progress" }
await assert.rejects(qa.uploadQaPhoto("P", { itemId: "I" }, { file: prepared, annotations: markup }), /in progress/)
assert.deepEqual(store.removes.at(-1).paths, [store.uploads.at(-1).path], "a refused record removes its stored file again")
store.insertError = null
await qa.uploadQaPhoto("P", { itemId: "I" }, { file: prepared, caption: "x".repeat(260) })
assert.equal(store.inserts.at(-1).row.caption.length, qa.QA_CAPTION_LIMIT)

// ---- EvidenceStrip: chosen photos open the markup dialog; failures stay to retry; Cancel asks only after work ----
const calls = { prepare: [], upload: [], toasts: [], confirms: [], changed: 0 }
let uploadImpl = async () => {}, confirmAnswer = true
Object.assign(deps, {
  useProjectTeam: () => ({ team: [] }), useAuth: () => ({ profile: { role: "engineer" } }), useSignedUrl: () => ({ url: "blob:photo", failed: false }),
  useToast: () => ({ success: (...args) => calls.toasts.push(["success", ...args]), error: (...args) => calls.toasts.push(["error", ...args]) }),
  useConfirm: () => async options => { calls.confirms.push(options); return confirmAnswer },
  errorText: error => error.message, captureStamp: async () => stamp, stampSummary: () => "", photoPreviewBlocked: () => false,
  QA_CAPTION_LIMIT: 200,
  prepareQaPhoto: async file => { calls.prepare.push(file.name); return new File(["small"], file.name.replace(/\.\w+$/, ".webp"), { type: "image/webp" }) },
  uploadQaPhoto: (...args) => { calls.upload.push(args); return uploadImpl(...args) },
})
const { EvidenceStrip } = await compile("../src/components/qa/QaBits.tsx")
const stripProps = { projectId: "P", photos: [], target: { itemId: "I" }, canAdd: true, onChanged: () => { calls.changed++ }, label: "Item 1", compact: true }
reset(); render(EvidenceStrip, stripProps)
const fileInput = () => find(node => node.type === "input" && node.props.type === "file")
fileInput().props.ref.current = { value: "C:\\fakepath\\a.jpg", click() {} }
fileInput().props.onChange({ target: { files: [photoFile("a.jpg"), photoFile("b.jpg")] } })
await settle(); render(EvidenceStrip, stripProps)
assert.deepEqual(calls.prepare, ["a.jpg", "b.jpg"], "each chosen photo is shrunk before markup")
const dialog = () => find(node => node.type?.name === "Modal")
assert.equal(dialog().props.title, "Add photos: Item 1")
let picker = find(node => node.type?.name === "IssuePhotoPicker")
assert.equal(picker.props.photos.length, 2); assert.equal(picker.props.photos[0].caption, "", "QA captions start empty, not as file names")
assert.equal(picker.props.limit, 6); assert.equal(picker.props.captionLimit, 200); assert.equal(picker.props.nameCaptions, false)
assert.equal(picker.props.prepare, deps.prepareQaPhoto, "photos added inside the dialog are shrunk the same way")
assert.equal(picker.props.editorTitle, "Mark up evidence photo")
picker.props.onChange([{ ...picker.props.photos[0], annotations: markup, caption: "Joint gap" }, picker.props.photos[1]])
render(EvidenceStrip, stripProps)
uploadImpl = async (_project, _target, draft) => { if (draft.caption !== "Joint gap") throw new Error("Network lost") }
button("Add 2 photos").props.onClick()
await settle(); render(EvidenceStrip, stripProps)
assert.equal(calls.upload.length, 2)
assert.deepEqual(calls.upload[0].slice(0, 2), ["P", { itemId: "I" }]); assert.deepEqual(calls.upload[0][2].annotations, markup); assert.equal(calls.upload[0][3], stamp, "the stamp from when the photos were chosen is used")
assert.deepEqual(calls.toasts.at(-1), ["success", "Photo added"]); assert.equal(calls.changed, 1)
picker = find(node => node.type?.name === "IssuePhotoPicker")
assert.equal(picker.props.photos.length, 1, "only the failed photo stays in the dialog")
assert.match(text(find(node => node.props?.role === "alert")), /A photo was not added: Network lost\. Try again, or remove it\./)
uploadImpl = async () => {}
button("Add photo").props.onClick()
await settle(); render(EvidenceStrip, stripProps)
assert.ok(!has(node => node.type?.name === "Modal"), "the dialog closes once every photo is added"); assert.equal(calls.changed, 2)

fileInput().props.onChange({ target: { files: Array.from({ length: 8 }, (_, i) => photoFile(`p${i}.jpg`)) } })
await settle(); render(EvidenceStrip, stripProps)
assert.equal(find(node => node.type?.name === "IssuePhotoPicker").props.photos.length, 6)
assert.match(text(find(node => node.props?.role === "alert")), /Only the first 6 photos/)
button("Cancel").props.onClick(); await settle(); render(EvidenceStrip, stripProps)
assert.equal(calls.confirms.length, 0, "nothing marked up: Cancel needs no confirmation"); assert.ok(!has(node => node.type?.name === "Modal"))

fileInput().props.onChange({ target: { files: [photoFile("c.jpg")] } })
await settle(); render(EvidenceStrip, stripProps)
picker = find(node => node.type?.name === "IssuePhotoPicker")
picker.props.onChange([{ ...picker.props.photos[0], annotations: markup }]); render(EvidenceStrip, stripProps)
confirmAnswer = false
button("Cancel").props.onClick(); await settle(); render(EvidenceStrip, stripProps)
assert.equal(calls.confirms.length, 1); assert.ok(has(node => node.type?.name === "Modal"), "keeping the markup leaves the dialog open")
confirmAnswer = true
button("Cancel").props.onClick(); await settle(); render(EvidenceStrip, stripProps)
assert.ok(!has(node => node.type?.name === "Modal"))
assert.equal(calls.upload.length, 3, "cancelled photos are never uploaded")

// The saved thumbnail draws the markup cropped exactly like the photo (object-cover = slice), with a badge.
render(EvidenceStrip, { ...stripProps, photos: [{ id: "q1", path: "P/item-I/1.webp", caption: null, annotations: markup }, { id: "q2", path: "P/item-I/2.webp", caption: null }] })
const thumbs = all(tree).filter(node => node.type?.name === "Thumb")
reset(); render(thumbs[0].type, thumbs[0].props)
find(node => node.type === "img").props.onLoad({ currentTarget: { naturalWidth: 2000, naturalHeight: 1500 } }); render(thumbs[0].type, thumbs[0].props)
const overlay = find(node => node.type === "svg" && node.props.preserveAspectRatio)
assert.equal(overlay.props.preserveAspectRatio, "xMidYMid slice"); assert.equal(overlay.props.viewBox, "0 0 1000 750")
assert.deepEqual(find(node => node.type?.name === "MarkupLayer").props.items, markup); assert.ok(has(node => node.props?.title === "Marked up"))
reset(); render(thumbs[1].type, thumbs[1].props)
assert.equal(tree.type, "img", "a photo without markup is a plain thumbnail")

// ---- IssuePhotoPicker prepare mode: shrinks each file, locks while busy, empty captions, QA caption limit in the editor ----
deps.applyMarkupChanges = applyMarkupChanges
const Picker = (await compile("../src/components/issues/IssuePhotoPicker.tsx", { "../../lib/issueMarkup": new URL("../src/lib/issueMarkup.ts", import.meta.url).href })).default
let drafts = [], busyStates = []
const shrink = async file => new File(["s"], file.name + ".webp", { type: "image/webp" })
const pickerProps = () => ({ photos: drafts, onChange: next => { drafts = next }, limit: 6, prepare: shrink, onPreparing: busy => busyStates.push(busy), captionLimit: 200, nameCaptions: false, editorTitle: "Mark up evidence photo" })
reset(); render(Picker, pickerProps())
const pick = (files) => { const target = { files, value: "x" }; find(node => node.type === "input").props.onChange({ currentTarget: target }); return target }
const target = pick([photoFile("big.jpg", 9 * 1024 * 1024)])
assert.equal(target.value, "", "the file input is cleared at once")
render(Picker, pickerProps()); assert.match(text(tree), /Preparing photos/)
await settle()
assert.deepEqual(busyStates, [true, false]); assert.equal(drafts.length, 1, "prepare mode has no 8 MB limit: the shrunk file is kept")
assert.equal(drafts[0].file.name, "big.jpg.webp"); assert.equal(drafts[0].caption, "")
render(Picker, pickerProps()); assert.match(text(tree), /No caption yet/)
pick([photoFile("second.jpg")]); await settle(); render(Picker, pickerProps())
assert.equal(drafts.length, 2)
all(tree).filter(node => node.type === "button" && text(node) === "Edit / annotate")[1].props.onClick(); render(Picker, pickerProps())
let editor = find(node => node.type?.name === "IssuePhotoEditor")
assert.equal(editor.props.start, 1, "Edit / annotate opens the slideshow on that photo"); assert.deepEqual(editor.props.photos.map(photo => photo.src), drafts.map(draft => draft.url))
assert.equal(editor.props.title, "Mark up evidence photo"); assert.equal(editor.props.captionLimit, 200)
editor.props.onClose(); render(Picker, pickerProps())
button("Mark up photos (2)").props.onClick(); render(Picker, pickerProps())
editor = find(node => node.type?.name === "IssuePhotoEditor"); assert.equal(editor.props.start, 0)
const untouched = drafts[1]
editor.props.onSave([{ id: drafts[0].id, annotations: markup, caption: "Joint gap" }]); render(Picker, pickerProps())
assert.deepEqual(drafts[0].annotations, markup); assert.equal(drafts[1], untouched, "photos that did not change stay as they were"); assert.match(text(tree), /Joint gap · 1 mark/)
calls.confirms.length = 0; confirmAnswer = false
all(tree).filter(node => node.type === "button" && text(node) === "Remove")[0].props.onClick(); await settle()
assert.equal(calls.confirms.length, 1, "removing a marked-up photo asks first"); assert.equal(drafts.length, 2, "keeping it leaves the photo and its markup")
confirmAnswer = true
all(tree).filter(node => node.type === "button" && text(node) === "Remove")[1].props.onClick(); await settle()
assert.equal(calls.confirms.length, 1, "an untouched photo is removed without asking"); assert.equal(drafts.length, 1); assert.equal(drafts[0].caption, "Joint gap")
render(Picker, pickerProps())
// Without prepare (client reports, site issues) nothing changes: file names as captions and the 8 MB limit.
drafts = []; reset(); render(Picker, { photos: drafts, onChange: next => { drafts = next } })
pick([photoFile("crack.jpg")]); await settle()
assert.equal(drafts[0].caption, "crack.jpg"); assert.equal(drafts[0].file.name, "crack.jpg")
render(Picker, { photos: drafts, onChange: next => { drafts = next } })
pick([photoFile("huge.jpg", 9 * 1024 * 1024)]); await settle(); render(Picker, { photos: drafts, onChange: next => { drafts = next } })
assert.equal(drafts.length, 1); assert.match(text(find(node => node.props?.role === "alert")), /8 MB/)

// ---- PhotoViewer: saved markup over the original, with View original / Show markup ----
Object.assign(deps, { adjustPhotoZoom: (value, step) => value + step, buttonSecondary: "secondary" })
const Viewer = (await compile("../src/components/PhotoViewer.tsx")).default
const viewerProps = { photo: { id: "q1", path: "P/item-I/1.webp", caption: "Joint gap", label: "Item 1", created_at: "2026-10-21", annotations: markup }, bucket: "qa-evidence", onClose() {} }
reset(); render(Viewer, viewerProps)
assert.ok(!has(node => node.type?.name === "MarkupLayer"), "the overlay waits for the photo's real size")
find(node => node.type === "img").props.onLoad({ currentTarget: { naturalWidth: 1000, naturalHeight: 1250 } }); render(Viewer, viewerProps)
const drawn = find(node => node.type === "svg" && node.props.preserveAspectRatio)
assert.equal(drawn.props.preserveAspectRatio, "xMidYMid meet"); assert.equal(drawn.props.viewBox, "0 0 1000 1250")
assert.deepEqual(find(node => node.type?.name === "MarkupLayer").props.items, markup)
button("View original").props.onClick(); render(Viewer, viewerProps)
assert.ok(!has(node => node.type?.name === "MarkupLayer")); assert.equal(button("Show markup").props["aria-pressed"], true)
reset(); render(Viewer, { ...viewerProps, photo: { ...viewerProps.photo, annotations: [] } })
assert.ok(!has(node => node.type === "button" && /View original|Show markup/.test(text(node))), "photos without markup get no toggle")
assert.equal(find(node => node.type === "img").props.onLoad, undefined)

console.log("QA photo markup: upload keeps the shrunk original with validated markup, strip dialog add/retry/cancel, cropped thumbnail overlay, picker prepare mode, viewer overlay toggle")

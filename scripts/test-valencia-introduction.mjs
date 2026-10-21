import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
let slots = [], effects = [], pending = [], cursor = 0, tree
globalThis.__valenciaHooks = {
  useState(initial) {
    const n = cursor++
    if (!(n in slots)) slots[n] = typeof initial === "function" ? initial() : initial
    return [slots[n], value => { slots[n] = typeof value === "function" ? value(slots[n]) : value }]
  },
  useEffect(fn, deps) {
    const n = cursor++, old = effects[n]
    if (!old || deps?.some((value, i) => value !== old.deps?.[i])) pending.push(() => { old?.cleanup?.(); effects[n] = { deps, cleanup: fn() } })
  },
}
globalThis.__valenciaDeps = { readProjectRoute: () => null }
async function compile(file, overrides = {}) {
  const location = new URL(file, import.meta.url), source = readFileSync(location, "utf8")
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  const replacements = { "react/jsx-runtime": import.meta.resolve("react/jsx-runtime"), ...overrides }
  for (const declaration of ast.statements.filter(ts.isImportDeclaration)) {
    if (!declaration.importClause) { output = output.replace(`import "${declaration.moduleSpecifier.text}";`, ""); continue }
    if (declaration.importClause.isTypeOnly) continue
    const name = declaration.moduleSpecifier.text, bindings = []
    if (name in replacements) continue
    if (/\.(png|jpe?g)$/.test(name)) {
      const path = fileURLToPath(new URL(name, location))
      assert.ok(existsSync(path), `Missing company asset ${name}`)
      replacements[name] = url(`export default ${JSON.stringify(path)}`)
      continue
    }
    if (declaration.importClause.name) bindings.push(`export default function ${declaration.importClause.name.text}(){return null}`)
    for (const binding of declaration.importClause.namedBindings?.elements ?? []) {
      if (binding.isTypeOnly) continue
      const key = binding.propertyName?.text ?? binding.name.text
      bindings.push(`export const ${key}=globalThis.__valenciaDeps.${key} ?? function ${key}(){return null}`)
    }
    replacements[name] = url(bindings.join(";"))
  }
  for (const [name, replacement] of Object.entries(replacements)) output = output.replaceAll(`from "${name}"`, `from ${JSON.stringify(replacement)}`)
  return { module: await import(url(output)), source }
}
const react = url(`export {Component,Suspense,lazy} from ${JSON.stringify(import.meta.resolve("react"))};export const useState=globalThis.__valenciaHooks.useState,useEffect=globalThis.__valenciaHooks.useEffect`)
const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children), ...all(node.props?.footer)] : []
const text = node => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
const render = (Component, props = {}) => { cursor = 0; tree = Component(props); const jobs = pending; pending = []; jobs.forEach(fn => fn()); return tree }
const find = predicate => { const node = all(tree).find(predicate); assert.ok(node, "Expected company page control"); return node }

const oldWindow = globalThis.window, oldDocument = globalThis.document
const description = { content: "Original description" }
globalThis.document = { title: "BuildTrack", querySelector: () => description }
globalThis.window = { location: { href: "", pathname: "/valencia" }, history: {}, scrollTo() {} }
try {
  const contentResult = await compile("../src/pages/Public/valenciaContent.ts")
  const content = contentResult.module
  assert.equal(content.valenciaProjects.length, 4)
  assert.equal(content.valenciaServices.length, 4)
  assert.equal(content.valenciaProcess.length, 4)
  assert.deepEqual(content.valenciaCompany.phones, ["09971270773", "09104292842"])
  assert.equal(content.valenciaCompany.email, "valenciaconstruction2019@gmail.com")
  const inquiry = content.companyInquiryMailto("  Alex & Co  ", "alex+site@example.com", "A & B\nPlease call.")
  const params = new URLSearchParams(inquiry.split("?")[1])
  assert.match(params.get("body"), /^Name: Alex & Co\nEmail: alex\+site@example.com\n\nA & B\nPlease call\.$/)
  const logo = readFileSync(content.valenciaCompany.logo)
  assert.equal(logo.subarray(1, 4).toString(), "PNG")
  assert.equal(logo[25], 6, "Transparent logo must retain RGBA rather than flattening its alpha")

  const pageResult = await compile("../src/pages/Public/ValenciaIntroduction.tsx", { react, "./valenciaContent": url(await (async () => {
    const names = Object.keys(content)
    globalThis.__valenciaContent = content
    return names.map(name => `export const ${name}=globalThis.__valenciaContent.${name}`).join(";")
  })()) })
  const Page = pageResult.module.default
  let navigated = ""
  const props = { navigate: page => { navigated = page } }
  render(Page, props)
  assert.match(document.title, /Valencia Construction Services/)
  assert.match(description.content, /fit-outs/)
  assert.equal(all(tree).filter(node => node.type === "h1").length, 1)
  for (const link of content.companySections) assert.ok(all(tree).some(node => node.props?.id === link.href.slice(1)), `Missing anchor ${link.href}`)
  const header = find(node => node.type?.name === "Header")
  assert.deepEqual(header.props.navigation, content.companySections)
  assert.equal(all(tree).filter(node => node.props?.className === "valencia-project").length, 4)
  assert.ok(all(tree).filter(node => node.type === "img").every(node => typeof node.props.alt === "string"))
  assert.ok(all(tree).filter(node => node.props?.target === "_blank").every(node => /noopener/.test(node.props.rel)))

  find(node => node.type === "button" && text(node) === "Residential").props.onClick()
  render(Page, props)
  assert.equal(all(tree).filter(node => node.props?.className === "valencia-project").length, 1)
  assert.match(text(find(node => node.props?.className === "valencia-project")), /Ticzon Residence/)
  find(node => node.type === "button" && /View Ticzon Residence photos/.test(node.props?.["aria-label"])).props.onClick()
  render(Page, props)
  assert.match(find(node => node.props?.className === "valencia-gallery__caption").props.children, /perspective.*not a completion photograph/)
  find(node => node.props?.["aria-label"] === "Next project photo").props.onClick()
  render(Page, props)
  assert.match(text(tree), /Image 2 of 2/)
  assert.match(text(find(node => node.props?.className === "valencia-gallery__caption")), /construction photograph/)
  find(node => node.props?.["aria-label"] === "Next project photo").props.onClick()
  render(Page, props)
  assert.match(text(tree), /Image 1 of 2/)
  const gallery = find(node => node.props?.className === "valencia-gallery")
  let prevented = false
  gallery.props.onKeyDown({ key: "ArrowLeft", target: gallery, currentTarget: gallery, preventDefault() { prevented = true } })
  render(Page, props)
  assert.ok(prevented)
  assert.match(text(tree), /Image 2 of 2/)
  const modal = find(node => node.type?.name === "Modal")
  modal.props.onClose()
  render(Page, props)
  assert.ok(!all(tree).some(node => node.props?.className === "valencia-gallery"))
  find(node => node.type === "button" && text(node) === "All projects").props.onClick()
  render(Page, props)
  find(node => node.type === "button" && /View Biocare Centuria photos/.test(node.props?.["aria-label"])).props.onClick()
  render(Page, props)
  assert.match(text(tree), /Image 1 of 1/)
  assert.ok(!all(tree).some(node => node.props?.["aria-label"] === "Next project photo"))
  assert.match(text(tree), /Listed as ongoing on the source website/)
  find(node => node.type?.name === "Modal").props.onClose()
  render(Page, props)

  for (const [id, value] of [["valencia-name", "Alex & Co"], ["valencia-email", "alex+site@example.com"], ["valencia-message", "A home in Rizal"]]) {
    find(node => node.props?.id === id).props.onChange({ target: { value } })
  }
  render(Page, props)
  find(node => node.type === "form").props.onSubmit({ preventDefault() {} })
  render(Page, props)
  assert.equal(window.location.href, content.companyInquiryMailto("Alex & Co", "alex+site@example.com", "A home in Rizal"))
  assert.match(text(tree), /it has not been submitted by this website/)
  assert.ok(all(tree).some(node => node.props?.href === "tel:09971270773"))
  const maps = find(node => node.props?.href?.startsWith("https://www.google.com/maps/search/"))
  assert.equal(new URL(maps.props.href).searchParams.get("query"), content.valenciaCompany.address)
  find(node => node.type === "button" && text(node).includes("Explore BuildTrack")).props.onClick()
  assert.equal(navigated, "home")
  assert.ok(!/supabase|useAuth|dangerouslySetInnerHTML/.test(pageResult.source), "Company page must not load private records or source-site scripts")
  effects.forEach(effect => effect?.cleanup?.())
  assert.equal(document.title, "BuildTrack")
  assert.equal(description.content, "Original description")

  const { module: { default: Header } } = await compile("../src/components/Header.tsx")
  tree = Header({ navigate() {} })
  assert.ok(all(tree).some(node => node.props?.href === "/valencia"))
  tree = Header({ navigate() {}, brandingOnly: true })
  assert.ok(!all(tree).some(node => node.type === "nav" || node.type === "button"), "Standalone attendance header must remain branding-only")

  const { module: { default: App } } = await compile("../src/App.tsx", { react })
  for (const path of ["/valencia", "/valencia/"]) {
    window.location.pathname = path
    const app = new App({})
    assert.equal(app.state.page, "valencia")
    assert.equal(app.render().type.name, "ErrorBoundary", "Static company route must not wait for an account guard")
  }
  window.location.pathname = "/engineer/verification"
  const protectedApp = new App({})
  assert.equal(protectedApp.state.page, "engineer/verification")
  assert.equal(protectedApp.render().type.name, "RouteGuard", "Workspace routes must remain protected")
  const css = readFileSync(new URL("../src/pages/Public/valencia.css", import.meta.url), "utf8")
  assert.match(css, /max-width: 720px/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /focus-visible/)
  console.log("Valencia introduction: local/transparent assets, complete source sections, public/private routing, unchanged branding-only header, project filters/slideshow/keyboard/labels, honest encoded email inquiry, real address links and metadata cleanup passed")
} finally {
  globalThis.window = oldWindow
  globalThis.document = oldDocument
  delete globalThis.__valenciaHooks
  delete globalThis.__valenciaDeps
  delete globalThis.__valenciaContent
}

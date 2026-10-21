import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
const transpile = source => ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const originalWindow = globalThis.window, originalDocument = globalThis.document
const listeners = new Map(), scrolls = [], targets = new Map()
globalThis.__publicEffects = []
const reactStub = dataUrl("export const useEffect=fn=>globalThis.__publicEffects.push(fn)")
const navigationSource = readFileSync(new URL("../src/lib/publicNavigation.ts", import.meta.url), "utf8")
const navigationUrl = dataUrl(transpile(navigationSource).replace('from "react"', `from ${JSON.stringify(reactStub)}`))
const { handlePublicNavigation, usePublicHashScroll } = await import(navigationUrl)
const go = path => { globalThis.window.location = new URL(path, "https://valencia-buildtrack.vercel.app") }
globalThis.window = {
  addEventListener(name, handler) { listeners.set(name, handler) },
  removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name) },
}
globalThis.document = { getElementById: id => targets.get(id) ?? null }
const click = (overrides = {}, attributes = {}) => ({
  button: 0, defaultPrevented: false,
  currentTarget: { getAttribute: key => attributes[key] ?? null, hasAttribute: key => key in attributes },
  preventDefault() { this.defaultPrevented = true },
  ...overrides,
})
try {
  let calls = []
  const navigate = (page, hash) => calls.push({ page, hash })
  for (const [from, href, page, hash] of [
    ["/valencia", "/buildtrack", "home", ""],
    ["/buildtrack", "/valencia", "valencia", ""],
    ["/buildtrack", "/buildtrack#services", "home", "#services"],
    ["/valencia", "/buildtrack#features", "home", "#features"],
    ["/valencia", "#valencia-about", "valencia", "#valencia-about"],
    ["/buildtrack", "#contact", "home", "#contact"],
    ["/buildtrack/", "/valencia/", "valencia", ""],
  ]) {
    go(from)
    const event = click(), previous = window.location.href
    handlePublicNavigation(event, href, navigate)
    assert.ok(event.defaultPrevented, `Prevent full-page navigation for ${href}`)
    assert.deepEqual(calls.at(-1), { page, hash })
    assert.equal(window.location.href, previous, "Only the application navigator changes the address")
  }
  for (const [href, overrides, attributes] of [
    ["/buildtrack", { ctrlKey: true }], ["/buildtrack", { metaKey: true }],
    ["/buildtrack", { shiftKey: true }], ["/buildtrack", { altKey: true }],
    ["/buildtrack", { button: 1 }], ["/buildtrack", { defaultPrevented: true }],
    ["/buildtrack", {}, { target: "_blank" }], ["/buildtrack", {}, { download: "" }],
    ["https://other.example/buildtrack"], ["mailto:company@example.com"], ["tel:09971270773"],
    ["javascript:alert(1)"], ["http://["], ["/login"], ["/engineer/verification"], ["/buildtrack?preview=1"],
  ]) {
    go("/valencia")
    const event = click(overrides, attributes), count = calls.length
    handlePublicNavigation(event, href, navigate)
    assert.equal(calls.length, count, `Leave native/unrelated navigation alone: ${href}`)
    assert.equal(event.defaultPrevented, Boolean(overrides?.defaultPrevented))
  }

  const headerSource = readFileSync(new URL("../src/components/Header.tsx", import.meta.url), "utf8")
  const headerOutput = transpile(headerSource)
    .replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`)
    .replace('from "./Brand"', `from ${JSON.stringify(dataUrl("export default function Brand(){return null}"))}`)
    .replace('from "../lib/publicNavigation"', `from ${JSON.stringify(navigationUrl)}`)
  const { default: Header } = await import(dataUrl(headerOutput))
  const all = node => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : []
  const cases = [
    ["/buildtrack", Header({ navigate }), "/valencia", "valencia", ""],
    ["/valencia", Header({ navigate, navigation: [{ href: "/buildtrack", label: "BuildTrack" }], showAuthActions: false }), "/buildtrack", "home", ""],
    ["/buildtrack", Header({ navigate }), "/buildtrack#services", "home", "#services"],
  ]
  for (const [path, tree, href, page, hash] of cases) {
    go(path)
    const anchor = all(tree).find(node => node.type === "a" && node.props.href === href)
    assert.ok(anchor)
    const event = click()
    anchor.props.onClick(event)
    assert.ok(event.defaultPrevented)
    assert.deepEqual(calls.at(-1), { page, hash }, "Actual header uses the SPA navigation handler")
  }

  const footerSource = readFileSync(new URL("../src/components/PublicFooter.tsx", import.meta.url), "utf8")
  const footerOutput = transpile(footerSource)
    .replace('from "react/jsx-runtime"', `from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`)
    .replace('from "./Brand"', `from ${JSON.stringify(dataUrl("export default function Brand(){return null}"))}`)
    .replace('from "./Icons"', `from ${JSON.stringify(dataUrl("export default function Icon(){return null}"))}`)
    .replace('from "../lib/publicNavigation"', `from ${JSON.stringify(navigationUrl)}`)
  const { default: PublicFooter } = await import(dataUrl(footerOutput))
  const text = node => Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : typeof node === "string" || typeof node === "number" ? String(node) : ""
  for (const page of ["buildtrack", "valencia"]) {
    go(`/${page}`)
    const footer = PublicFooter({ navigate, page }), nodes = all(footer)
    assert.equal(footer.type, "footer")
    assert.equal(footer.props.className, page === "valencia" ? "site-footer site-footer--neutral" : "site-footer")
    assert.equal(footer.props.id, page === "buildtrack" ? "contact" : undefined, "Valencia retains its actual contact section, not a duplicate footer anchor")
    for (const heading of ["Navigation", "Platform Services", "Contact Us"]) assert.ok(nodes.some(node => node.type === "h3" && text(node) === heading))
    assert.ok(nodes.some(node => node.props?.className === "site-footer__grid"), "Both pages share the responsive four-column landing footer")
    assert.ok(!/Stay connected|Visit Valencia's website/.test(text(footer)), "Remove the unwanted company-site promotion")
    assert.ok(nodes.some(node => node.props?.href === "mailto:valenciaconstruction2019@gmail.com"))
    for (const phone of ["09971270773", "09104292842"]) assert.ok(nodes.some(node => node.props?.href === `tel:${phone}`))
    const links = nodes.find(node => node.props?.["aria-label"] === "Footer navigation").props.children[1]
    assert.deepEqual(links.map(link => link.props.href), ["/valencia", `/${page}#${page === "valencia" ? "valencia-" : ""}about`, `/${page}#${page === "valencia" ? "valencia-" : ""}services`, "/buildtrack#features", `/${page}#${page === "valencia" ? "valencia-" : ""}contact`])
    for (const link of links) {
      const event = click(), destination = new URL(link.props.href, window.location.href)
      link.props.onClick(event)
      assert.ok(event.defaultPrevented)
      assert.deepEqual(calls.at(-1), { page: destination.pathname === "/valencia" ? "valencia" : "home", hash: destination.hash }, "Every footer section/cross-page link uses tested SPA navigation")
      const modified = click({ ctrlKey: true }), count = calls.length
      link.props.onClick(modified)
      assert.ok(!modified.defaultPrevented)
      assert.equal(calls.length, count)
    }
  }
  const footerStyles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8")
  assert.match(footerStyles, /\.site-footer--neutral \.footer-intro \.brand__name, \.site-footer--neutral \.footer-column h3, \.site-footer--neutral \.footer-column a:hover \{ color: white; \}/, "Valencia footer brand, headings and hover text remain white, never yellow")
  assert.ok(!readFileSync(new URL("../src/pages/Public/valencia.css", import.meta.url), "utf8").includes("valencia-footer"), "Remove obsolete company footer overrides")

  go("/buildtrack#services")
  targets.set("services", { scrollIntoView: options => scrolls.push({ id: "services", options }) })
  targets.set("valencia-about", { scrollIntoView: options => scrolls.push({ id: "valencia-about", options }) })
  usePublicHashScroll()
  const cleanup = globalThis.__publicEffects.at(-1)()
  assert.deepEqual(scrolls.at(-1), { id: "services", options: { block: "start" } }, "Mounted lazy page scrolls after its section exists")
  go("/valencia#valencia-about")
  listeners.get("hashchange")()
  assert.equal(scrolls.at(-1).id, "valencia-about")
  go("/buildtrack#services")
  listeners.get("popstate")()
  assert.equal(scrolls.at(-1).id, "services", "Back/Forward restores section navigation")
  go("/buildtrack#%")
  assert.doesNotThrow(() => listeners.get("hashchange")())
  go("/buildtrack#missing")
  assert.doesNotThrow(() => listeners.get("hashchange")())
  cleanup()
  assert.equal(listeners.size, 0)

  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"))
  assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/index.html" }], "Use Vercel's documented Vite SPA deep-link fallback")
  for (const path of ["/valencia", "/buildtrack", "/login", "/pin", "/attendance", "/engineer/verification"]) {
    assert.ok(new RegExp(`^${config.rewrites[0].source}$`).test(path))
  }
  for (const path of ["../src/pages/Public/LandingPage.tsx", "../src/pages/Public/ValenciaIntroduction.tsx"]) {
    assert.match(readFileSync(new URL(path, import.meta.url), "utf8"), /usePublicHashScroll\(\)/)
  }
  assert.match(readFileSync(new URL("../src/index.css", import.meta.url), "utf8"), /\.landing \[id\] \{ scroll-margin-top: 96px; \}/)
  console.log("Public navigation: actual header and shared footer SPA clicks, neutral Valencia footer/no unwanted promotion, same/cross-page fragments, modified/new-tab/external safety, lazy-page and Back/Forward scrolling, cleanup, sticky-header offset and Vercel deep-link rewrite passed")
} finally {
  globalThis.window = originalWindow
  globalThis.document = originalDocument
  delete globalThis.__publicEffects
}

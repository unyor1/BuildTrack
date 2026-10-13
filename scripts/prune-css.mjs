// Finds CSS rules in src/index.css whose classes are never used by any source file (dead styles left from old per-role shells).
// Usage: node scripts/prune-css.mjs            -> report only
//        node scripts/prune-css.mjs --write    -> remove the dead rules
// A class counts as used when its full name appears in src/**/*.{ts,tsx,html} or index.html, or (for BEM modifiers like
// `admin-status--warning`) when its stem `admin-status--` appears (dynamic class names such as `admin-status--${tone}`).
// A rule is removed only when EVERY selector in it contains a dead class. Tailwind-generated and @layer content is left alone.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import postcss from "postcss"

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const cssPath = join(root, "src", "index.css")
const css = readFileSync(cssPath, "utf8")

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (/\.(tsx?|html|json)$/.test(name)) files.push(full)
  }
}
walk(join(root, "src"))
files.push(join(root, "index.html"))
const source = files.map((file) => readFileSync(file, "utf8")).join("\n")

const used = (cls) => {
  if (source.includes(cls)) return true
  const cut = cls.search(/--|__/)
  if (cut > 0) {
    // modifier / element of a block: used dynamically when the block stem with its separator appears in a template string
    const stem = cls.slice(0, cut + 2)
    if (source.includes(stem + "$") || source.includes(stem + "\"") === false && source.includes(stem)) return true
  }
  return false
}

const root2 = postcss.parse(css)
let removedRules = 0
let removedBytes = 0
const removed = []

const classesOf = (selector) => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
const isDeadSelector = (selector) => {
  // :is() / :where() need only ONE live alternative and :not(.dead) is always true, so such selectors are never judged here
  if (/:(is|where|not|has|matches)\(/.test(selector)) return false
  const classes = classesOf(selector)
  return classes.length > 0 && classes.some((cls) => !used(cls))
}

root2.walkRules((rule) => {
  // keep anything inside @keyframes, @layer base/theme, @theme, @font-face, @custom-variant
  let parent = rule.parent
  while (parent && parent.type !== "root") {
    if (parent.type === "atrule" && /^(keyframes|font-face|theme|layer|custom-variant|property)$/.test(parent.name)) return
    parent = parent.parent
  }
  const selectors = rule.selectors ?? []
  if (!selectors.length) return
  if (selectors.every(isDeadSelector)) {
    removed.push(rule.selector.slice(0, 90))
    removedBytes += rule.toString().length
    removedRules++
    rule.remove()
  } else if (selectors.some(isDeadSelector)) {
    // keep the live selectors, drop the dead ones from a shared rule
    const live = selectors.filter((selector) => !isDeadSelector(selector))
    removedBytes += rule.selector.length - live.join(", ").length
    rule.selector = live.join(", ")
  }
})

// remove at-rules (media) that became empty
root2.walkAtRules((atRule) => {
  if (atRule.nodes && atRule.nodes.length === 0 && /^(media|supports)$/.test(atRule.name)) atRule.remove()
})

console.log(`Dead rules: ${removedRules}, about ${(removedBytes / 1024).toFixed(1)} KB of ${(css.length / 1024).toFixed(1)} KB`)
console.log(removed.slice(0, process.argv.includes("--list") ? removed.length : 15).map((s) => "  " + s).join("\n"))
if (process.argv.includes("--write")) {
  writeFileSync(cssPath, root2.toString())
  console.log("written")
}

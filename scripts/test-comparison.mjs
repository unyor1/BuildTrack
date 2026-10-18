import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { comparisonFitWidth, comparisonWasDragged } from "../src/lib/comparisonModel.ts"

// Render the real comparison canvas without an authenticated browser or storage access.
const source=readFileSync(new URL("../src/components/ComparisonCanvas.tsx",import.meta.url),"utf8")
let compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
compiled=compiled.replace(/from ["'](react(?:\/[^"']+)*)["']/g,(_,specifier)=>`from ${JSON.stringify(import.meta.resolve(specifier))}`)
compiled=compiled.replace('"../lib/comparisonModel"',JSON.stringify(new URL("../src/lib/comparisonModel.ts",import.meta.url).href))
const {default:ComparisonCanvas}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"))
const html=renderToStaticMarkup(createElement(ComparisonCanvas,{firstUrl:"before-test.jpg",lastUrl:"after-test.jpg",labels:["Found at inspection","Latest"],split:35,onSplit:()=>{}}))
assert.equal((html.match(/<img /g) ?? []).length,2,"Both photos must remain in the same comparison")
assert.match(html,/src="before-test.jpg"/)
assert.match(html,/src="after-test.jpg"/)
assert.match(html,/clip-path:inset\(0 65% 0 0\)/,"Divider clips only the top layer")
assert.match(html,/type="range"/,"Original draggable keyboard-accessible divider remains")
assert.match(html,/value="35"/,"The existing divider position is preserved")
assert.equal(comparisonWasDragged({x:10,y:10},{x:12,y:12}),false,"A click may enlarge the whole comparison")
assert.equal(comparisonWasDragged({x:10,y:10},{x:80,y:10}),true,"A comparison drag must not open the viewer")
assert.equal(comparisonWasDragged({x:10,y:10},{x:10,y:80}),true,"Touch movement is not a click")
assert.equal(comparisonFitWidth(1000,600),800,"Fit keeps both photos within viewport height")
assert.equal(comparisonFitWidth(320,600),320,"Fit respects narrow viewport width")
console.log("Comparison rendering and click/drag/fit checks passed")

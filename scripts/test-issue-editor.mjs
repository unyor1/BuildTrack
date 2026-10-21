import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { markupProblem } from "../src/lib/issueMarkup.ts"

// Exercise the actual editor's pointer and save handlers without browser credentials or real file uploads.
const dataModule=source=>"data:text/javascript;base64,"+Buffer.from(source).toString("base64")
const hookModule=dataModule("export const useState=(...a)=>globalThis.__issueEditorHooks.useState(...a);export const useRef=(...a)=>globalThis.__issueEditorHooks.useRef(...a);export const useId=()=> 'test-arrow';")
const modalModule=dataModule("export default function Modal(){return null}")
const pageModule=dataModule("export const buttonPrimary='primary',buttonSecondary='secondary',buttonDanger='danger',inputClass='field';")
const source=readFileSync(new URL("../src/components/issues/IssuePhotoEditor.tsx",import.meta.url),"utf8")
let compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
compiled=compiled.replace(/from ["']react["']/g,`from ${JSON.stringify(hookModule)}`)
compiled=compiled.replace(/from ["']react\/jsx-runtime["']/g,`from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`)
compiled=compiled.replace('"../Modal"',JSON.stringify(modalModule)).replace('"../ui/PageParts"',JSON.stringify(pageModule))
compiled=compiled.replace('"../../lib/issueMarkup"',JSON.stringify(new URL("../src/lib/issueMarkup.ts",import.meta.url).href))
const {default:Editor,MarkupLayer}=await import(dataModule(compiled))
let values=[],cursor=0
globalThis.__issueEditorHooks={
  useState(initial){const n=cursor++;if(!(n in values))values[n]=typeof initial === "function" ? initial() : initial;return [values[n],next=>{values[n]=typeof next === "function" ? next(values[n]) : next}]},
  useRef(initial){const n=cursor++;if(!(n in values))values[n]={current:initial};return values[n]},
}
globalThis.window={confirm:()=>true}
let saved,closed=0,tree
const props={src:"original-test.jpg",initial:[],caption:"Original caption",onClose:()=>closed++,onSave:async(items,caption)=>{saved={items,caption}}}
const all=node=>{
  if(!node || typeof node!=="object")return []
  if(Array.isArray(node))return node.flatMap(all)
  return [node,...all(node.props?.children),...all(node.props?.footer)]
}
const label=node=>typeof node === "string" ? node : Array.isArray(node) ? node.map(label).join("") : node?.props ? label(node.props.children) : ""
const get=predicate=>{const found=all(tree).find(predicate);assert.ok(found,"Expected editor control");return found}
const button=text=>get(node=>node.type === "button" && label(node)===text)
const render=()=>{
  cursor=0;tree=Editor(props)
  get(node=>node.type === "svg").props.ref.current={getBoundingClientRect:()=>({left:0,top:0,width:1000,height:500}),setPointerCapture(){},hasPointerCapture(){return false}}
  return tree
}
const canvas=()=>get(node=>node.type === "svg")
const items=()=>get(node=>node.type === MarkupLayer).props.items
const event=(x,y)=>({button:0,pointerId:1,clientX:x,clientY:y,stopPropagation(){}})
render()
get(node=>node.type === "img").props.onLoad({currentTarget:{naturalWidth:2000,naturalHeight:1000}});render()
button("Line").props.onClick();render()
canvas().props.onPointerDown(event(100,100));render();canvas().props.onPointerMove(event(700,400));render();canvas().props.onPointerUp(event(700,400));render()
assert.equal(items().length,1);assert.equal(items()[0].kind,"line");assert.equal(items()[0].x,10);assert.equal(items()[0].y2,80)
button("Select").props.onClick();render()
get(node=>node.type === MarkupLayer).props.onSelect(items()[0].id,event(100,100));render();canvas().props.onPointerMove(event(200,150));render();canvas().props.onPointerUp(event(200,150));render()
assert.equal(items()[0].x,20);assert.equal(items()[0].y,30)
button("Undo").props.onClick();render();assert.equal(items()[0].x,10)
button("Redo").props.onClick();render();assert.equal(items()[0].x,20)
get(node=>node.props?.["aria-label"] === "Annotation text").props.onChange({target:{value:"Engineer note"}});render()
button("Text").props.onClick();render();canvas().props.onPointerDown(event(300,200));render()
assert.equal(items()[1].text,"Engineer note")
for(const tool of ["Arrow","Rectangle","Ellipse","Freehand"]){
  button(tool).props.onClick();render();canvas().props.onPointerDown(event(200,100));render();canvas().props.onPointerMove(event(600,300));render();canvas().props.onPointerUp(event(600,300));render()
}
assert.equal(items().length,6);assert.equal(markupProblem(items()),"")
button("Delete selected").props.onClick();render();assert.equal(items().length,5)
const originalBefore=JSON.stringify(items())
button("View original").props.onClick();render()
assert.ok(!all(tree).some(node=>node.type === MarkupLayer),"Original toggle hides markup without deleting it")
button("Show markup").props.onClick();render();assert.equal(JSON.stringify(items()),originalBefore)
await button("Save photo markup").props.onClick();render()
assert.equal(saved.items.length,5);assert.equal(saved.caption,"Original caption");assert.equal(closed,1)
assert.deepEqual(props.initial,[],"The original input/saved version is never mutated")
const malicious={...saved.items[0],kind:"text",text:"<script>alert(1)</script>"}
const html=renderToStaticMarkup(createElement("svg",null,createElement(MarkupLayer,{items:[malicious],height:500})))
assert.ok(html.includes("&lt;script&gt;"));assert.ok(!html.includes("<script>"))
console.log("Issue photo editor rendering, drawing, dragging, text, shapes, undo/redo, original toggle, save and escaping checks passed")

// Exercise the actual Log issue form's pin/checklist controls and submitted payload, without network access.
let logCalls=[],retryCalls=0
globalThis.__issueChecklistTest={
  lists:{
    "pin-a":{items:[{id:"floor-a",pin_id:"pin-a",text:"FLOOR"}],loading:false,error:"",reload:async()=>retryCalls++},
    "pin-b":{items:[{id:"wall-b",pin_id:"pin-b",text:"WALL"}],loading:false,error:"",reload:async()=>retryCalls++},
  },
  log:async input=>{logCalls.push(input)},
}
const blueprintModule=dataModule("export const severityLabels={low:'Low',medium:'Medium',high:'High',critical:'Critical'};export const useChecklist=id=>globalThis.__issueChecklistTest.lists[id];")
const progressModule=dataModule("export const severityOrder=['critical','high','medium','low'];")
const issueModule=dataModule("export const logSiteIssue=input=>globalThis.__issueChecklistTest.log(input);")
let logCompiled=ts.transpileModule(readFileSync(new URL("../src/components/issues/LogIssueModal.tsx",import.meta.url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
for(const [path,replacement] of [["react",hookModule],["react/jsx-runtime",import.meta.resolve("react/jsx-runtime")],["../Modal",modalModule],["../ui/PageParts",pageModule],["../../lib/blueprints",blueprintModule],["../../lib/progress",progressModule],["../../lib/siteIssues",issueModule],["./IssuePhotoPicker",modalModule],["../../lib/issueChecklist",new URL("../src/lib/issueChecklist.ts",import.meta.url).href]]) {
  logCompiled=logCompiled.replace(`from "${path}"`,`from ${JSON.stringify(replacement)}`)
}
const {default:LogIssueModal}=await import(dataModule(logCompiled))
const logProps={pins:[{id:"pin-a",project_id:"project",blueprint_id:"sheet",status:"in_progress",category:"progress",title:"Kitchen"},{id:"pin-b",project_id:"project",blueprint_id:"sheet",status:"in_progress",category:"progress",title:"Laundry"}],sheetOf:()=>"Plan",onClose:()=>{},onDone:async()=>{}}
const renderLog=()=>{cursor=0;tree=LogIssueModal(logProps)}
const field=title=>get(node=>node.type === "label" && node.props.children[0]===title).props.children.find(node=>node?.type === "select")
values=[];renderLog()
assert.equal(field("Checklist item").props.children[1][0].props.children,"FLOOR")
field("Checklist item").props.onChange({target:{value:"floor-a"}});renderLog()
get(node=>node.type === "textarea").props.onChange({target:{value:"Synthetic issue description"}});renderLog()
get(node=>node.type === "form").props.onSubmit({preventDefault(){}})
await new Promise(resolve=>setImmediate(resolve));renderLog()
assert.equal(logCalls.length,1);assert.equal(logCalls[0].checklistItemId,"floor-a");assert.equal(logCalls[0].pinId,"pin-a")
field("Work pin").props.onChange({target:{value:"pin-b"}});renderLog()
assert.equal(field("Checklist item").props.value,"")
assert.equal(field("Checklist item").props.children[1][0].props.children,"WALL")
field("Checklist item").props.onChange({target:{value:"floor-a"}});renderLog()
assert.equal(button("Log issue").props.disabled,true)
get(node=>node.type === "form").props.onSubmit({preventDefault(){}})
await new Promise(resolve=>setImmediate(resolve));assert.equal(logCalls.length,1,"Wrong-pin checklist cannot be submitted")
field("Checklist item").props.onChange({target:{value:""}})
globalThis.__issueChecklistTest.lists["pin-b"].loading=true;renderLog();assert.equal(button("Log issue").props.disabled,true)
globalThis.__issueChecklistTest.lists["pin-b"].loading=false;globalThis.__issueChecklistTest.lists["pin-b"].error="offline";renderLog()
assert.equal(button("Log issue").props.disabled,true);button("Retry checklist").props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(retryCalls,1)
globalThis.__issueChecklistTest.lists["pin-b"].error="";renderLog();assert.equal(button("Log issue").props.disabled,false)
console.log("Issue checklist form options, saved selection, pin-change reset, wrong-pin rejection, loading/error guards and retry checks passed")
delete globalThis.__issueChecklistTest
delete globalThis.__issueEditorHooks

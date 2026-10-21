import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { markupProblem } from "../src/lib/issueMarkup.ts"
import { CANVAS_ZOOM_STEP, fitCanvasView, zoomCanvasView, pinchCanvasView } from "../src/lib/canvasView.ts"

// Match the pre-existing sheet editor formulas, including clamped extremes.
for(const image of [{width:2000,height:1000},{width:1000,height:4000},{width:100,height:100}]) {
  for(const viewport of [{width:1000,height:500},{width:320,height:240},{width:1920,height:1000}]) {
    const scale=Math.min(10,Math.max(0.05,Math.min((viewport.width-24)/image.width,(viewport.height-24)/image.height)))
    assert.deepEqual(fitCanvasView(image,viewport),{scale,tx:(viewport.width-image.width*scale)/2,ty:(viewport.height-image.height*scale)/2})
  }
}
for(const current of [{scale:0.05,tx:10,ty:20},{scale:0.75,tx:-40,ty:30},{scale:10,tx:-100,ty:-200}]) {
  for(const factor of [0.001,1/CANVAS_ZOOM_STEP,CANVAS_ZOOM_STEP,1000]) {
    const anchor={x:270,y:130},scale=Math.min(10,Math.max(0.05,current.scale*factor)),ratio=scale/current.scale
    assert.deepEqual(zoomCanvasView(current,factor,anchor),{scale,tx:anchor.x-(anchor.x-current.tx)*ratio,ty:anchor.y-(anchor.y-current.ty)*ratio})
  }
}

// Exercise the actual editor's pointer and save handlers without browser credentials or real file uploads.
const dataModule=source=>"data:text/javascript;base64,"+Buffer.from(source).toString("base64")
const hookModule=dataModule("export const useState=(...a)=>globalThis.__issueEditorHooks.useState(...a);export const useRef=(...a)=>globalThis.__issueEditorHooks.useRef(...a);export const useEffect=(...a)=>globalThis.__issueEditorHooks.useEffect(...a);export const useId=()=> 'test-arrow';")
const modalModule=dataModule("export default function Modal(){return null}")
const pageModule=dataModule("export const buttonPrimary='primary',buttonSecondary='secondary',buttonDanger='danger',inputClass='field';")
const source=readFileSync(new URL("../src/components/issues/IssuePhotoEditor.tsx",import.meta.url),"utf8")
let compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
compiled=compiled.replace(/from ["']react["']/g,`from ${JSON.stringify(hookModule)}`)
compiled=compiled.replace(/from ["']react\/jsx-runtime["']/g,`from ${JSON.stringify(import.meta.resolve("react/jsx-runtime"))}`)
compiled=compiled.replace('"../Modal"',JSON.stringify(modalModule)).replace('"../ui/PageParts"',JSON.stringify(pageModule))
compiled=compiled.replace('"../../lib/issueMarkup"',JSON.stringify(new URL("../src/lib/issueMarkup.ts",import.meta.url).href))
compiled=compiled.replace('"../../lib/canvasView"',JSON.stringify(new URL("../src/lib/canvasView.ts",import.meta.url).href))
const {default:Editor,MarkupLayer}=await import(dataModule(compiled))
let values=[],cursor=0,queued=[]
globalThis.__issueEditorHooks={
  useState(initial){const n=cursor++;if(!(n in values))values[n]=typeof initial === "function" ? initial() : initial;return [values[n],next=>{values[n]=typeof next === "function" ? next(values[n]) : next}]},
  useRef(initial){const n=cursor++;if(!(n in values))values[n]={current:initial};return values[n]},
  useEffect(fn,deps){const n=cursor++,old=values[n];if(!old || deps.some((value,i)=>value!==old.deps[i])) queued.push(()=>{old?.cleanup?.();values[n]={deps,cleanup:fn()}})},
}
const resizeListeners=new Map(),viewportSize={width:1000,height:500}
const frameListeners=new Map(),captured=new Set()
const frameElement={get clientWidth(){return viewportSize.width},get clientHeight(){return viewportSize.height},getBoundingClientRect:()=>({left:0,top:0}),addEventListener:(name,fn)=>frameListeners.set(name,fn),removeEventListener:name=>frameListeners.delete(name),focus(){},setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)}
globalThis.window={confirm:()=>true,addEventListener:(name,fn)=>resizeListeners.set(name,fn),removeEventListener:name=>resizeListeners.delete(name)}
let saved,closed=0,tree
const props={src:"original-test.jpg",initial:[],caption:"Original caption",onClose:()=>closed++,onSave:async(items,caption)=>{saved={items,caption}}}
const all=node=>{
  if(!node || typeof node!=="object")return []
  if(Array.isArray(node))return node.flatMap(all)
  return [node,...all(node.props?.children),...all(node.props?.footer)]
}
const label=node=>typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(label).join("") : node?.props ? label(node.props.children) : ""
const get=predicate=>{const found=all(tree).find(predicate);assert.ok(found,"Expected editor control");return found}
const button=text=>get(node=>node.type === "button" && label(node)===text)
const render=()=>{
  cursor=0;tree=Editor(props)
  get(node=>node.props?.["aria-label"] === "Photo annotation canvas").props.ref.current={getBoundingClientRect:()=>({left:0,top:0,width:1000,height:500}),setPointerCapture(){},hasPointerCapture(){return false}}
  get(node=>node.props?.["aria-label"] === "Photo editing viewport").props.ref.current=frameElement
  const jobs=queued;queued=[];jobs.forEach(fn=>fn())
  return tree
}
const canvas=()=>get(node=>node.props?.["aria-label"] === "Photo annotation canvas")
const items=()=>get(node=>node.type === MarkupLayer).props.items
const event=(x,y)=>({button:0,pointerId:1,clientX:x,clientY:y,stopPropagation(){}})
render()
get(node=>node.type === "img").props.onLoad({currentTarget:{naturalWidth:2000,naturalHeight:1000}});render()
const stage=()=>get(node=>node.props?.["data-photo-stage"] !== undefined)
const view=()=>{const [,tx,ty,scale]=stage().props.style.transform.match(/translate\(([^p]+)px, ([^p]+)px\) scale\(([^)]+)\)/);return {tx:Number(tx),ty:Number(ty),scale:Number(scale)}}
const frameWidth=()=>stage().props.style.width*view().scale
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,message ?? `${actual} differs from ${expected}`)
near(frameWidth(),1000,"Fill respects both viewport dimensions")
assert.match(get(node=>node.props?.["aria-label"] === "Photo editing viewport").props.className,/h-\[72vh\].*min-h-96/)
assert.match(get(node=>node.props?.["aria-label"] === "Photo editing viewport").props.className,/shrink-0/)
assert.doesNotMatch(get(node=>node.props?.["aria-label"] === "Photo editing viewport").props.className,/overscroll-contain/)
for(let i=0;i<3;i++){button("−").props.onClick();render()}
near(frameWidth(),1000/CANVAS_ZOOM_STEP**3)
for(let i=0;i<30 && !button("−").props.disabled;i++){button("−").props.onClick();render()}
near(view().scale,0.05);assert.equal(button("−").props.disabled,true,"Zoom out matches the blueprint 5 percent limit")
button("Fit").props.onClick();render();near(frameWidth(),952,"Fit uses the blueprint canvas padding")
get(node=>node.type === "img").props.onLoad({currentTarget:{naturalWidth:1000,naturalHeight:4000}});render()
near(frameWidth(),1000,"Fill removes empty side space for portrait photos without stretching them")
assert.equal(button("Fill").props["aria-pressed"],true)
button("Fit").props.onClick();render()
near(frameWidth(),119,"A tall portrait fits entirely with the same padding as a blueprint")
get(node=>node.type === "img").props.onLoad({currentTarget:{naturalWidth:4000,naturalHeight:1000}});render()
near(frameWidth(),2000,"A wide photo fills the canvas height; overflow remains pannable")
button("Fit").props.onClick();render();near(frameWidth(),976)
get(node=>node.type === "img").props.onLoad({currentTarget:{naturalWidth:1000,naturalHeight:1000}});render()
get(node=>node.props?.["aria-label"] === "Enter fullscreen photo editor").props.onClick();render()
viewportSize.width=1920;viewportSize.height=1000;resizeListeners.get("resize")();render()
near(frameWidth(),1920,"Default Fill adapts to fullscreen instead of leaving the photo as a small strip")
assert.match(get(node=>node.props?.["aria-label"] === "Photo editing viewport").props.className,/h-\[78dvh\].*min-h-96/)
assert.doesNotMatch(tree.props.children.props.className,/h-full/ ,"Fullscreen content can exceed the modal body and scroll vertically")
assert.ok(all(tree).some(node=>node.type === "details"),"Fullscreen caption is collapsed to leave more editing space")
assert.equal(get(node=>node.type === "details").props.open,undefined)
button("Fit").props.onClick();render();near(frameWidth(),976,"Fit remains available for a complete uncropped view")
tree.props.onEscape();render();viewportSize.width=1000;viewportSize.height=500;resizeListeners.get("resize")();render()
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
const beforeFullscreen=JSON.stringify(items())
button("−").props.onClick();render()
near(frameWidth(),1000/CANVAS_ZOOM_STEP)
const manualView=view()
get(node=>node.props?.["aria-label"] === "Enter fullscreen photo editor").props.onClick();render()
assert.equal(tree.props.fullscreen,true)
viewportSize.width=1920;viewportSize.height=1000;resizeListeners.get("resize")();render()
assert.deepEqual(view(),manualView,"Fullscreen preserves manually adjusted zoom and pan")
assert.ok(all(tree).some(node=>node.props?.role === "status" && label(node)==="38%"),"Zoom shows the actual photo scale, like the blueprint")
button("Fit").props.onClick();render();near(frameWidth(),1896,"Only explicit Fit adjusts a manually zoomed image to the larger viewport")
button("−").props.onClick();render();near(frameWidth(),1896/CANVAS_ZOOM_STEP)
const afterFitWidth=frameWidth()
assert.equal(JSON.stringify(items()),beforeFullscreen,"Fullscreen never modifies annotations")
tree.props.onEscape();render();assert.equal(tree.props.fullscreen,false);assert.equal(closed,0,"Escape exits fullscreen without closing or discarding the edit")
near(frameWidth(),afterFitWidth,"Leaving fullscreen also preserves the chosen image scale")
get(node=>node.props?.["aria-label"] === "Enter fullscreen photo editor").props.onClick();render()
get(node=>node.props?.["aria-label"] === "Exit fullscreen photo editor").props.onClick();render();assert.equal(tree.props.fullscreen,false)
viewportSize.width=1000;viewportSize.height=500;resizeListeners.get("resize")();render()
near(frameWidth(),afterFitWidth,"Resizing the viewport alone must not change a manually adjusted view")
button("Fit").props.onClick();render();near(frameWidth(),952)
for(let i=0;i<40 && !button("+").props.disabled;i++){button("+").props.onClick();render()}
assert.equal(button("+").props.disabled,true,"Zoom in matches the blueprint 1000 percent limit");near(view().scale,10)
button("Fit").props.onClick();render()
const viewport=()=>get(node=>node.props?.["aria-label"] === "Photo editing viewport")
const wheel=frameListeners.get("wheel")
const beforeWheel=view(),anchor={x:250,y:125}
let prevented=false
wheel({deltaY:100,clientX:anchor.x,clientY:anchor.y,preventDefault(){prevented=true}});render()
assert.equal(prevented,false,"Plain wheel is left to normal downward editor scrolling")
assert.deepEqual(view(),beforeWheel,"Scrolling down must not accidentally zoom the image")
wheel({ctrlKey:true,deltaY:-100,clientX:anchor.x,clientY:anchor.y,preventDefault(){prevented=true}});render()
assert.ok(prevented,"Explicit Ctrl+wheel zoom prevents browser/page scrolling")
near((anchor.x-beforeWheel.tx)/beforeWheel.scale,(anchor.x-view().tx)/view().scale,"Wheel zoom keeps the cursor on the same photo coordinate")
near((anchor.y-beforeWheel.ty)/beforeWheel.scale,(anchor.y-view().ty)/view().scale)
const navigationEvent=(id,x,y,buttonValue=0)=>({pointerId:id,button:buttonValue,clientX:x,clientY:y,currentTarget:frameElement,target:{closest:selector=>selector.includes("Photo annotation canvas") ? {} : null},preventDefault(){},stopPropagation(){}})
button("Select").props.onClick();render()
const beforePan=view()
viewport().props.onPointerDownCapture(navigationEvent(1,100,100));render()
viewport().props.onPointerMoveCapture(navigationEvent(1,170,140));render()
near(view().tx,beforePan.tx+70);near(view().ty,beforePan.ty+40)
viewport().props.onPointerUpCapture(navigationEvent(1,170,140));render()
assert.equal(items().length,6,"Panning never creates or moves annotations")
button("Pan").props.onClick();render();assert.equal(button("Pan").props["aria-pressed"],true)
button("Line").props.onClick();render();assert.equal(button("Pan").props["aria-pressed"],false)
const beforePinchItems=JSON.stringify(items())
viewport().props.onPointerDownCapture(navigationEvent(1,100,100));canvas().props.onPointerDown(event(100,100));render()
assert.equal(items().length,7,"First touch can begin a drawing")
viewport().props.onPointerDownCapture(navigationEvent(2,200,100));render()
assert.equal(JSON.stringify(items()),beforePinchItems,"A second finger cancels the unfinished stroke before pinch zoom")
const beforePinch=view()
viewport().props.onPointerMoveCapture(navigationEvent(2,300,100));render()
const expectedPinch=pinchCanvasView(beforePinch,2,{x:150,y:100},{x:200,y:100})
near(view().scale,expectedPinch.scale);near(view().tx,expectedPinch.tx);near(view().ty,expectedPinch.ty)
viewport().props.onPointerUpCapture(navigationEvent(2,300,100));render()
viewport().props.onPointerUpCapture(navigationEvent(1,100,100));render()
viewport().props.onKeyDown({key:" ",preventDefault(){}});render()
const beforeSpacePan=view()
viewport().props.onPointerDownCapture(navigationEvent(1,100,100));render()
viewport().props.onPointerMoveCapture(navigationEvent(1,125,110));render()
near(view().tx,beforeSpacePan.tx+25)
viewport().props.onPointerUpCapture(navigationEvent(1,125,110));render()
resizeListeners.get("keyup")({key:" "});render()
const beforeMiddle=view()
viewport().props.onPointerDownCapture(navigationEvent(1,100,100,1));render()
viewport().props.onPointerMoveCapture(navigationEvent(1,110,120,1));render()
near(view().ty,beforeMiddle.ty+20)
resizeListeners.get("blur")();render()
assert.equal(captured.size,0,"Blur releases navigation pointers instead of leaving zoom stuck")
viewport().props.onKeyDown({key:"0",preventDefault(){}});render()
assert.deepEqual(view(),fitCanvasView({width:2000,height:1000},viewportSize),"0 fits exactly like the sheet editor")
assert.equal(JSON.stringify(items()),beforePinchItems)
const zoomRoundTrip=zoomCanvasView(zoomCanvasView(view(),CANVAS_ZOOM_STEP,anchor),1/CANVAS_ZOOM_STEP,anchor)
near(zoomRoundTrip.scale,view().scale);near(zoomRoundTrip.tx,view().tx);near(zoomRoundTrip.ty,view().ty)
button("Select").props.onClick();render()
get(node=>node.type === MarkupLayer).props.onSelect(items()[items().length-1].id,event(100,100));render()
canvas().props.onPointerUp(event(100,100));render()
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
console.log("Photo editor blueprint-parity wheel/cursor zoom, button scale/limits, drag/Space/middle/pinch pan, touch drawing cancellation, Fit/Fill/fullscreen, markup preservation and save passed")

// Verify fullscreen sizing and the topmost dialog's Escape override in the actual shared Modal.
for(const value of values)value?.cleanup?.();values=[];queued=[]
const portalModule=dataModule("export const createPortal=node=>node;")
let modalCompiled=ts.transpileModule(readFileSync(new URL("../src/components/Modal.tsx",import.meta.url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
for(const [path,replacement] of [["react",hookModule],["react-dom",portalModule],["react/jsx-runtime",import.meta.resolve("react/jsx-runtime")]])modalCompiled=modalCompiled.replace(`from "${path}"`,`from ${JSON.stringify(replacement)}`)
const {default:ActualModal}=await import(dataModule(modalCompiled))
let keyboard,escaped=0,modalClosed=0,restored=0
const fakePanel={querySelectorAll:()=>[],querySelector:()=>null,focus(){}}
globalThis.document={activeElement:{focus(){restored++}},body:{style:{overflow:"auto"}},querySelectorAll:()=>[fakePanel],addEventListener:(_name,fn)=>{keyboard=fn},removeEventListener(){}}
const renderModal=props=>{cursor=0;tree=ActualModal(props);get(node=>node.props?.role === "dialog").props.ref.current=fakePanel;const jobs=queued;queued=[];jobs.forEach(fn=>fn())}
const modalProps={title:"Photo",children:"Canvas",fullscreen:true,onClose:()=>modalClosed++,onEscape:()=>escaped++}
renderModal(modalProps)
assert.match(get(node=>node.props?.role === "dialog").props.className,/h-\[100dvh\].*max-w-none/)
keyboard({key:"Escape",stopPropagation(){},preventDefault(){}});assert.equal(escaped,1);assert.equal(modalClosed,0)
renderModal({...modalProps,fullscreen:false,onEscape:undefined})
assert.match(get(node=>node.props?.role === "dialog").props.className,/max-w-lg/)
keyboard({key:"Escape",stopPropagation(){},preventDefault(){}});assert.equal(modalClosed,1,"Normal modal Escape retains its original close action")
for(const value of values)value?.cleanup?.();values=[];queued=[]
assert.equal(document.body.style.overflow,"auto");assert.equal(restored,1)
console.log("Shared modal fullscreen/default sizing, current Escape handler, scroll lock and focus restoration passed")

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

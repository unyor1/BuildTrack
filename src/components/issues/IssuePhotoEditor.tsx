import { useEffect, useId, useRef, useState, type PointerEvent } from "react"
import Modal from "../Modal"
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import { clampCoordinate, MARKUP_LIMIT, MARKUP_POINT_LIMIT, markupProblem, markupTools, moveMarkup, type IssueMarkup, type MarkupPoint, type MarkupTool } from "../../lib/issueMarkup"
import { CANVAS_ZOOM_STEP, MIN_CANVAS_SCALE, MAX_CANVAS_SCALE, canvasWheelFactor, fitCanvasView, zoomCanvasView, pinchCanvasView, type CanvasPoint, type CanvasView } from "../../lib/canvasView"

export function MarkupLayer({ items, height, selected, onSelect }: { items: IssueMarkup[]; height: number; selected?: string; onSelect?: (id: string, event: PointerEvent<SVGGElement>) => void }) {
  const arrowId = useId().replace(/:/g, "")
  return <>
    <defs>{items.filter(item => item.kind === "arrow").map(item => <marker key={item.id} id={`${arrowId}-${item.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={item.color} /></marker>)}</defs>
    {items.map(item => {
      const x = item.x * 10, y = item.y * height / 100, x2 = item.x2 * 10, y2 = item.y2 * height / 100
      const shape = item.kind === "text" ? <text x={x} y={y} fill={item.color} stroke="none" fontSize={item.fontSize} fontFamily="Arial, sans-serif" dominantBaseline="hanging">{item.text.split("\n").map((line, i) => <tspan key={i} x={x} dy={i ? "1.2em" : 0}>{line}</tspan>)}</text>
        : item.kind === "rectangle" ? <rect x={Math.min(x,x2)} y={Math.min(y,y2)} width={Math.abs(x2-x)} height={Math.abs(y2-y)} />
        : item.kind === "ellipse" ? <ellipse cx={(x+x2)/2} cy={(y+y2)/2} rx={Math.abs(x2-x)/2} ry={Math.abs(y2-y)/2} />
        : item.kind === "draw" ? <polyline points={item.points.map(p => `${p.x*10},${p.y*height/100}`).join(" ")} />
        : <line x1={x} y1={y} x2={x2} y2={y2} markerEnd={item.kind === "arrow" ? `url(#${arrowId}-${item.id})` : undefined} />
      return <g key={item.id} data-markup-id={item.id} fill="none" stroke={item.color} strokeWidth={item.stroke} strokeLinecap="round" strokeLinejoin="round" style={{ cursor: onSelect ? "move" : undefined, filter: selected === item.id ? "drop-shadow(0 0 4px white)" : undefined }} onPointerDown={event => onSelect?.(item.id,event)}>{shape}</g>
    })}
  </>
}

// Markup is a separate editable overlay; the underlying photo bytes are never changed. `title` / `captionLimit` let other
// evidence (QA inspections and NCRs, caption max 200) reuse the same editor.
export default function IssuePhotoEditor({ src, initial, caption, readOnly = false, title, captionLimit = 500, onClose, onSave }: {
  src: string; initial: IssueMarkup[]; caption: string; readOnly?: boolean; title?: string; captionLimit?: number; onClose: () => void
  onSave?: (items: IssueMarkup[], caption: string) => Promise<void> | void
}) {
  const [items,setItems] = useState(initial)
  const [past,setPast] = useState<IssueMarkup[][]>([])
  const [future,setFuture] = useState<IssueMarkup[][]>([])
  const [tool,setTool] = useState<MarkupTool>("select")
  const [selected,setSelected] = useState("")
  const [color,setColor] = useState("#d93a3a")
  const [stroke,setStroke] = useState(4)
  const [fontSize,setFontSize] = useState(30)
  const [text,setText] = useState("")
  const [note,setNote] = useState(caption)
  const [imageSize,setImageSize] = useState({width:1000,height:750})
  const height = 1000*imageSize.height/imageSize.width
  const [original,setOriginal] = useState(false)
  const [error,setError] = useState("")
  const [saving,setSaving] = useState(false)
  const [loaded,setLoaded] = useState(false)
  const [fullscreen,setFullscreen] = useState(false)
  const [view,setView] = useState<CanvasView>({scale:1,tx:0,ty:0})
  const [sizing,setSizing] = useState<"fill" | "fit" | "manual">("fill")
  const [panMode,setPanMode] = useState(false)
  const [space,setSpace] = useState(false)
  const [panning,setPanning] = useState(false)
  const viewRef = useRef(view)
  const sizeRef = useRef(imageSize)
  const sizingRef = useRef(sizing)
  viewRef.current = view; sizeRef.current = imageSize; sizingRef.current = sizing
  const pointers = useRef(new Map<number,CanvasPoint>())
  const pan = useRef<{id:number;start:CanvasPoint;view:CanvasView} | null>(null)
  const pinch = useRef<{distance:number;mid:CanvasPoint;view:CanvasView} | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const gesture = useRef<{ id: string; start: MarkupPoint; before: IssueMarkup[]; moving: boolean; pointerId: number } | null>(null)
  const commitView = (next: CanvasView) => { viewRef.current=next; setView(next) }
  const sizePhoto = (mode: "fill" | "fit", size = sizeRef.current) => {
    const frame=viewportRef.current
    sizingRef.current=mode;setSizing(mode)
    if(frame && frame.clientWidth>=40 && frame.clientHeight>=40) commitView(fitCanvasView(size,{width:frame.clientWidth,height:frame.clientHeight},mode))
  }
  const zoomAt = (factor: number, anchor?: CanvasPoint) => {
    const frame=viewportRef.current
    if(!frame || gesture.current || pointers.current.size) return
    sizingRef.current="manual";setSizing("manual")
    commitView(zoomCanvasView(viewRef.current,factor,anchor ?? {x:frame.clientWidth/2,y:frame.clientHeight/2}))
  }
  const controls = useRef({zoomAt,sizePhoto})
  controls.current={zoomAt,sizePhoto}
  useEffect(() => {
    const frame = viewportRef.current
    if (!frame) return
    const measure = () => {
      if(sizingRef.current !== "manual") controls.current.sizePhoto(sizingRef.current)
    }
    measure()
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    observer?.observe(frame)
    window.addEventListener("resize",measure)
    return () => { observer?.disconnect(); window.removeEventListener("resize",measure) }
  }, [fullscreen])
  useEffect(() => {
    const frame=viewportRef.current
    if(!frame) return
    const wheel=(event:WheelEvent)=>{
      // Ordinary wheel scrolling belongs to the taller editor/modal content.
      // Explicit Ctrl/Command+wheel still zooms toward the pointer.
      if(!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect=frame.getBoundingClientRect()
      controls.current.zoomAt(canvasWheelFactor(event.deltaY),{x:event.clientX-rect.left,y:event.clientY-rect.top})
    }
    const releaseSpace=(event:KeyboardEvent)=>{if(event.key===" ")setSpace(false)}
    const blur=()=>{
      setSpace(false);cancelEdit()
      for(const id of pointers.current.keys()) if(frame.hasPointerCapture(id)) frame.releasePointerCapture(id)
      pointers.current.clear();pan.current=null;pinch.current=null;setPanning(false)
    }
    frame.addEventListener("wheel",wheel,{passive:false})
    window.addEventListener("keyup",releaseSpace)
    window.addEventListener("blur",blur)
    return()=>{frame.removeEventListener("wheel",wheel);window.removeEventListener("keyup",releaseSpace);window.removeEventListener("blur",blur)}
  }, [])
  const cancelEdit = () => {
    const active=gesture.current
    if(!active) return
    gesture.current=null;setItems(active.before)
    if(svg.current?.hasPointerCapture(active.pointerId)) svg.current.releasePointerCapture(active.pointerId)
  }
  const viewportPoint = (point: CanvasPoint) => {
    const rect=viewportRef.current!.getBoundingClientRect()
    return {x:point.x-rect.left,y:point.y-rect.top}
  }
  const downView = (event: PointerEvent<HTMLDivElement>) => {
    if(event.button!==0 && event.button!==1) return
    event.currentTarget.focus({preventScroll:true})
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    if(pointers.current.size===2) {
      cancelEdit();pan.current=null
      const [a,b]=[...pointers.current.values()]
      pinch.current={distance:Math.hypot(a.x-b.x,a.y-b.y)||1,mid:viewportPoint({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),view:viewRef.current}
      for(const id of pointers.current.keys()) event.currentTarget.setPointerCapture(id)
      setPanning(true);event.preventDefault();event.stopPropagation();return
    }
    if(pointers.current.size!==1) {event.stopPropagation();return}
    const target=event.target as Element
    const annotation=target.closest?.("[data-markup-id]")
    const onPhoto=target.closest?.('[aria-label="Photo annotation canvas"]')
    if(event.button===1 || space || panMode || readOnly || original || (tool==="select" && !annotation) || !onPhoto) {
      if(tool==="select" && !annotation) setSelected("")
      pan.current={id:event.pointerId,start:{x:event.clientX,y:event.clientY},view:viewRef.current}
      event.currentTarget.setPointerCapture(event.pointerId)
      setPanning(true);event.preventDefault();event.stopPropagation()
    }
  }
  const moveView = (event: PointerEvent<HTMLDivElement>) => {
    if(!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY})
    if(pinch.current && pointers.current.size>=2) {
      const [a,b]=[...pointers.current.values()],initial=pinch.current
      sizingRef.current="manual";setSizing("manual")
      commitView(pinchCanvasView(initial.view,Math.hypot(a.x-b.x,a.y-b.y)/initial.distance,initial.mid,viewportPoint({x:(a.x+b.x)/2,y:(a.y+b.y)/2})))
      event.preventDefault();event.stopPropagation()
    } else if(pan.current?.id===event.pointerId) {
      const initial=pan.current
      sizingRef.current="manual";setSizing("manual")
      commitView({...initial.view,tx:initial.view.tx+event.clientX-initial.start.x,ty:initial.view.ty+event.clientY-initial.start.y})
      event.preventDefault();event.stopPropagation()
    }
  }
  const endView = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if(!pinch.current && !pan.current) return
    pinch.current=null;pan.current=null
    if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if(pointers.current.size===1) {
      const [id,start]=[...pointers.current.entries()][0]
      pan.current={id,start,view:viewRef.current}
    }
    setPanning(pointers.current.size>0);event.preventDefault();event.stopPropagation()
  }
  const exitFullscreen = () => {
    cancelEdit()
    const frame=viewportRef.current
    for(const id of pointers.current.keys()) if(frame?.hasPointerCapture(id)) frame.releasePointerCapture(id)
    pointers.current.clear();pan.current=null;pinch.current=null;setPanning(false);setSpace(false)
    setFullscreen(false)
  }
  const remember = (before: IssueMarkup[]) => { setPast(rows => [...rows.slice(-29),before]); setFuture([]) }
  const point = (event: PointerEvent): MarkupPoint => {
    const rect = svg.current!.getBoundingClientRect()
    return { x: clampCoordinate((event.clientX-rect.left)/rect.width*100), y: clampCoordinate((event.clientY-rect.top)/rect.height*100) }
  }
  const start = (event: PointerEvent<SVGSVGElement>) => {
    if (readOnly || original || !loaded || saving || event.button !== 0 || gesture.current) return
    if (tool === "select") { setSelected(""); return }
    if (items.length >= MARKUP_LIMIT) return setError(`Limit: ${MARKUP_LIMIT} annotations per photo.`)
    if (tool === "text" && !text.trim()) return setError("Enter text in the toolbar, then click the photo.")
    const p=point(event), id=crypto.randomUUID()
    const item: IssueMarkup = { id,kind:tool,x:p.x,y:p.y,x2:p.x,y2:p.y,color,stroke,fontSize,text:tool === "text" ? text.trim() : "",points:tool === "draw" ? [p] : [] }
    setError(""); setSelected(id)
    if (tool === "text") { remember(items); setItems([...items,item]); return }
    gesture.current = { id,start:p,before:items,moving:false,pointerId:event.pointerId }
    svg.current?.setPointerCapture(event.pointerId)
    setItems([...items,item])
  }
  const select = (id: string,event: PointerEvent<SVGGElement>) => {
    if (readOnly || original || saving || tool !== "select" || event.button !== 0) return
    event.stopPropagation()
    setSelected(id)
    gesture.current={id,start:point(event),before:items,moving:true,pointerId:event.pointerId}
    svg.current?.setPointerCapture(event.pointerId)
    const row=items.find(item=>item.id===id)!
    setColor(row.color);setStroke(row.stroke);setFontSize(row.fontSize);setText(row.text)
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const g=gesture.current; if(!g || g.pointerId!==event.pointerId) return
    const p=point(event)
    if(g.moving) setItems(g.before.map(item=>item.id===g.id ? moveMarkup(item,p.x-g.start.x,p.y-g.start.y) : item))
    else setItems(rows=>rows.map(item=>item.id!==g.id ? item : { ...item,x2:p.x,y2:p.y,points:item.kind === "draw" ? [...item.points.slice(0,MARKUP_POINT_LIMIT-1),p] : [] }))
  }
  const end = (event: PointerEvent<SVGSVGElement>,cancel=false) => {
    const g=gesture.current;if(!g || g.pointerId!==event.pointerId) return
    gesture.current=null
    if(cancel) setItems(g.before)
    else {
      const valid=items.filter(item=>item.id!==g.id || g.moving || (item.kind === "draw" ? item.points.length>=2 : Math.abs(item.x2-item.x)+Math.abs(item.y2-item.y)>0.2))
      setItems(valid);if(JSON.stringify(valid)!==JSON.stringify(g.before)) remember(g.before)
    }
    if(svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId)
  }
  const updateSelected = () => {
    if(!selected) return
    const row=items.find(item=>item.id===selected)
    if(row?.kind === "text" && !text.trim()) return setError("Text cannot be empty.")
    remember(items);setItems(items.map(item=>item.id===selected ? { ...item,color,stroke,fontSize,text:item.kind === "text" ? text.trim() : item.text } : item))
  }
  const close = () => {
    if(saving) return
    if(!readOnly && (JSON.stringify(items)!==JSON.stringify(initial) || note!==caption) && !window.confirm("Discard unsaved photo markup?")) return
    onClose()
  }
  const save = async () => {
    const why=markupProblem(items);if(why) return setError(why)
    setSaving(true);setError("")
    try { await onSave?.(items,note);onClose() } catch(e) {setError((e as Error).message)} finally {setSaving(false)}
  }
  return <Modal title={title ?? (readOnly ? "Issue photo and details" : "Annotate issue photo")} description="Original photo preserved. Text, lines, arrows, shapes and drawings are saved separately." size="2xl" fullscreen={fullscreen} onEscape={fullscreen ? exitFullscreen : undefined} onClose={close} footer={<><button type="button" className={buttonSecondary} disabled={saving} onClick={close}>Close</button>{!readOnly ? <button type="button" className={buttonPrimary} disabled={saving || !loaded || Boolean(gesture.current)} onClick={()=>void save()}>{saving ? "Saving..." : "Save photo markup"}</button> : null}</>}>
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {!readOnly ? markupTools.map(value=><button key={value} type="button" aria-pressed={tool===value && !panMode} disabled={saving || original || panning} className={`${buttonSecondary} !px-3 !py-1.5 ${tool===value && !panMode ? "!border-brand !text-brand-text" : ""}`} onClick={()=>{setTool(value);setPanMode(false);setSelected("")}}>{value === "draw" ? "Freehand" : value[0].toUpperCase()+value.slice(1)}</button>) : null}
        <button type="button" className={buttonSecondary} aria-pressed={panMode} onClick={()=>setPanMode(value=>!value)} disabled={Boolean(gesture.current) || panning} title="Drag to pan; Space-drag and middle mouse also pan">Pan</button>
        <button type="button" className={buttonSecondary} aria-pressed={original} onClick={()=>setOriginal(!original)}>{original ? "Show markup" : "View original"}</button>
        <button type="button" className={buttonSecondary} aria-label="Zoom out photo" title="Zoom out (-)" disabled={view.scale<=MIN_CANVAS_SCALE || Boolean(gesture.current) || panning} onClick={()=>zoomAt(1/CANVAS_ZOOM_STEP)}>−</button><span className="w-12 text-center text-xs font-bold tabular-nums" role="status" aria-live="polite">{Math.round(view.scale*100)}%</span><button type="button" className={buttonSecondary} aria-label="Zoom in photo" title="Zoom in (+)" disabled={view.scale>=MAX_CANVAS_SCALE || Boolean(gesture.current) || panning} onClick={()=>zoomAt(CANVAS_ZOOM_STEP)}>+</button><button type="button" className={buttonSecondary} aria-pressed={sizing === "fill"} title="Fill the canvas" disabled={Boolean(gesture.current) || panning} onClick={()=>sizePhoto("fill")}>Fill</button><button type="button" className={buttonSecondary} aria-pressed={sizing === "fit"} title="Fit the whole photo (0)" disabled={Boolean(gesture.current) || panning} onClick={()=>sizePhoto("fit")}>Fit</button>
        <button type="button" className={buttonSecondary + " !px-3"} aria-label={fullscreen ? "Exit fullscreen photo editor" : "Enter fullscreen photo editor"} title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen photo editor"} aria-pressed={fullscreen} disabled={Boolean(gesture.current)} onClick={()=>fullscreen ? exitFullscreen() : setFullscreen(true)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{fullscreen ? <path d="M8 3v5H3m13-5v5h5M8 21v-5H3m13 5v-5h5" /> : <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />}</svg></button>
      </div>
      {!readOnly ? <fieldset disabled={saving || original} className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg bg-surface-muted p-3 text-xs">
        <label>Color <input aria-label="Annotation color" type="color" value={color} onChange={e=>setColor(e.target.value)} /></label>
        <label>Line width <input aria-label="Annotation line width" type="range" min={1} max={12} value={stroke} onChange={e=>setStroke(Number(e.target.value))} /></label>
        <label>Text size <select value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}>{[12,18,24,30,36,48,60,72].map(n=><option key={n}>{n}</option>)}</select></label>
        <input aria-label="Annotation text" className={`${inputClass} !w-64 !py-1`} maxLength={300} placeholder="Text to place on photo" value={text} onChange={e=>setText(e.target.value)} />
        <button type="button" className={buttonSecondary} disabled={!selected} onClick={updateSelected}>Apply to selected</button>
        <button type="button" className={buttonSecondary} disabled={!selected} onClick={()=>{remember(items);setItems(items.filter(item=>item.id!==selected));setSelected("")}}>Delete selected</button>
        <button type="button" className={buttonSecondary} disabled={!past.length} onClick={()=>{setFuture([items,...future]);setItems(past[past.length-1]);setPast(past.slice(0,-1));setSelected("")}}>Undo</button>
        <button type="button" className={buttonSecondary} disabled={!future.length} onClick={()=>{setPast([...past,items]);setItems(future[0]);setFuture(future.slice(1));setSelected("")}}>Redo</button>
      </fieldset> : null}
      <p className="text-xs text-fg-muted">{readOnly ? note || "No caption." : "Scroll down to move through the editor. Ctrl/⌘ + scroll zooms toward the cursor. Select-drag, Pan or Space-drag moves the photo. Pinch with two fingers. Fit shows the whole photo."}</p>
      {error ? <p role="alert" className="text-sm text-danger-fg">{error}</p> : null}
      <div ref={viewportRef} tabIndex={0} aria-label="Photo editing viewport" style={{touchAction:"none"}} className={`relative min-w-0 shrink-0 overflow-hidden rounded-xl border border-line bg-black/80 outline-none focus-visible:ring-2 focus-visible:ring-brand ${panning ? "cursor-grabbing" : space || panMode || tool==="select" || readOnly || original ? "cursor-grab" : "cursor-crosshair"} ${fullscreen ? "h-[78dvh] min-h-96" : "h-[72vh] min-h-96"}`} onPointerDownCapture={downView} onPointerMoveCapture={moveView} onPointerUpCapture={endView} onPointerCancelCapture={endView} onKeyDown={event=>{if(event.key===" "){event.preventDefault();setSpace(true)}else if(event.key==="+" || event.key==="="){event.preventDefault();zoomAt(CANVAS_ZOOM_STEP)}else if(event.key==="-"){event.preventDefault();zoomAt(1/CANVAS_ZOOM_STEP)}else if(event.key==="0" && !gesture.current && !panning){event.preventDefault();sizePhoto("fit")}}}>
        <div data-photo-stage className="absolute left-0 top-0 origin-top-left" style={{width:imageSize.width,height:imageSize.height,transform:`translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`}}>
          <img src={src} alt={note || "Issue evidence"} className="pointer-events-none block h-full w-full select-none" draggable={false} onLoad={e=>{const size={width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight};sizeRef.current=size;setImageSize(size);sizePhoto("fill",size);setLoaded(true)}} onError={()=>{setLoaded(false);setError("Photo could not be loaded.")}} />
          <svg ref={svg} viewBox={`0 0 1000 ${height}`} className="absolute inset-0 h-full w-full" style={{touchAction:readOnly || original ? "auto" : "none"}} onPointerDown={start} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} aria-label="Photo annotation canvas">
            {!original ? <MarkupLayer items={items} height={height} selected={selected} onSelect={readOnly ? undefined : select} /> : null}
          </svg>
        </div>
      </div>
      {!readOnly ? fullscreen ? <details className="shrink-0 rounded-lg border border-line px-3 py-2"><summary className="cursor-pointer text-sm font-bold">Photo caption <span className="ml-2 font-normal text-fg-muted">Edit details</span></summary><label className="mt-2 block text-sm font-bold">Photo caption<textarea className={`${inputClass} mt-1`} rows={2} maxLength={captionLimit} disabled={saving} value={note} onChange={e=>setNote(e.target.value)} /></label></details> : <label className="block shrink-0 text-sm font-bold">Photo caption<textarea className={`${inputClass} mt-1`} rows={2} maxLength={captionLimit} disabled={saving} value={note} onChange={e=>setNote(e.target.value)} /></label> : null}
    </div>
  </Modal>
}

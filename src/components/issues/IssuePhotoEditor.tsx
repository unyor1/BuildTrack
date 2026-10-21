import { useId, useRef, useState, type PointerEvent } from "react"
import Modal from "../Modal"
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import { clampCoordinate, MARKUP_LIMIT, MARKUP_POINT_LIMIT, markupProblem, markupTools, moveMarkup, type IssueMarkup, type MarkupPoint, type MarkupTool } from "../../lib/issueMarkup"

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

// Markup is a separate editable overlay; the underlying photo bytes are never changed.
export default function IssuePhotoEditor({ src, initial, caption, readOnly = false, onClose, onSave }: {
  src: string; initial: IssueMarkup[]; caption: string; readOnly?: boolean; onClose: () => void
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
  const [height,setHeight] = useState(750)
  const [zoom,setZoom] = useState(100)
  const [original,setOriginal] = useState(false)
  const [error,setError] = useState("")
  const [saving,setSaving] = useState(false)
  const [loaded,setLoaded] = useState(false)
  const svg = useRef<SVGSVGElement>(null)
  const gesture = useRef<{ id: string; start: MarkupPoint; before: IssueMarkup[]; moving: boolean; pointerId: number } | null>(null)
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
  return <Modal title={readOnly ? "Issue photo and details" : "Annotate issue photo"} description="Original photo preserved. Text, lines, arrows, shapes and drawings are saved separately." size="2xl" onClose={close} footer={<><button type="button" className={buttonSecondary} disabled={saving} onClick={close}>Close</button>{!readOnly ? <button type="button" className={buttonPrimary} disabled={saving || !loaded || Boolean(gesture.current)} onClick={()=>void save()}>{saving ? "Saving..." : "Save photo markup"}</button> : null}</>}>
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!readOnly ? markupTools.map(value=><button key={value} type="button" aria-pressed={tool===value} disabled={saving || original} className={`${buttonSecondary} !px-3 !py-1.5 ${tool===value ? "!border-brand !text-brand-text" : ""}`} onClick={()=>{setTool(value);setSelected("")}}>{value === "draw" ? "Freehand" : value[0].toUpperCase()+value.slice(1)}</button>) : null}
        <button type="button" className={buttonSecondary} aria-pressed={original} onClick={()=>setOriginal(!original)}>{original ? "Show markup" : "View original"}</button>
        <button type="button" className={buttonSecondary} disabled={zoom<=100} onClick={()=>setZoom(Math.max(100,zoom-25))}>−</button><span className="text-xs font-bold">{zoom}%</span><button type="button" className={buttonSecondary} disabled={zoom>=300} onClick={()=>setZoom(Math.min(300,zoom+25))}>+</button><button type="button" className={buttonSecondary} onClick={()=>setZoom(100)}>Fit</button>
      </div>
      {!readOnly ? <fieldset disabled={saving || original} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface-muted p-3 text-xs">
        <label>Color <input aria-label="Annotation color" type="color" value={color} onChange={e=>setColor(e.target.value)} /></label>
        <label>Line width <input aria-label="Annotation line width" type="range" min={1} max={12} value={stroke} onChange={e=>setStroke(Number(e.target.value))} /></label>
        <label>Text size <select value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}>{[12,18,24,30,36,48,60,72].map(n=><option key={n}>{n}</option>)}</select></label>
        <input aria-label="Annotation text" className={`${inputClass} !w-64 !py-1`} maxLength={300} placeholder="Text to place on photo" value={text} onChange={e=>setText(e.target.value)} />
        <button type="button" className={buttonSecondary} disabled={!selected} onClick={updateSelected}>Apply to selected</button>
        <button type="button" className={buttonSecondary} disabled={!selected} onClick={()=>{remember(items);setItems(items.filter(item=>item.id!==selected));setSelected("")}}>Delete selected</button>
        <button type="button" className={buttonSecondary} disabled={!past.length} onClick={()=>{setFuture([items,...future]);setItems(past[past.length-1]);setPast(past.slice(0,-1));setSelected("")}}>Undo</button>
        <button type="button" className={buttonSecondary} disabled={!future.length} onClick={()=>{setPast([...past,items]);setItems(future[0]);setFuture(future.slice(1));setSelected("")}}>Redo</button>
      </fieldset> : null}
      <p className="text-xs text-fg-muted">{readOnly ? note || "No caption." : "Choose a drawing tool and drag. For text, type above then click the photo. Use Select to move an annotation. Zoom and scroll to inspect details."}</p>
      {error ? <p role="alert" className="text-sm text-danger-fg">{error}</p> : null}
      <div className="max-h-[58vh] overflow-auto rounded-xl border border-line bg-black/80">
        <div style={{width:`${zoom}%`}} className="relative">
          <img src={src} alt={note || "Issue evidence"} className="block w-full" draggable={false} onLoad={e=>{setHeight(1000*e.currentTarget.naturalHeight/e.currentTarget.naturalWidth);setLoaded(true)}} onError={()=>{setLoaded(false);setError("Photo could not be loaded.")}} />
          <svg ref={svg} viewBox={`0 0 1000 ${height}`} className="absolute inset-0 h-full w-full" style={{touchAction:readOnly || original ? "auto" : "none"}} onPointerDown={start} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)} aria-label="Photo annotation canvas">
            {!original ? <MarkupLayer items={items} height={height} selected={selected} onSelect={readOnly ? undefined : select} /> : null}
          </svg>
        </div>
      </div>
      {!readOnly ? <label className="block text-sm font-bold">Photo caption<textarea className={`${inputClass} mt-1`} rows={2} maxLength={500} disabled={saving} value={note} onChange={e=>setNote(e.target.value)} /></label> : null}
    </div>
  </Modal>
}

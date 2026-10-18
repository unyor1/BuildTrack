import { useId, useRef } from "react"
import { comparisonWasDragged } from "../lib/comparisonModel"

// The same overlay slider is used in the preview and enlarged comparison.
// A drag changes the divider; a click enlarges the entire comparison, never one side.
export default function ComparisonCanvas({ firstUrl, lastUrl, labels, split, onSplit, onEnlarge }: {
  firstUrl: string; lastUrl: string; labels: [string,string]; split: number;
  onSplit: (value: number) => void; onEnlarge?: () => void
}) {
  const id=useId()
  const gesture=useRef<{x:number;y:number;split:number;dragged:boolean} | null>(null)
  return <div className="relative aspect-[4/3] w-full select-none overflow-hidden">
    <img src={lastUrl} alt={labels[1]} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
    <img src={firstUrl} alt={labels[0]} className="absolute inset-0 h-full w-full object-cover" style={{clipPath:`inset(0 ${100-split}% 0 0)`}} draggable={false} />
    <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{left:`${split}%`}} aria-hidden="true">
      <span className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-extrabold text-[#1c1722] shadow-lg">⇆</span>
    </div>
    <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{labels[0]}</span>
    <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{labels[1]}</span>
    <label htmlFor={id} className="sr-only">Compare {labels[0]} and {labels[1]}</label>
    <input id={id} type="range" min={0} max={100} value={split} onChange={event=>onSplit(Number(event.target.value))}
      className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      onPointerDown={event=>{gesture.current={x:event.clientX,y:event.clientY,split,dragged:false}}}
      onPointerMove={event=>{const start=gesture.current;if(start && comparisonWasDragged(start,{x:event.clientX,y:event.clientY})) start.dragged=true}}
      onPointerCancel={()=>{gesture.current=null}}
      onPointerUp={event=>{
        const start=gesture.current;gesture.current=null
        if(start && onEnlarge && !start.dragged && !comparisonWasDragged(start,{x:event.clientX,y:event.clientY})) {
          onSplit(start.split);onEnlarge()
        }
      }} />
  </div>
}

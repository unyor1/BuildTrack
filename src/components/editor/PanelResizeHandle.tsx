import { useRef, type PointerEvent } from "react"
import { MIN_PANEL_WIDTH, panelWidth } from "../../lib/panelSize"

// Pointer capture keeps resizing reliable outside the narrow handle, including on touch screens.
// Keyboard arrows resize the same edge; Home / End select the available limits.
export default function PanelResizeHandle({ width, maximum, side = "left", onResize }: { width: number; maximum: number; side?: "left" | "right"; onResize: (width: number) => void }) {
  const drag = useRef<{ x: number; width: number; pointer: number } | null>(null)
  const direction = side === "left" ? -1 : 1
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointer !== event.pointerId) return
    drag.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <div role="separator" aria-label="Resize details panel" aria-orientation="vertical" aria-valuemin={Math.min(MIN_PANEL_WIDTH, maximum)} aria-valuemax={maximum} aria-valuenow={width} tabIndex={0}
    title="Drag to widen the panel. Arrow keys also resize it."
    className={`group absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none select-none outline-none hover:bg-brand/15 focus-visible:bg-brand/20 ${side === "left" ? "left-0" : "right-0"}`}
    onPointerDown={(event) => {
      if (event.button !== 0) return
      event.preventDefault(); event.stopPropagation()
      event.currentTarget.focus()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, width, pointer: event.pointerId }
    }}
    onPointerMove={(event) => {
      const start = drag.current
      if (start?.pointer === event.pointerId) onResize(panelWidth(start.width + (event.clientX - start.x) * direction, maximum))
    }}
    onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drag.current = null }}
    onKeyDown={(event) => {
      const delta = (event.shiftKey ? 64 : 24) * direction
      const next = event.key === "ArrowRight" ? width + delta : event.key === "ArrowLeft" ? width - delta : event.key === "Home" ? MIN_PANEL_WIDTH : event.key === "End" ? maximum : null
      if (next == null) return
      event.preventDefault(); event.stopPropagation(); onResize(panelWidth(next, maximum))
    }}>
    <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line group-hover:bg-brand group-focus-visible:bg-brand" />
  </div>
}

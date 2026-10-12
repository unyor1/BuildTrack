import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react"

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// A non-modal window that floats over the sheet: drag it by its title, collapse it, close it or dock it back.
// The position is remembered by the caller (`onMove` is called once when the drag ends).
export default function FloatingPanel({
  title,
  label,
  x,
  y,
  width,
  maxHeight = "70vh",
  collapsed = false,
  onToggleCollapsed,
  onMove,
  onClose,
  headerActions,
  children,
}: {
  title: string
  label: string
  x: number
  y: number
  width: number
  maxHeight?: string
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onMove: (x: number, y: number) => void
  onClose?: () => void
  headerActions?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => setPos({ x, y }), [x, y])

  // Keep it on screen when the window shrinks.
  useEffect(() => {
    const fit = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      setPos((current) => ({ x: clamp(current.x, 0, Math.max(0, window.innerWidth - Math.min(rect.width, 120))), y: clamp(current.y, 0, Math.max(0, window.innerHeight - 44)) }))
    }
    window.addEventListener("resize", fit)
    fit()
    return () => window.removeEventListener("resize", fit)
  }, [])

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button, a, input, select, textarea")) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { dx: event.clientX - pos.x, dy: event.clientY - pos.y }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const rect = ref.current?.getBoundingClientRect()
    setPos({ x: clamp(event.clientX - d.dx, 0, Math.max(0, window.innerWidth - (rect?.width ?? width))), y: clamp(event.clientY - d.dy, 0, Math.max(0, window.innerHeight - 44)) })
  }
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    onMove(pos.x, pos.y)
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className="bt-pop fixed z-[60] flex flex-col overflow-hidden rounded-2xl border border-line bg-surface/95 text-fg shadow-2xl backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y, width: Math.min(width, window.innerWidth - 16), maxHeight }}
    >
      <div
        className="flex flex-none cursor-grab touch-none select-none items-center gap-2 border-b border-line bg-surface-muted/70 px-3 py-2 active:cursor-grabbing"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={onToggleCollapsed}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-none text-fg-muted" aria-hidden="true">
          <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
        </svg>
        <p className="min-w-0 flex-1 truncate text-xs font-extrabold uppercase tracking-wider">{title}</p>
        {headerActions}
        {onToggleCollapsed ? (
          <button type="button" onClick={onToggleCollapsed} aria-expanded={!collapsed} aria-label={collapsed ? "Expand" : "Collapse"} title={collapsed ? "Expand" : "Collapse"} className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M6 15l6-6 6 6" />}</svg>
          </button>
        ) : null}
        {onClose ? (
          <button type="button" onClick={onClose} aria-label={`Close ${title}`} title="Close" className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        ) : null}
      </div>
      {collapsed ? null : <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>}
    </div>
  )
}

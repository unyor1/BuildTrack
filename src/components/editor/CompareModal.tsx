import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import Modal from "../Modal"
import { useSignedUrl, type Revision } from "../../lib/blueprints"

type Mode = "slider" | "overlay" | "difference"
const MIN = 0.2
const MAX = 12
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const modes: Array<{ key: Mode; label: string; hint: string }> = [
  { key: "slider", label: "Slider", hint: "Drag the divider: older on the left, newer on the right" },
  { key: "overlay", label: "Overlay", hint: "Fade the newer revision over the older one" },
  { key: "difference", label: "Differences", hint: "Everything that is the same turns black; changes light up" },
]

// Two revisions of the same sheet, on top of each other. Both are stretched to the same frame, so revisions of the same
// sheet line up; scroll to zoom and drag to pan, in every mode.
export default function CompareModal({ revisions, initialNewer, onClose }: { revisions: Revision[]; initialNewer: string | null; onClose: () => void }) {
  const newest = revisions[0]
  const [rightId, setRightId] = useState(initialNewer ?? newest?.id ?? "")
  const [leftId, setLeftId] = useState(() => revisions.find((r) => r.id !== (initialNewer ?? newest?.id))?.id ?? "")
  const [mode, setMode] = useState<Mode>("slider")
  const [split, setSplit] = useState(50)
  const [fade, setFade] = useState(50)
  const left = revisions.find((r) => r.id === leftId) ?? null
  const right = revisions.find((r) => r.id === rightId) ?? null
  const leftUrl = useSignedUrl("blueprints", left?.preview_path ?? null)
  const rightUrl = useSignedUrl("blueprints", right?.preview_path ?? null)
  const frame = useRef<HTMLDivElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const handleDrag = useRef(false)

  const aspect = right ? right.preview_width / right.preview_height : 1.6
  const sameShape = left && right ? Math.abs(left.preview_width / left.preview_height - aspect) < 0.01 : true

  useEffect(() => setView({ scale: 1, x: 0, y: 0 }), [leftId, rightId])

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const cx = event.clientX - rect.left - rect.width / 2
      const cy = event.clientY - rect.top - rect.height / 2
      setView((current) => {
        const scale = clamp(current.scale * Math.exp(-event.deltaY * 0.0015), MIN, MAX)
        const ratio = scale / current.scale
        return { scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio }
      })
    }
    element.addEventListener("wheel", onWheel, { passive: false })
    return () => element.removeEventListener("wheel", onWheel)
  }, [])

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (handleDrag.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (handleDrag.current && wrapper.current) {
      const rect = wrapper.current.getBoundingClientRect()
      setSplit(clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100))
      return
    }
    const d = drag.current
    if (d) setView((current) => ({ ...current, x: d.vx + event.clientX - d.x, y: d.vy + event.clientY - d.y }))
  }
  const up = () => {
    drag.current = null
    handleDrag.current = false
  }

  const label = (r: Revision, index: number) => `Rev ${r.revision}${index === 0 ? " (latest)" : ""} • ${new Date(r.created_at).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}`
  const loading = !leftUrl.url || !rightUrl.url
  const failed = leftUrl.failed || rightUrl.failed

  const picker = (value: string, onChange: (id: string) => void, name: string) => (
    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
      {name}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-semibold normal-case tracking-normal text-fg">
        {revisions.map((r, index) => <option key={r.id} value={r.id}>{label(r, index)}</option>)}
      </select>
    </label>
  )

  return (
    <Modal title="Compare revisions" description={modes.find((m) => m.key === mode)?.hint} size="2xl" onClose={onClose} footer={<button type="button" onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover">Close</button>}>
      {revisions.length < 2 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-fg-muted">This sheet has only one revision. Upload a new revision to compare it with the previous one.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {picker(leftId, setLeftId, "Older")}
            {picker(rightId, setRightId, "Newer")}
            <div className="ml-auto flex gap-1 rounded-xl border border-line bg-surface-muted/60 p-1" role="radiogroup" aria-label="Comparison mode">
              {modes.map((m) => <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${mode === m.key ? "bg-brand text-white shadow" : "text-fg hover:bg-surface"}`}>{m.label}</button>)}
            </div>
          </div>
          {mode === "overlay" ? (
            <label className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-fg-muted">
              Older
              <input type="range" min={0} max={100} value={fade} onChange={(event) => setFade(Number(event.target.value))} className="w-64 accent-[#9e1f93]" aria-label="Fade between the revisions" />
              Newer
            </label>
          ) : null}
          {!sameShape ? <p className="rounded-lg bg-accent/20 px-3 py-1.5 text-xs font-semibold">These revisions have different page shapes. They are stretched to the same frame, so small shifts are expected.</p> : null}
          <div ref={frame} className="relative h-[58vh] w-full touch-none select-none overflow-hidden rounded-xl border border-line bg-[#2b2830]" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ cursor: drag.current ? "grabbing" : "grab" }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <div ref={wrapper} className="relative bg-white shadow-2xl isolate" style={{ aspectRatio: String(aspect), maxWidth: "100%", maxHeight: "100%", height: "100%", transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
                {leftUrl.url ? <img src={leftUrl.url} alt={`Older revision ${left?.revision ?? ""}`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" /> : null}
                {rightUrl.url ? (
                  <img
                    src={rightUrl.url}
                    alt={`Newer revision ${right?.revision ?? ""}`}
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    style={mode === "slider" ? { clipPath: `inset(0 0 0 ${split}%)` } : mode === "overlay" ? { opacity: fade / 100 } : { mixBlendMode: "difference" }}
                  />
                ) : null}
                {mode === "slider" ? (
                  <div className="absolute inset-y-0 z-10 w-0" style={{ left: `${split}%` }}>
                    <div className="absolute inset-y-0 -left-px w-0.5 bg-[#f18b00] shadow-[0_0_0_1px_rgba(255,255,255,0.8)]" />
                    <button
                      type="button"
                      aria-label="Drag to compare"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        event.currentTarget.setPointerCapture(event.pointerId)
                        handleDrag.current = true
                      }}
                      onPointerMove={(event) => {
                        if (handleDrag.current && wrapper.current) setSplit(clamp(((event.clientX - wrapper.current.getBoundingClientRect().left) / wrapper.current.getBoundingClientRect().width) * 100, 0, 100))
                      }}
                      onPointerUp={() => (handleDrag.current = false)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") setSplit((value) => clamp(value - 2, 0, 100))
                        if (event.key === "ArrowRight") setSplit((value) => clamp(value + 2, 0, 100))
                      }}
                      className="absolute top-1/2 flex h-9 w-9 transition-none -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-[#f18b00] text-black shadow-lg"
                      style={{ transform: `translate(-50%, -50%) scale(${1 / view.scale})` }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l-6 6 6 6M15 6l6 6-6 6" /></svg>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {loading && !failed ? <div role="status" aria-label="Loading the revisions" className="absolute inset-0 animate-pulse bg-white/10" /> : null}
            {failed ? <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white">One of the revision files could not be loaded.</div> : null}
            <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-[#211f20]/85 px-2.5 py-1 text-[11px] font-bold text-white">{left ? `Rev ${left.revision}` : ""}{mode === "slider" ? " | " : " + "}{right ? `Rev ${right.revision}` : ""}</div>
            <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-sm text-fg shadow-lg" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" className="h-8 w-8 rounded hover:bg-surface-muted" aria-label="Zoom out" onClick={() => setView((c) => ({ ...c, scale: clamp(c.scale / 1.3, MIN, MAX) }))}>-</button>
              <span className="w-12 text-center text-xs text-fg-muted">{Math.round(view.scale * 100)}%</span>
              <button type="button" className="h-8 w-8 rounded hover:bg-surface-muted" aria-label="Zoom in" onClick={() => setView((c) => ({ ...c, scale: clamp(c.scale * 1.3, MIN, MAX) }))}>+</button>
              <button type="button" className="h-8 rounded px-2 text-xs font-semibold hover:bg-surface-muted" onClick={() => setView({ scale: 1, x: 0, y: 0 })}>Fit</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

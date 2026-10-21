import { Icon } from "./EditorToolbar"
import { statusDot, statusLabels, type PinStatus } from "../../lib/blueprints"
import type { LayerVisibility } from "./Inspector"

const chip = "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40"

// Controls for presentation mode: a slim pill at the bottom. Arrow keys also change sheets; Esc leaves.
export default function PresentationBar({
  title,
  index,
  total,
  onPrev,
  onNext,
  layers,
  onLayer,
  laser,
  onLaser,
  legend,
  onLegend,
  onFit,
  onExit,
}: {
  title: string
  index: number
  total: number
  onPrev: () => void
  onNext: () => void
  layers: LayerVisibility
  onLayer: (key: keyof LayerVisibility, value: boolean) => void
  laser: boolean
  onLaser: () => void
  legend: boolean
  onLegend: () => void
  onFit: () => void
  onExit: () => void
}) {
  const toggle = (key: keyof LayerVisibility, label: string) => (
    <button key={key} type="button" aria-pressed={layers[key]} onClick={() => onLayer(key, !layers[key])} className={`${chip} ${layers[key] ? "bg-white/20 text-white" : "text-white/55 hover:bg-white/10"}`}>{label}</button>
  )
  return (
    <>
      <div className="pointer-events-none absolute left-0 top-0 z-50 flex w-full items-start justify-between p-4">
        <div className="pointer-events-auto rounded-2xl bg-black/55 px-4 py-2 text-white shadow-xl backdrop-blur-md">
          <p className="max-w-[60vw] truncate text-base font-extrabold">{title}</p>
          <p className="text-xs text-white/70">Sheet {index + 1} of {total}</p>
        </div>
      </div>
      {legend ? (
        <div className="pointer-events-none absolute left-4 top-20 z-50 rounded-2xl bg-black/55 px-4 py-3 text-white shadow-xl backdrop-blur-md" aria-label="Status legend">
          <ul className="space-y-1.5 text-sm">
            {(Object.keys(statusLabels) as PinStatus[]).filter(status => status !== "for_review").map((status) => <li key={status} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: statusDot[status] }} />{statusLabels[status]}</li>)}
          </ul>
        </div>
      ) : null}
      <div className="absolute bottom-5 left-1/2 z-50 flex max-w-[96vw] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full bg-black/60 p-1.5 text-white shadow-2xl backdrop-blur-xl" role="toolbar" aria-label="Presentation controls">
        <button type="button" onClick={onPrev} disabled={index === 0} className={`${chip} hover:bg-white/10`} aria-label="Previous sheet"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>Prev</button>
        <button type="button" onClick={onNext} disabled={index >= total - 1} className={`${chip} hover:bg-white/10`} aria-label="Next sheet">Next<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
        <span className="mx-1 h-6 w-px bg-white/25" aria-hidden="true" />
        {toggle("pins", "Pins")}
        {toggle("drawings", "Drawings")}
        {toggle("notes", "Notes")}
        {toggle("shapes", "Shapes")}
        <span className="mx-1 h-6 w-px bg-white/25" aria-hidden="true" />
        <button type="button" aria-pressed={legend} onClick={onLegend} className={`${chip} ${legend ? "bg-white/20" : "text-white/55 hover:bg-white/10"}`}>Legend</button>
        <button type="button" aria-pressed={laser} onClick={onLaser} className={`${chip} ${laser ? "bg-red-500 text-white" : "hover:bg-white/10"}`} title="Laser pointer (follows your mouse)">Laser</button>
        <button type="button" onClick={onFit} className={`${chip} hover:bg-white/10`}>Fit</button>
        <button type="button" onClick={onExit} className={`${chip} bg-white text-black hover:bg-white/90`}><Icon name="close" size={14} />Exit</button>
      </div>
    </>
  )
}

import { useState, type KeyboardEvent } from "react"
import { MarkupLayer } from "./MarkupLayer"
import type { IssueMarkup } from "../../lib/issueMarkup"

export type Slide = { id: string; src: string; caption: string; items: IssueMarkup[]; changed: boolean }

function SlideThumb({ slide }: { slide: Slide }) {
  const [height, setHeight] = useState(750)
  return (
    <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-md border border-line bg-black/80">
      <img src={slide.src} alt="" draggable={false} className="h-full w-full object-contain" onLoad={(event) => setHeight((1000 * event.currentTarget.naturalHeight) / event.currentTarget.naturalWidth)} />
      <svg viewBox={`0 0 1000 ${height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><MarkupLayer items={slide.items} height={height} /></svg>
    </span>
  )
}

// The photos being edited, like the blueprint editor's sheet sidebar: numbered thumbnails with their live markup, the
// current one highlighted. A column beside the photo on wider screens, a scrolling row above it on phones.
export default function PhotoSlides({ slides, index, onSelect }: { slides: Slide[]; index: number; onSelect: (index: number) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    const next = Math.max(0, Math.min(slides.length - 1, index + delta))
    onSelect(next)
    event.currentTarget.querySelector<HTMLElement>(`[data-slide="${next}"]`)?.focus()
  }
  return (
    <nav aria-label="Photos" className="flex min-h-0 min-w-0 flex-none flex-col rounded-xl border border-line bg-surface md:w-40">
      <h3 className="px-2.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-fg-muted">Photos ({slides.length})</h3>
      <ul role="listbox" aria-label="Photos" onKeyDown={onKeyDown} className="flex min-h-0 gap-2 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
        {slides.map((slide, i) => {
          const selected = i === index
          return (
            <li key={slide.id} className="w-28 flex-none md:w-auto">
              <button type="button" role="option" aria-selected={selected} data-slide={i} tabIndex={selected ? 0 : -1} onClick={() => onSelect(i)} className={`block w-full rounded-lg p-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-brand ${selected ? "bg-brand-soft ring-2 ring-brand" : "hover:bg-surface-muted"}`}>
                <span className="flex gap-1.5">
                  <span className={`w-4 flex-none pt-0.5 text-right text-[11px] font-bold ${selected ? "text-brand-text" : "text-fg-muted"}`}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <SlideThumb slide={slide} />
                    <span className={`mt-1 block truncate text-[11px] font-bold ${selected ? "text-brand-text" : "text-fg"}`}>{slide.caption || `Image ${i + 1}`}</span>
                    <span className="block text-[11px] text-fg-muted">{slide.items.length} mark{slide.items.length === 1 ? "" : "s"}{slide.changed ? " · edited" : ""}</span>
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

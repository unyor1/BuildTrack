import { useEffect, useRef } from "react"
import { SheetThumb, type SheetCount } from "./SheetSorter"
import { Icon } from "./EditorToolbar"
import { Skeleton } from "../ui/Skeleton"
import { statusDot, type Blueprint } from "../../lib/blueprints"

// The pages bar under the sheet (like the page strip of a slide editor): one small thumbnail per sheet, left and right arrow keys to
// move, the current one kept in view. It can be shown together with the left strip or on its own.
export default function SheetFilmstrip({
  blueprints,
  selectedId,
  counts,
  loading,
  canEdit,
  onSelect,
  onAdd,
  onHide,
}: {
  blueprints: Blueprint[]
  selectedId: string | null
  counts: Map<string, SheetCount>
  loading: boolean
  canEdit: boolean
  onSelect: (id: string) => void
  onAdd: () => void
  onHide: () => void
}) {
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-page="${selectedId}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
  }, [selectedId])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
    event.preventDefault()
    const index = blueprints.findIndex((bp) => bp.id === selectedId)
    const next = blueprints[Math.min(blueprints.length - 1, Math.max(0, index + (event.key === "ArrowRight" ? 1 : -1)))]
    if (next) {
      onSelect(next.id)
      list.current?.querySelector<HTMLElement>(`[data-page="${next.id}"]`)?.focus()
    }
  }

  return (
    <nav aria-label="Pages" className="flex h-[7.75rem] flex-none items-stretch border-t border-line bg-surface">
      <div className="flex w-10 flex-none flex-col items-center justify-between border-r border-line py-2">
        <button type="button" onClick={onHide} aria-label="Hide the pages bar" title="Hide the pages bar" className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-muted transition hover:bg-surface-muted hover:text-fg"><Icon name="chevron" size={16} /></button>
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-fg-muted [writing-mode:vertical-rl]">Pages {blueprints.length}</span>
      </div>
      <ul ref={list} role="listbox" aria-label="Pages" aria-orientation="horizontal" onKeyDown={onKeyDown} className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto px-3 py-2">
        {loading ? (
          Array.from({ length: 4 }, (_, index) => (
            <li key={index} aria-hidden="true" className="w-36 flex-none"><Skeleton className="h-20 w-full" /></li>
          ))
        ) : blueprints.length === 0 ? (
          <li className="rounded-lg border border-dashed border-line px-4 py-3 text-xs text-fg-muted">{canEdit ? "No pages yet. Use + to upload the first sheet." : "No sheets uploaded yet."}</li>
        ) : (
          blueprints.map((bp, index) => {
            const selected = bp.id === selectedId
            const count = counts.get(bp.id) ?? { total: 0, issues: 0, verified: 0 }
            return (
              <li key={bp.id} className="w-36 flex-none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-page={bp.id}
                  onClick={() => onSelect(bp.id)}
                  title={`${bp.title}${bp.level ? ` (${bp.level})` : ""}`}
                  className={`group block w-full rounded-lg p-1 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-brand ${selected ? "bg-brand-soft ring-2 ring-brand" : "hover:bg-surface-muted"}`}
                >
                  <div className="relative">
                    <div className="h-[4.25rem] overflow-hidden rounded-md [&>div]:!aspect-auto [&>div]:h-full"><SheetThumb blueprint={bp} /></div>
                    <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[11px] font-extrabold ${selected ? "bg-brand text-white" : "bg-black/60 text-white"}`}>{index + 1}</span>
                    {count.issues ? <span className="absolute right-1 top-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white"><span className="h-2 w-2 rounded-full" style={{ background: statusDot.issue }} />{count.issues}</span> : null}
                  </div>
                  <p className={`mt-1 truncate text-[11px] font-bold ${selected ? "text-brand-text" : "text-fg"}`}>{bp.title}</p>
                </button>
              </li>
            )
          })
        )}
        {canEdit ? (
          <li className="flex-none">
            <button type="button" onClick={onAdd} aria-label="Add a page" title="Add a page" className="flex h-[4.25rem] w-24 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-fg-muted transition hover:border-brand hover:bg-brand-soft hover:text-brand-text">
              <span className="text-xl leading-none">+</span>
              <span className="text-[11px] font-bold">Add page</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}

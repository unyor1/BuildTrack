import { useRef } from "react"
import { Skeleton } from "../ui/Skeleton"
import { statusDot, useSignedUrl, type Blueprint } from "../../lib/blueprints"
import { disciplineLabels } from "../../lib/projects"

export type SheetCount = { total: number; issues: number; verified: number }

export function SheetThumb({ blueprint }: { blueprint: Blueprint }) {
  const revision = blueprint.blueprint_revisions[0]
  const { url, failed } = useSignedUrl("blueprints", revision ? (revision.thumb_path ?? revision.preview_path) : null)
  const ratio = revision ? revision.preview_height / revision.preview_width : 0.7
  return (
    <div className="relative w-full overflow-hidden rounded-md border border-line bg-white" style={{ aspectRatio: `${1} / ${Math.min(Math.max(ratio, 0.45), 1.5)}` }}>
      {url ? (
        <img src={url} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" />
      ) : failed || !revision ? (
        <div className="flex h-full items-center justify-center bg-surface-muted text-[11px] text-fg-muted">{revision ? "No preview" : "No file yet"}</div>
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
    </div>
  )
}

// Left strip of the editor: one slide-like thumbnail per sheet (floor / discipline). Click or use the arrow keys to switch.
export default function SheetSorter({
  blueprints,
  selectedId,
  counts,
  loading,
  canEdit,
  onSelect,
  onAdd,
}: {
  blueprints: Blueprint[]
  selectedId: string | null
  counts: Map<string, SheetCount>
  loading: boolean
  canEdit: boolean
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  const list = useRef<HTMLUListElement>(null)

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const index = blueprints.findIndex((bp) => bp.id === selectedId)
    const next = blueprints[Math.min(blueprints.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))]
    if (next) {
      onSelect(next.id)
      list.current?.querySelector<HTMLElement>(`[data-sheet="${next.id}"]`)?.focus()
    }
  }

  return (
    <nav aria-label="Sheets" className="flex h-full w-full flex-col border-r border-line bg-surface">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-fg-muted">Sheets ({blueprints.length})</h2>
        {canEdit ? <button type="button" onClick={onAdd} aria-label="Add a sheet" title="Add a sheet" className="flex h-6 w-6 items-center justify-center rounded text-lg leading-none text-brand-text hover:bg-brand-soft">+</button> : null}
      </div>
      <ul ref={list} role="listbox" aria-label="Sheets" onKeyDown={onKeyDown} className="flex-1 space-y-3 overflow-y-auto px-3 pb-4">
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <li key={index} aria-hidden="true" className="space-y-2">
              <Skeleton className="aspect-[4/3] w-full" />
              <Skeleton className="h-3 w-2/3" />
            </li>
          ))
        ) : blueprints.length === 0 ? (
          <li className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-fg-muted">{canEdit ? "No sheets yet. Press + to upload the first plan." : "No sheets uploaded yet."}</li>
        ) : (
          blueprints.map((bp, index) => {
            const selected = bp.id === selectedId
            const count = counts.get(bp.id) ?? { total: 0, issues: 0, verified: 0 }
            return (
              <li key={bp.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-sheet={bp.id}
                  onClick={() => onSelect(bp.id)}
                  className={`group block w-full rounded-lg p-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-brand ${selected ? "bg-brand-soft ring-2 ring-brand" : "hover:bg-surface-muted"}`}
                >
                  <div className="flex gap-1.5">
                    <span className={`w-4 flex-none pt-0.5 text-right text-[11px] font-bold ${selected ? "text-brand-text" : "text-fg-muted"}`}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <SheetThumb blueprint={bp} />
                      <p className={`mt-1.5 truncate text-xs font-bold ${selected ? "text-brand-text" : "text-fg"}`}>Sheet {String(index + 1).padStart(2, "0")} - {bp.title}</p>
                      <p className="truncate text-[11px] text-fg-muted">
                        {[bp.level, bp.discipline ? disciplineLabels[bp.discipline] : null, `Rev ${bp.blueprint_revisions[0]?.revision ?? "–"}`].filter(Boolean).join(" • ")}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
                        <span>{count.total} pin{count.total === 1 ? "" : "s"}</span>
                        {count.issues ? <span className="flex items-center gap-1 font-semibold text-danger-fg"><span className="h-2 w-2 rounded-full" style={{ background: statusDot.issue }} />{count.issues}</span> : null}
                        {count.verified ? <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: statusDot.verified }} />{count.verified}</span> : null}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </nav>
  )
}

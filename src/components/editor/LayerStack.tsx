import { useState } from "react"
import { Icon } from "./EditorToolbar"
import { annotationColors, annotationKindLabels, useSignedUrl, type Annotation } from "../../lib/blueprints"
import { canMoveLayer, sortByLayer, type LayerAction } from "../../lib/layers"
import { symbolByKey, type SymbolKey } from "../../lib/symbols"

const kindIcon: Record<string, string> = { image: "image", note: "note", shape: "shape", text: "text", draw: "pen", highlight: "highlighter", polyline: "polyline", area: "area", arrow: "arrow", dimension: "dimension", cloud: "cloud", symbol: "symbol" }

export function describe(a: Annotation) {
  const base = a.kind === "shape" ? (a.shape === "ellipse" ? "Ellipse" : "Rectangle") : a.kind === "symbol" && a.symbol ? (symbolByKey[a.symbol as SymbolKey]?.label ?? "Symbol") : a.kind === "image" ? "Image" : annotationKindLabels[a.kind]
  const text = a.text ? ` • ${a.text.replace(/\s+/g, " ").slice(0, 28)}` : ""
  return base + text
}

function LayerThumb({ a }: { a: Annotation }) {
  const { url } = useSignedUrl("blueprints", a.kind === "image" ? a.image_path : null)
  if (a.kind === "image" && url) return <img src={url} alt="" draggable={false} className="h-6 w-6 flex-none rounded-md border border-line object-cover" />
  return <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md" style={{ background: `${annotationColors[a.color]}33`, color: a.color === "yellow" ? "#8a6d00" : annotationColors[a.color] }}><Icon name={kindIcon[a.kind]} size={14} /></span>
}

export function EyeButton({ hidden, onClick, label }: { hidden: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!hidden} aria-label={`${hidden ? "Show" : "Hide"} ${label}`} title={hidden ? "Show" : "Hide"} className={`rounded p-1 transition hover:bg-surface ${hidden ? "text-fg-muted" : "text-fg"}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {hidden ? <><path d="M3 3l18 18" /><path d="M10.6 6.1A10 10 0 0112 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2.1-2.7 3.3M6.6 6.7C4.5 8.1 3.1 10.1 2.5 12c1 1.8 4.5 6 9.5 6 1.5 0 2.8-.4 4-1" /></> : <><path d="M2.5 12C3.5 10.2 7 6 12 6s8.5 4.2 9.5 6c-1 1.8-4.5 6-9.5 6s-8.5-4.2-9.5-6z" /><circle cx="12" cy="12" r="3" /></>}
      </svg>
    </button>
  )
}


export type LayerStackProps = {
  annotations: Annotation[]
  selectedIds: string[]
  canEdit: boolean
  hiddenIds: Set<string>
  onToggleHidden: (id: string) => void
  onSelectAnnotation: (id: string, additive: boolean) => void
  onMoveLayer: (id: string, action: LayerAction) => void
  onToggleLocked: (item: { type: "pin" | "annotation"; id: string }) => void
  onReorder: (idsBottomFirst: string[]) => void
  showBase: boolean
  onShowBase: (value: boolean) => void
  baseLocked: boolean
  canLockBase: boolean
  onToggleBaseLock: () => void
  pinCount: number
  anyUnlocked: boolean
  onLockAll: (locked: boolean) => void
}

// Every item on the sheet in stacking order (top first): select, hide, lock, move one step or drag to a new place. One transaction
// per reorder. Shared by the Layers tab of the inspector and the Position flyout of the context bar.
export default function LayerStack({ annotations, selectedIds, canEdit, hiddenIds, onToggleHidden, onSelectAnnotation, onMoveLayer, onToggleLocked, onReorder, showBase, onShowBase, baseLocked, canLockBase, onToggleBaseLock, pinCount, anyUnlocked, onLockAll }: LayerStackProps) {
  const ordered = sortByLayer(annotations)
  const orderedIds = ordered.map((item) => item.id)
  const top = [...ordered].reverse() // top of the stack first, like a layers panel
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)

  const endDrag = () => {
    setDragId(null)
    setOver(null)
  }
  const drop = () => {
    if (dragId && over && over.id !== dragId) {
      const display = top.map((a) => a.id).filter((id) => id !== dragId)
      const at = display.indexOf(over.id)
      display.splice(over.after ? at + 1 : at, 0, dragId)
      onReorder([...display].reverse())
    }
    endDrag()
  }

  return (
      <div>
        <p className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-fg-muted">Stack (top first){canEdit && annotations.length > 1 ? <span className="font-medium normal-case tracking-normal">drag to reorder</span> : null}</p>
        <ul className="space-y-1" aria-label="Layer order">
          {top.map((a) => {
            const isOver = over?.id === a.id && dragId !== a.id
            const hidden = hiddenIds.has(a.id)
            return (
              <li
                key={a.id}
                draggable={canEdit}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move"
                  event.dataTransfer.setData("text/plain", a.id)
                  setDragId(a.id)
                }}
                onDragOver={(event) => {
                  if (!dragId) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  setOver({ id: a.id, after: event.clientY > rect.top + rect.height / 2 })
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  drop()
                }}
                onDragEnd={endDrag}
                className={`relative rounded-lg transition ${dragId === a.id ? "opacity-40" : ""}`}
              >
                {isOver ? <span className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded bg-brand ${over?.after ? "-bottom-[3px]" : "-top-[3px]"}`} /> : null}
                <div className={`flex items-center gap-1.5 rounded-lg border px-1.5 py-1 transition ${selectedIds.includes(a.id) ? "border-brand bg-brand-soft" : "border-transparent hover:bg-surface-muted"} ${hidden ? "opacity-55" : ""}`}>
                  {canEdit ? <span className="flex-none cursor-grab text-fg-muted" aria-hidden="true"><svg width="12" height="14" viewBox="0 0 12 16" fill="currentColor"><circle cx="3" cy="3" r="1.3" /><circle cx="9" cy="3" r="1.3" /><circle cx="3" cy="8" r="1.3" /><circle cx="9" cy="8" r="1.3" /><circle cx="3" cy="13" r="1.3" /><circle cx="9" cy="13" r="1.3" /></svg></span> : null}
                  <button type="button" onClick={(event) => onSelectAnnotation(a.id, event.shiftKey || event.ctrlKey || event.metaKey)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm" title={`${describe(a)} (Shift-click adds to the selection)`}>
                    <LayerThumb a={a} />
                    <span className="truncate">{describe(a)}</span>
                  </button>
                  <EyeButton hidden={hidden} onClick={() => onToggleHidden(a.id)} label={describe(a)} />
                  {canEdit ? (
                    <>
                      <button type="button" aria-label="Move up" title="Bring forward" disabled={!canMoveLayer(orderedIds, a.id, "forward")} onClick={() => onMoveLayer(a.id, "forward")} className="rounded p-1 text-fg-muted transition hover:bg-surface hover:text-fg disabled:opacity-30"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg></button>
                      <button type="button" aria-label="Move down" title="Send backward" disabled={!canMoveLayer(orderedIds, a.id, "backward")} onClick={() => onMoveLayer(a.id, "backward")} className="rounded p-1 text-fg-muted transition hover:bg-surface hover:text-fg disabled:opacity-30"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></button>
                      <button type="button" aria-label={a.locked ? "Unlock" : "Lock"} aria-pressed={a.locked} title={a.locked ? "Locked: it ignores clicks. Click to unlock" : "Lock this item"} onClick={() => onToggleLocked({ type: "annotation", id: a.id })} className={`rounded p-1 transition ${a.locked ? "text-brand-text" : "text-fg-muted hover:text-fg"} hover:bg-surface`}><Icon name={a.locked ? "lock" : "unlock"} size={14} /></button>
                    </>
                  ) : a.locked ? <span className="p-1 text-fg-muted" title="Locked"><Icon name="lock" size={14} /></span> : null}
                </div>
              </li>
            )
          })}
          {top.length === 0 ? <li className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">Nothing drawn on this sheet yet. Use the pen, shapes, arrows, symbols, text, measuring tools or add an image.</li> : null}
          <li className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1.5 text-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-muted"><Icon name="sheets" size={14} /></span>
            <span className="min-w-0 flex-1 truncate">Blueprint (backdrop)</span>
            <EyeButton hidden={!showBase} onClick={() => onShowBase(!showBase)} label="the blueprint" />
            {canLockBase ? (
              <button type="button" onClick={onToggleBaseLock} aria-pressed={baseLocked} title={baseLocked ? "Base layer locked. Click to unlock" : "Lock the base layer: no new revisions, no scale changes"} className={`rounded p-1 transition ${baseLocked ? "text-brand-text" : "text-fg-muted hover:text-fg"} hover:bg-surface-muted`}><Icon name={baseLocked ? "lock" : "unlock"} size={14} /></button>
            ) : baseLocked ? <span className="p-1 text-fg-muted" title="Locked"><Icon name="lock" size={14} /></span> : null}
          </li>
        </ul>
        {canEdit && (annotations.length > 0 || pinCount > 0) ? (
          <button type="button" onClick={() => onLockAll(anyUnlocked)} className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-xs font-bold transition hover:bg-surface-muted">{anyUnlocked ? "Lock every item on this sheet" : "Unlock every item on this sheet"}</button>
        ) : null}
      </div>
  )
}

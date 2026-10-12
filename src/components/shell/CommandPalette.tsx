import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import AdminIcon, { type AdminIconName } from "../../pages/Admin/AdminIcon"
import type { ShellNavItem } from "./AppShell"

export type PaletteAction = { id: string; label: string; icon: AdminIconName; run: () => void }
type Entry = { id: string; label: string; icon: AdminIconName; group: string; run: () => void }

// Ctrl+K: type to jump to any page or run a quick action. Arrow keys move, Enter runs, Escape closes.
export default function CommandPalette({ items, actions, onGo, onClose }: { items: ShellNavItem[]; actions: PaletteAction[]; onGo: (key: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = items.map((item) => ({ id: `p:${item.key}`, label: item.label, icon: item.icon, group: "Go to", run: () => onGo(item.key) }))
    const quick: Entry[] = actions.map((action) => ({ id: `a:${action.id}`, label: action.label, icon: action.icon, group: "Actions", run: () => { onClose(); action.run() } }))
    const text = query.trim().toLowerCase()
    return [...pages, ...quick].filter((entry) => !text || entry.label.toLowerCase().includes(text))
  }, [items, actions, query, onGo, onClose])

  useEffect(() => {
    input.current?.focus()
  }, [])
  useEffect(() => {
    setIndex(0)
  }, [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }, [index])

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setIndex((value) => Math.min(entries.length - 1, value + 1)) }
    else if (event.key === "ArrowUp") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)) }
    else if (event.key === "Enter") { event.preventDefault(); entries[index]?.run() }
    else if (event.key === "Escape") { event.preventDefault(); onClose() }
  }

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Jump to" onKeyDown={onKey} className="bt-pop w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <span className="h-5 w-5 flex-none text-fg-muted [&>svg]:h-5 [&>svg]:w-5"><AdminIcon name="search" /></span>
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a page or run an action..." aria-label="Search" className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-fg-muted" />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px] font-bold text-fg-muted">Esc</kbd>
        </div>
        <ul ref={list} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {entries.length === 0 ? <li className="px-3 py-8 text-center text-sm text-fg-muted">Nothing matches "{query}".</li> : null}
          {entries.map((entry, position) => (
            <li key={entry.id} data-index={position} role="option" aria-selected={position === index}>
              {position === 0 || entries[position - 1].group !== entry.group ? <p className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{entry.group}</p> : null}
              <button type="button" onMouseEnter={() => setIndex(position)} onClick={entry.run} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${position === index ? "bg-brand-soft text-brand-text" : ""}`}>
                <span className="h-[18px] w-[18px] flex-none [&>svg]:h-[18px] [&>svg]:w-[18px]"><AdminIcon name={entry.icon} /></span>
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

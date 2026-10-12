import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

export type Command = { id: string; label: string; group: string; hint?: string; keywords?: string; run: () => void; disabled?: boolean }

// Ctrl+K: type what you want to do ("lock", "export", "polyline", "focus") instead of hunting through menus.
export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return commands
      .filter((command) => !command.disabled)
      .map((command) => {
        const haystack = `${command.label} ${command.group} ${command.keywords ?? ""}`.toLowerCase()
        if (!words.every((word) => haystack.includes(word))) return null
        const label = command.label.toLowerCase()
        const score = words.reduce((sum, word) => sum + (label.startsWith(word) ? 3 : label.includes(word) ? 2 : 1), 0)
        return { command, score }
      })
      .filter((entry): entry is { command: Command; score: number } => !!entry)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.command)
  }, [commands, query])

  useEffect(() => input.current?.focus(), [])
  useEffect(() => setIndex(0), [query])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" })
  }, [index])

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    setTimeout(command.run, 0) // after the palette is gone, so commands that open dialogs get the focus
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setIndex((value) => Math.min(results.length - 1, value + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setIndex((value) => Math.max(0, value - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      run(results[index])
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[650] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div data-bt-dialog role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown} className="bt-dialog w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface text-fg shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="flex-none text-fg-muted" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M16 16l5 5" /></svg>
          <input ref={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command: lock, export, polyline, focus..." aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="command-list" aria-activedescendant={results[index] ? `command-${results[index].id}` : undefined} className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-muted" />
          <kbd className="rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[11px] font-bold text-fg-muted">Esc</kbd>
        </div>
        <ul ref={list} id="command-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 ? <li className="px-3 py-6 text-center text-sm text-fg-muted">Nothing matches "{query}".</li> : null}
          {results.map((command, i) => (
            <li key={command.id} id={`command-${command.id}`} data-index={i} role="option" aria-selected={i === index}>
              <button type="button" tabIndex={-1} onMouseMove={() => setIndex(i)} onClick={() => run(command)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === index ? "bg-brand-soft text-fg" : "hover:bg-surface-muted"}`}>
                <span className="w-20 flex-none text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{command.group}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{command.label}</span>
                {command.hint ? <kbd className="flex-none rounded border border-line bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] font-bold text-fg-muted">{command.hint}</kbd> : null}
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11px] text-fg-muted">Arrow keys to move, Enter to run, Esc to close.</p>
      </div>
    </div>,
    document.body,
  )
}

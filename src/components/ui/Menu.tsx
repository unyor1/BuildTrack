import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export type MenuItem =
  | { separator: true }
  | { heading: string }
  | { label: string; hint?: string; icon?: ReactNode; onClick: () => void; checked?: boolean; disabled?: boolean; danger?: boolean }
  | { label: string; icon?: ReactNode; submenu: MenuItem[]; disabled?: boolean }

type ActionItem = Extract<MenuItem, { label: string; onClick: () => void }>
type SubmenuItem = Extract<MenuItem, { submenu: MenuItem[] }>
const isSubmenu = (item: MenuItem): item is SubmenuItem => "submenu" in item
const isAction = (item: MenuItem): item is ActionItem => "label" in item && "onClick" in item

const Check = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
const Chevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>

// The list itself (also used by the right-click menu). Arrow keys move between entries, Enter picks, Esc closes.
// An entry with `submenu` opens a second list beside it (hover, click or the right arrow); the left arrow comes back.
export function MenuList({ items, onClose, label, focusFirst = true, onBack }: { items: MenuItem[]; onClose: () => void; label: string; focusFirst?: boolean; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<number | null>(null)
  const [flip, setFlip] = useState(false)
  const [shift, setShift] = useState(0)
  const subRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusFirst) ref.current?.querySelector<HTMLButtonElement>(":scope > button:not(:disabled)")?.focus()
  }, [focusFirst])

  // Open the second list on the other side when it would run off the screen.
  useLayoutEffect(() => {
    if (openSub === null) {
      setFlip(false)
      setShift(0)
      return
    }
    const rect = subRef.current?.getBoundingClientRect()
    if (!rect) return
    setFlip(rect.right > window.innerWidth - 8)
    // Slide the second list up when it would run off the bottom of the screen.
    const bottom = rect.bottom - shift
    setShift(bottom > window.innerHeight - 8 ? Math.max(-(bottom - (window.innerHeight - 8)), -(rect.top - shift - 8)) : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSub])

  const onKeyDown = (event: React.KeyboardEvent) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)") ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === "ArrowDown") {
      event.preventDefault()
      buttons[(index + 1) % buttons.length]?.focus()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus()
    } else if (event.key === "ArrowRight" && document.activeElement?.getAttribute("aria-haspopup") === "menu") {
      event.preventDefault()
      event.stopPropagation()
      setOpenSub(Number(document.activeElement.getAttribute("data-index")))
    } else if (event.key === "ArrowLeft" && onBack) {
      event.preventDefault()
      event.stopPropagation()
      onBack()
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }
  return (
    <div ref={ref} role="menu" aria-label={label} onKeyDown={onKeyDown} className="bt-pop relative min-w-[13rem] max-w-[18rem] rounded-xl border border-line bg-surface/95 p-1 text-sm text-fg shadow-2xl backdrop-blur-xl">
      {items.map((item, index) => {
        if ("separator" in item) return <div key={index} role="separator" className="my-1 h-px bg-line" />
        if ("heading" in item) return <p key={index} className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{item.heading}</p>
        if (isSubmenu(item)) {
          const open = openSub === index
          return (
            <div key={index} className="contents" onMouseEnter={() => !item.disabled && setOpenSub(index)} onMouseLeave={() => setOpenSub((current) => (current === index ? null : current))}>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                data-index={index}
                disabled={item.disabled}
                onClick={() => setOpenSub(open ? null : index)}
                onFocus={() => setOpenSub((current) => (current !== null && current !== index ? null : current))}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-muted focus:bg-surface-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${open ? "bg-surface-muted" : ""}`}
              >
                <span className="flex h-4 w-4 flex-none items-center justify-center text-brand-text">{item.icon}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
                <Chevron />
              </button>
              {open ? (
                <div ref={subRef} className={`absolute top-0 z-10 ${flip ? "right-full mr-1" : "left-full ml-1"}`} style={{ marginTop: (ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.offsetTop ?? 0) - 4 + shift }}>
                  <MenuList items={item.submenu} onClose={onClose} label={item.label} focusFirst={false} onBack={() => { setOpenSub(null); ref.current?.querySelector<HTMLButtonElement>(`[data-index="${index}"]`)?.focus() }} />
                </div>
              ) : null}
            </div>
          )
        }
        if (!isAction(item)) return null
        return (
          <button
            key={index}
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onClick()
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-muted focus:bg-surface-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? "text-danger-fg" : ""}`}
          >
            <span className="flex h-4 w-4 flex-none items-center justify-center text-brand-text">{item.checked ? <Check /> : item.icon}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{item.label}</span>
            {item.hint ? <kbd className="flex-none rounded border border-line bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] font-bold text-fg-muted">{item.hint}</kbd> : null}
          </button>
        )
      })}
    </div>
  )
}

// A button that opens a menu under it. The popup lives in a portal so toolbars with scrolling never clip it.
export default function Menu({ children, label, items, className, align = "start" }: { children: ReactNode; label: string; items: MenuItem[]; className?: string; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const close = useCallback(() => {
    setOpen(false)
    button.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const rect = button.current.getBoundingClientRect()
    const width = 256
    setAt({ left: Math.max(8, Math.min(window.innerWidth - width - 8, align === "end" ? rect.right - width : rect.left)), top: Math.min(window.innerHeight - 60, rect.bottom + 6) })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element
      if (!target.closest("[role=menu]") && !button.current?.contains(target)) setOpen(false)
    }
    const onResize = () => setOpen(false)
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("resize", onResize)
    }
  }, [open])

  return (
    <>
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((value) => !value)} className={className}>
        {children}
      </button>
      {open && at ? createPortal(<div className="fixed z-[700]" style={{ left: at.left, top: at.top }}><MenuList items={items} onClose={close} label={label} /></div>, document.body) : null}
    </>
  )
}

// Right-click menu at a screen position.
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest("[role=menu]")) onClose()
    }
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("blur", onClose)
    window.addEventListener("resize", onClose)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("blur", onClose)
      window.removeEventListener("resize", onClose)
    }
  }, [onClose])
  const left = Math.max(8, Math.min(x, window.innerWidth - 270))
  const top = Math.max(8, Math.min(y, window.innerHeight - Math.min(window.innerHeight - 16, items.length * 34 + 16)))
  return createPortal(<div className="fixed z-[700]" style={{ left, top }}><MenuList items={items} onClose={onClose} label="Item menu" /></div>, document.body)
}

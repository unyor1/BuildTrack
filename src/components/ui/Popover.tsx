import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

// A button that opens a small panel under it (sliders, swatches, tabs, anything). The panel lives in a portal so toolbars that
// scroll never clip it. It closes on Esc, on a press outside, and when the window is resized. Use Menu for plain lists of commands.
// The panel shares the dialogs' layer (z-900) so stacking follows opening order: a popover opened inside a dialog (the photo
// editor) shows above it, and a dialog opened later still covers an older popover.
export default function Popover({
  label,
  trigger,
  className,
  width = 288,
  align = "start",
  disabled = false,
  children,
}: {
  label: string
  trigger: ReactNode
  className?: string
  width?: number
  align?: "start" | "end"
  disabled?: boolean
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    button.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const rect = button.current.getBoundingClientRect()
    const left = align === "end" ? rect.right - width : rect.left
    setAt({ left: Math.max(8, Math.min(window.innerWidth - width - 8, left)), top: Math.min(window.innerHeight - 80, rect.bottom + 6) })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        close()
      }
    }
    const onResize = () => setOpen(false)
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey, true)
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey, true)
      window.removeEventListener("resize", onResize)
    }
  }, [open, close])

  return (
    <>
      <button ref={button} type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((value) => !value)} className={className}>
        {trigger}
      </button>
      {open && at
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-label={label}
              className="bt-pop fixed z-[900] max-h-[min(34rem,calc(100vh-6rem))] overflow-y-auto rounded-xl border border-line bg-surface/95 text-fg shadow-2xl backdrop-blur-xl"
              style={{ left: at.left, top: at.top, width }}
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

import { useEffect, useId, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl"

const widths: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
}

let openDialogs = 0
let savedOverflow = ""
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The one dialog used across the app (details, forms, confirmations, pin details).
// Accessible: role="dialog", labelled by its title, Esc closes, focus is trapped and restored, page scroll is locked.
export default function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  hideClose = false,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  closeOnBackdrop?: boolean
  hideClose?: boolean
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    openDialogs++
    if (openDialogs === 1) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
    }
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    const firstField = panel.current?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")
    ;(firstField ?? focusable()[0] ?? panel.current)?.focus()

    const onKey = (event: KeyboardEvent) => {
      // Only the top-most dialog reacts.
      const dialogs = document.querySelectorAll("[data-bt-dialog]")
      if (dialogs[dialogs.length - 1] !== panel.current) return
      if (event.key === "Escape") {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab") return
      const items = focusable()
      if (!items.length) return event.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      openDialogs--
      if (openDialogs === 0) document.body.style.overflow = savedOverflow
      previous?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      className="bt-dialog-backdrop fixed inset-0 z-[900] flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        data-bt-dialog
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`bt-dialog flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface text-fg shadow-2xl outline-none sm:rounded-2xl ${widths[size]}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-lg font-extrabold text-brand-strong">{title}</h2>
            {description ? <p id={descriptionId} className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
          </div>
          {hideClose ? null : (
            <button
              type="button"
              aria-label="Close dialog"
              onClick={onClose}
              className="-mr-2 flex h-8 w-8 flex-none items-center justify-center rounded-lg text-xl leading-none text-fg-muted transition hover:bg-surface-muted hover:text-brand-text"
            >
              &times;
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-muted/50 px-6 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

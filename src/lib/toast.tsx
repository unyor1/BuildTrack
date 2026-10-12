import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

type Kind = "success" | "error" | "info"
type Toast = { id: number; kind: Kind; title: string; detail?: string; duration: number }

type ToastApi = {
  success: (title: string, detail?: string) => void
  error: (title: string, detail?: string) => void
  info: (title: string, detail?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
let nextId = 1
const MAX_VISIBLE = 4

const styles: Record<Kind, { bar: string; icon: string; label: string; path: string }> = {
  success: { bar: "bg-[#1ca875]", icon: "bg-ok-soft text-ok-fg", label: "Success", path: "M5 13l4 4L19 7" },
  error: { bar: "bg-[#d93a3a]", icon: "bg-danger-soft text-danger-fg", label: "Error", path: "M6 6l12 12M18 6L6 18" },
  info: { bar: "bg-accent", icon: "bg-brand-soft text-brand-text", label: "Notice", path: "M12 8v.01M12 11v5" },
}

// Short, non-blocking feedback for every success / error. Errors stay longer, hovering pauses the timer,
// screen readers are told through aria-live (errors are announced assertively).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])

  const push = useCallback((kind: Kind, title: string, detail?: string) => {
    setToasts((current) => {
      // Do not stack the same message twice in a row.
      if (current.some((toast) => toast.kind === kind && toast.title === title && toast.detail === detail)) return current
      const next = [...current, { id: nextId++, kind, title, detail, duration: kind === "error" ? 8000 : 4500 }]
      return next.slice(-MAX_VISIBLE)
    })
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, detail) => push("success", title, detail),
      error: (title, detail) => push("error", title, detail),
      info: (title, detail) => push("info", title, detail),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-3 z-[1000] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[380px] sm:items-stretch sm:px-0">
          {toasts.map((toast) => {
            const look = styles[toast.kind]
            return (
              <div
                key={toast.id}
                role={toast.kind === "error" ? "alert" : "status"}
                aria-live={toast.kind === "error" ? "assertive" : "polite"}
                className="bt-toast group pointer-events-auto relative w-full max-w-[380px] overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-xl sm:max-w-none"
              >
                <div className="flex items-start gap-3 p-3 pr-2">
                  <span className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full ${look.icon}`} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d={look.path} />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      <span className="sr-only">{look.label}: </span>
                      {toast.title}
                    </p>
                    {toast.detail ? <p className="mt-0.5 text-xs text-fg-muted">{toast.detail}</p> : null}
                  </div>
                  <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)} className="flex h-6 w-6 flex-none items-center justify-center rounded text-lg leading-none text-fg-muted hover:bg-surface-muted hover:text-brand-text">
                    &times;
                  </button>
                </div>
                <div
                  className={`bt-toast-timer h-0.5 w-full ${look.bar} group-hover:[animation-play-state:paused]`}
                  style={{ animationDuration: `${toast.duration}ms` }}
                  onAnimationEnd={() => dismiss(toast.id)}
                />
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used inside <ToastProvider>")
  return context
}

// Turn any thrown value into text a person can read.
export const errorText = (error: unknown, fallback = "Something went wrong. Please try again.") =>
  error instanceof Error && error.message ? error.message : typeof error === "string" && error ? error : fallback

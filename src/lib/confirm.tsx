import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import Modal, { type ModalSize } from "../components/Modal"

type ConfirmOptions = {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: "default" | "danger"
  size?: ModalSize
}

type Pending = ConfirmOptions & { resolve: (value: boolean) => void }
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null)

// Replacement for window.confirm(): same promise style, but styled, accessible and on-theme.
//   if (!(await confirm({ title: "Delete project?", tone: "danger", confirmLabel: "Delete" }))) return
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const active = useRef<Pending | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const next = { ...options, resolve }
        active.current = next
        setPending(next)
      }),
    [],
  )

  const settle = (value: boolean) => {
    active.current?.resolve(value)
    active.current = null
    setPending(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <Modal
          title={pending.title}
          size={pending.size ?? "sm"}
          onClose={() => settle(false)}
          footer={
            <>
              <button type="button" onClick={() => settle(false)} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-muted">
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${pending.tone === "danger" ? "bg-[#d93a3a] hover:bg-[#b82f2f]" : "bg-brand hover:bg-brand-hover"}`}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </>
          }
        >
          {pending.message ? <div className="text-sm text-fg">{pending.message}</div> : null}
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const context = useContext(ConfirmContext)
  if (!context) throw new Error("useConfirm must be used inside <ConfirmProvider>")
  return context
}

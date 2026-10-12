import { useState } from "react"
import Modal from "./Modal"
import { useAuth } from "../lib/auth"
import { removeItem, retryItem, useOfflineQueue } from "../lib/offlineQueue"
import { kindLabel } from "../lib/offlineModel"
import { applyUpdate, promptInstall, usePwa } from "../lib/pwa"
import { useToast } from "../lib/toast"

const when = (time: number) => new Date(time).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// A small pill at the bottom of the screen that only appears when something needs attention: no connection, work waiting to be sent,
// a failed item, a new version of the app, or the chance to install it.
export default function AppStatus() {
  const { profile } = useAuth()
  const toast = useToast()
  const { items, online, syncing, sync, summary } = useOfflineQueue(profile?.id ?? null)
  const { updateReady, canInstall } = usePwa()
  const [open, setOpen] = useState(false)

  if (!profile) return null
  const waiting = summary.pending + summary.failed
  if (online && !waiting && !updateReady && !canInstall) return null

  const text = updateReady
    ? "A new version is ready"
    : !online
      ? waiting
        ? `Offline • ${summary.pending} waiting to send`
        : "You are offline"
      : summary.failed
        ? `${summary.failed} item${summary.failed === 1 ? "" : "s"} could not be sent`
        : syncing
          ? "Sending saved work..."
          : waiting
            ? `${summary.pending} waiting to send`
            : "Install BuildTrack on this device"
  const tone = updateReady ? "bg-brand text-white" : !online ? "bg-[#211f20] text-white" : summary.failed ? "bg-red-700 text-white" : "bg-surface text-fg border border-line"

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-[900] flex justify-center px-3 md:bottom-4" role="status" aria-live="polite">
        <div className={`pointer-events-auto flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-xl ${tone}`}>
          <span className={`h-2 w-2 flex-none rounded-full ${!online ? "bg-amber-400" : summary.failed ? "bg-white" : "bg-green-400"}`} aria-hidden="true" />
          <span className="truncate">{text}</span>
          {updateReady ? <button type="button" onClick={applyUpdate} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#68135f]">Reload</button> : null}
          {!updateReady && canInstall && !waiting ? <button type="button" onClick={() => void promptInstall()} className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">Install</button> : null}
          {waiting ? <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30">Details</button> : null}
          {online && waiting && !syncing ? <button type="button" onClick={() => void sync()} className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30">Send now</button> : null}
        </div>
      </div>
      {open ? (
        <Modal title="Saved on this device" description={online ? "These are sent automatically. You can also send them now." : "These will be sent as soon as you are back online."} onClose={() => setOpen(false)}>
          {items.length === 0 ? (
            <p className="text-sm text-fg-muted">Everything has been sent.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-bold">{kindLabel[item.kind]}: {item.label}</p>
                    <p className="text-xs text-fg-muted">Saved {when(item.createdAt)}{item.status === "pending" && item.attempts ? ` • tried ${item.attempts} time${item.attempts === 1 ? "" : "s"}` : ""}</p>
                    {item.status === "failed" ? <p className="mt-1 text-xs font-semibold text-danger-fg">Not sent: {item.error ?? "unknown problem"}</p> : null}
                  </div>
                  <div className="flex flex-none gap-1.5">
                    {item.status === "failed" ? <button type="button" className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-surface-muted" onClick={() => void retryItem(item).then(() => sync())}>Try again</button> : null}
                    <button type="button" className="rounded-md px-2.5 py-1 text-xs font-bold text-danger-fg hover:bg-danger-soft" onClick={() => void removeItem(item.id).then(() => toast.info("Removed from this device"))}>Discard</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
    </>
  )
}

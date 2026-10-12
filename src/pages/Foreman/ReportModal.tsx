import { useCallback, useState, type FormEvent } from "react"
import Modal from "../../components/Modal"
import { PinChecklist, PinPhotos, PinTimeline, ProgressTracker } from "../../components/editor/PinParts"
import { buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { statusLabels, type Pin } from "../../lib/blueprints"
import { useAuth } from "../../lib/auth"
import { supabase } from "../../lib/supabase"
import { enqueue } from "../../lib/offlineQueue"
import { isNetworkProblem } from "../../lib/offlineModel"
import { useToast } from "../../lib/toast"

// One pin as the foreman sees it: tick the checklist, add photos, leave a note, then start the work or send it for review.
export default function ReportModal({ pin, onClose, onSaved }: { pin: Pin; onClose: () => void; onSaved: () => Promise<void> }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [checklist, setChecklist] = useState({ done: 0, total: 0 })
  const onChecklist = useCallback((done: number, total: number) => setChecklist((current) => (current.done === done && current.total === total ? current : { done, total })), [])
  const locked = pin.status === "for_review" || pin.status === "verified"

  const send = async (status: "in_progress" | "for_review", event?: FormEvent) => {
    event?.preventDefault()
    if (status === "for_review" && checklist.total > checklist.done && note.trim().length < 5) return setError(`${checklist.total - checklist.done} checklist item(s) are not ticked. Tick them, or write a short note for the engineer.`)
    setError("")
    setBusy(true)
    // No signal: keep the report on this device and send it when the connection is back.
    const saveOffline = async () => {
      if (!profile) return
      await enqueue({ userId: profile.id, kind: "pin_progress", label: pin.title, payload: { pinId: pin.id, status, note: note.trim() || null } })
      setBusy(false)
      toast.info("Saved on this device", "It will be sent when you are back online.")
      await onSaved()
    }
    if (!navigator.onLine) return saveOffline()
    const { error: rpcError } = await supabase.rpc("report_pin_progress", { p_pin: pin.id, p_status: status, p_note: note.trim() || null })
    if (rpcError && isNetworkProblem(rpcError)) return saveOffline()
    setBusy(false)
    if (rpcError) {
      const message = rpcError.message.replace(/^.*?(Only a Foreman|Foremen can|A verified|This pin is assigned)/i, "$1")
      setError(message)
      return toast.error("Not sent", message)
    }
    toast.success(status === "for_review" ? "Sent to the engineer for review" : "Progress saved", pin.title)
    await onSaved()
  }

  return (
    <Modal
      title={pin.title}
      description={`${statusLabels[pin.status]}${pin.due_date ? ` • due ${pin.due_date}` : ""}`}
      size="lg"
      onClose={busy ? () => undefined : onClose}
      footer={
        locked ? (
          <button type="button" className={buttonSecondary} onClick={onClose}>Close</button>
        ) : (
          <>
            <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className={buttonSecondary} onClick={() => void send("in_progress")} disabled={busy}>{pin.status === "not_started" ? "Start work" : "Save progress"}</button>
            <button type="button" className={buttonPrimary} onClick={() => void send("for_review")} disabled={busy}>{busy ? "Sending..." : "Send for review"}</button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <ProgressTracker status={pin.status} />
        {pin.description ? <p className="whitespace-pre-wrap text-sm">{pin.description}</p> : null}
        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Checklist</h3>
          <PinChecklist pinId={pin.id} canEdit={false} canTick={!locked} onChange={onChecklist} />
        </section>
        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Photos</h3>
          <PinPhotos pin={pin} canAdd={!locked} canRemoveAny={false} meId={profile?.id ?? ""} columns={3} />
        </section>
        {!locked ? (
          <label className="block text-sm font-semibold">Note for the engineer (optional)
            <textarea className={`${inputClass} mt-1`} rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was done, anything to watch for." />
          </label>
        ) : null}
        {error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{error}</p> : null}
        <section>
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Timeline</h3>
          <PinTimeline pinId={pin.id} canComment />
        </section>
      </div>
    </Modal>
  )
}

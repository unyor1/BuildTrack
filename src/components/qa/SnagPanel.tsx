import { useMemo, useState } from "react"
import Modal from "../Modal"
import { EmptyState, buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import { SkeletonList } from "../ui/Skeleton"
import { Chip } from "./QaBits"
import { SnagPhotoStrip } from "./SnagParts"
import { categories, categoryLabels, defaultDueDate, qaSeverityHelp, qaSeverityLabels, refNumber, severities, snagStatusLabels, snagTone, trades, tradeLabels, urgencyLabels, type DefectCategory, type QaSeverity, type Trade } from "../../lib/qaModel"
import { snagActions, useSnagPhotos, type Snag } from "../../lib/snags"
import { useToast } from "../../lib/toast"
import { useProjectWork } from "../../lib/projectWork"

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const label = "mb-1 block text-xs font-extrabold uppercase tracking-wider text-fg-muted"
const urgencyTone = { low: "bg-surface-muted text-fg-muted", normal: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200", urgent: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" }

// The engineer's inbox of client reports: look at the photos, then accept (it becomes an NCR for the foreman) or explain why not.
export function SnagsPanel({ snags, loading, error, nameOf, onOpen }: { snags: Snag[]; loading: boolean; error: string; nameOf: (id: string | null) => string; onOpen: (snag: Snag) => void }) {
  const [filter, setFilter] = useState<"waiting" | "all">("waiting")
  const list = useMemo(() => snags.filter((row) => filter === "all" || row.status === "submitted"), [snags, filter])
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Show">
          {(["waiting", "all"] as const).map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-md px-3 py-1 text-sm font-bold ${filter === key ? "bg-brand text-white" : "text-fg hover:bg-surface-muted"}`}>{key === "waiting" ? "Waiting for you" : "All reports"}</button>)}
        </div>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p> : null}
      {loading ? <SkeletonList rows={3} label="Loading client reports" /> : list.length === 0 ? (
        <EmptyState title={filter === "waiting" ? "Nothing waiting" : "No client reports yet"}>When the client reports a problem it appears here and you get a notification.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {list.map((snag) => (
            <li key={snag.id}>
              <button type="button" onClick={() => onOpen(snag)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:bg-surface-muted">
                <span className="min-w-0"><span className="block truncate text-sm font-extrabold">{refNumber("snag", snag.number)} {snag.title}</span><span className="text-xs text-fg-muted">{nameOf(snag.author_id)} • {when(snag.created_at)}{snag.location ? ` • ${snag.location}` : ""}</span></span>
                <span className="flex items-center gap-2"><Chip tone={urgencyTone[snag.urgency]}>{urgencyLabels[snag.urgency]}</Chip><Chip tone={snagTone[snag.status]}>{snagStatusLabels[snag.status]}</Chip></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SnagDetail({ snag, today, foremen, nameOf, onClose, onDecided }: { snag: Snag; today: string; foremen: Array<{ user_id: string; full_name: string }>; nameOf: (id: string | null) => string; onClose: () => void; onDecided: (defectId: string | null) => void | Promise<void> }) {
  const toast = useToast()
  const { photos, error: photoError, reload: reloadPhotos } = useSnagPhotos(snag.id)
  const work = useProjectWork(snag.project_id)
  const pin = work.pins.find(pin => pin.id === snag.pin_id)
  const waiting = snag.status === "submitted"
  const [severity, setSeverity] = useState<QaSeverity>(snag.urgency === "urgent" ? "major" : "minor")
  const [category, setCategory] = useState<DefectCategory>("workmanship")
  const [trade, setTrade] = useState<Trade>("general")
  const [assignedTo, setAssignedTo] = useState(foremen.length === 1 ? foremen[0].user_id : "")
  const [due, setDue] = useState("")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const accept = async () => {
    setBusy(true)
    const result = await snagActions.accept({ id: snag.id, note: note.trim(), severity, category, trade, assignedTo: assignedTo || null, due: due || null, reference: reference.trim() })
    setBusy(false)
    if (!result.ok) return toast.error("Not accepted", result.message)
    toast.success("Accepted: NCR raised", assignedTo ? "The foreman and the client are notified" : "Assign it to a foreman so it gets fixed")
    await onDecided(result.data)
  }
  const decline = async () => {
    setBusy(true)
    const result = await snagActions.decline(snag.id, note.trim())
    setBusy(false)
    if (!result.ok) return toast.error("Not sent", result.message)
    toast.success("The client has been told")
    await onDecided(null)
  }

  return (
    <Modal
      title={`${refNumber("snag", snag.number)}  ${snag.title}`}
      description={`From ${nameOf(snag.author_id)} • ${when(snag.created_at)} • ${urgencyLabels[snag.urgency]}${snag.location ? ` • ${snag.location}` : ""}`}
      size="xl"
      onClose={onClose}
      footer={waiting ? (
        <>
          <button type="button" className={buttonSecondary} disabled={busy || note.trim().length < 5} onClick={() => void decline()} title="A reason is required">Decline with a reason</button>
          <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void accept()}>{busy ? "Working..." : "Accept and raise an NCR"}</button>
          <button type="button" className={buttonSecondary} onClick={onClose}>Close</button>
        </>
      ) : <button type="button" className={buttonSecondary} onClick={onClose}>Close</button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Chip tone={snagTone[snag.status]}>{snagStatusLabels[snag.status]}</Chip>{snag.decided_by ? <span className="text-xs text-fg-muted">Decided by {nameOf(snag.decided_by)}{snag.decided_at ? ` • ${when(snag.decided_at)}` : ""}</span> : null}</div>
        {snag.description ? <p className="whitespace-pre-wrap text-sm">{snag.description}</p> : <p className="text-sm text-fg-muted">The client gave no details.</p>}
        {pin ? <a className={buttonSecondary} href={`/engineer/annotation?project=${encodeURIComponent(snag.project_id)}&sheet=${encodeURIComponent(pin.blueprint_id)}&pin=${encodeURIComponent(pin.id)}`}>Open linked pin: {pin.title}</a> : snag.pin_id ? <p className="text-xs text-fg-muted">Linked work pin unavailable.</p> : null}
        {photoError ? <p role="alert" className="text-sm text-danger-fg">{photoError} <button type="button" className="underline" onClick={() => void reloadPhotos()}>Retry photos</button></p> : null}
        {photos.length ? <SnagPhotoStrip photos={photos} /> : null}
        {snag.response ? <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm"><strong>Reply to the client:</strong> {snag.response}</p> : null}
        {waiting ? (
          <section aria-label="Decision" className="space-y-3 rounded-xl border border-brand p-3">
            <h3 className="text-sm font-extrabold">Decide</h3>
            <p className="text-xs text-fg-muted">Accepting raises a non-conformance report for the foreman to fix; the client is told and later sees when it is fixed and checked. Declining needs a reason the client will read.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className={label} htmlFor="s-sev">Class</label><select id="s-sev" className={inputClass} value={severity} onChange={(event) => setSeverity(event.target.value as QaSeverity)}>{severities.map((s) => <option key={s} value={s}>{qaSeverityLabels[s]}</option>)}</select></div>
              <div><label className={label} htmlFor="s-cat">Category</label><select id="s-cat" className={inputClass} value={category} onChange={(event) => setCategory(event.target.value as DefectCategory)}>{categories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}</select></div>
              <div><label className={label} htmlFor="s-trade">Trade</label><select id="s-trade" className={inputClass} value={trade} onChange={(event) => setTrade(event.target.value as Trade)}>{trades.map((t) => <option key={t} value={t}>{tradeLabels[t]}</option>)}</select></div>
            </div>
            <p className="text-xs text-fg-muted">{qaSeverityHelp[severity]} Default deadline: {defaultDueDate(severity, today)}.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className={label} htmlFor="s-who">Responsible foreman</label><select id="s-who" className={inputClass} value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Not assigned yet</option>{foremen.map((f) => <option key={f.user_id} value={f.user_id}>{f.full_name}</option>)}</select></div>
              <div><label className={label} htmlFor="s-due">Deadline (optional)</label><input id="s-due" type="date" min={today} className={inputClass} value={due} onChange={(event) => setDue(event.target.value)} /></div>
              <div><label className={label} htmlFor="s-ref">Standard / clause</label><input id="s-ref" className={inputClass} maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} /></div>
            </div>
            <div><label className={label} htmlFor="s-note">Message to the client</label><textarea id="s-note" rows={2} maxLength={1000} className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Plain words: what will happen, or why it is not a defect (required to decline)" /></div>
          </section>
        ) : null}
      </div>
    </Modal>
  )
}

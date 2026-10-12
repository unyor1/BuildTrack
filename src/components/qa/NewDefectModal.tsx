import { useState } from "react"
import Modal from "../Modal"
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import type { Pin } from "../../lib/blueprints"
import { categories, categoryLabels, defaultDueDate, qaActions, qaSeverityHelp, qaSeverityLabels, severities, trades, tradeLabels, type DefectCategory, type QaSeverity, type Trade } from "../../lib/qa"
import { useToast } from "../../lib/toast"

const label = "mb-1 block text-xs font-extrabold uppercase tracking-wider text-fg-muted"

// A non-conformance noticed outside a formal inspection (a walk-through, a delivery, a complaint). Defects found in an inspection
// are raised automatically when it is signed off.
export default function NewDefectModal({
  projectId,
  pins,
  foremen,
  today,
  initialPinId,
  onClose,
  onCreated,
}: {
  projectId: string
  pins: Pin[]
  foremen: Array<{ user_id: string; full_name: string }>
  today: string
  initialPinId?: string
  onClose: () => void
  onCreated: (defectId: string) => void | Promise<void>
}) {
  const toast = useToast()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<DefectCategory>("workmanship")
  const [severity, setSeverity] = useState<QaSeverity>("major")
  const [trade, setTrade] = useState<Trade>("general")
  const [reference, setReference] = useState("")
  const [pinId, setPinId] = useState(initialPinId ?? "")
  const [assignedTo, setAssignedTo] = useState(foremen.length === 1 ? foremen[0].user_id : "")
  const [due, setDue] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    const result = await qaActions.raiseDefect({ projectId, title: title.trim(), description: description.trim(), category, severity, trade, reference: reference.trim(), pinId: pinId || null, assignedTo: assignedTo || null, due: due || null })
    setBusy(false)
    if (!result.ok) return toast.error("Not raised", result.message)
    toast.success("Non-conformance raised", assignedTo ? "The foreman is notified" : "Assign it to a foreman so it gets fixed")
    await onCreated(result.data)
  }

  return (
    <Modal
      title="Raise a non-conformance (NCR)"
      description="Record work that does not meet the drawings, the specification or the code. The foreman must fix it and the engineer verifies it before it closes."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={buttonSecondary} onClick={onClose}>Cancel</button>
          <button type="button" className={buttonPrimary} disabled={busy || title.trim().length < 3} onClick={() => void submit()}>{busy ? "Raising..." : "Raise NCR"}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div><label className={label} htmlFor="n-title">What is wrong</label><input id="n-title" className={inputClass} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Honeycombing on column C4, east face" /></div>
        <div><label className={label} htmlFor="n-desc">Details</label><textarea id="n-desc" rows={3} maxLength={2000} className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Where, how big, what the drawing or specification requires" /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className={label} htmlFor="n-sev">Class</label><select id="n-sev" className={inputClass} value={severity} onChange={(event) => setSeverity(event.target.value as QaSeverity)}>{severities.map((s) => <option key={s} value={s}>{qaSeverityLabels[s]}</option>)}</select></div>
          <div><label className={label} htmlFor="n-cat">Category</label><select id="n-cat" className={inputClass} value={category} onChange={(event) => setCategory(event.target.value as DefectCategory)}>{categories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}</select></div>
          <div><label className={label} htmlFor="n-trade">Trade</label><select id="n-trade" className={inputClass} value={trade} onChange={(event) => setTrade(event.target.value as Trade)}>{trades.map((t) => <option key={t} value={t}>{tradeLabels[t]}</option>)}</select></div>
        </div>
        <p className="-mt-2 text-xs text-fg-muted">{qaSeverityHelp[severity]} Default deadline: {defaultDueDate(severity, today)}.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="n-who">Responsible foreman</label><select id="n-who" className={inputClass} value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Not assigned yet</option>{foremen.map((f) => <option key={f.user_id} value={f.user_id}>{f.full_name}</option>)}</select></div>
          <div><label className={label} htmlFor="n-due">Deadline (optional)</label><input id="n-due" type="date" min={today} className={inputClass} value={due} onChange={(event) => setDue(event.target.value)} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={label} htmlFor="n-ref">Standard / clause</label><input id="n-ref" className={inputClass} maxLength={200} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="e.g. NSCP 2015, section and clause" /></div>
          <div><label className={label} htmlFor="n-pin">Linked pin (optional)</label><select id="n-pin" className={inputClass} value={pinId} onChange={(event) => setPinId(event.target.value)}><option value="">No pin</option>{pins.filter((pin) => pin.category !== "note").map((pin) => <option key={pin.id} value={pin.id}>{pin.title}</option>)}</select></div>
        </div>
      </div>
    </Modal>
  )
}

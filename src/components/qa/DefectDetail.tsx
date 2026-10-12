import { useEffect, useState } from "react"
import Modal from "../Modal"
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import { Chip, EvidenceStrip, SeverityChip } from "./QaBits"
import { useConfirm } from "../../lib/confirm"
import { printHtml } from "../../lib/printReport"
import {
  categories, categoryLabels, defaultDueDate, defectStatusLabels, defectTone, dueState, dueText, qaActions, qaSeverityHelp, qaSeverityLabels, refNumber, severities, tradeLabels, useDefectEvents, useQaPhotos,
  type Defect, type DefectCategory, type DefectStatus, type QaSeverity,
} from "../../lib/qa"
import { defectReportHtml } from "../../lib/qaPrint"
import { useToast } from "../../lib/toast"

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "-")
const label = "mb-1 block text-xs font-extrabold uppercase tracking-wider text-fg-muted"
const dueTone = { overdue: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200", due_soon: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200", ok: "bg-surface-muted text-fg-muted", none: "bg-surface-muted text-fg-muted", closed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" }
const statusWord = (status: string | null) => (status && status in defectStatusLabels ? defectStatusLabels[status as DefectStatus] : "-")
const eventWord = (kind: string, from: string | null, to: string | null) => (kind === "status" ? `${statusWord(from)} to ${statusWord(to)}` : kind === "raised" ? "Raised" : kind === "edited" ? "Edited" : kind === "rejected" ? "Sent back by the engineer" : "Closed")

// One non-conformance report (NCR): what is wrong, who must fix it by when, the contractor's corrective / preventive action, the
// engineer's verification, evidence photos and the history. The foreman works it; the engineer edits and verifies it.
export default function DefectDetail({
  defect,
  project,
  foremen,
  today,
  canWork,
  canVerify,
  nameOf,
  onClose,
  onChanged,
  onOpenInspection,
}: {
  defect: Defect
  project: { id: string; name: string; code: string; location?: string | null }
  foremen: Array<{ user_id: string; full_name: string }>
  today: string
  canWork: boolean
  canVerify: boolean
  nameOf: (id: string | null) => string
  onClose: () => void
  onChanged: () => void | Promise<void>
  onOpenInspection?: (inspectionId: string) => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const { events, reload: reloadEvents } = useDefectEvents(defect.id)
  const { photos, reload: reloadPhotos } = useQaPhotos({ defectId: defect.id })
  const [root, setRoot] = useState(defect.root_cause ?? "")
  const [corrective, setCorrective] = useState(defect.corrective_action ?? "")
  const [preventive, setPreventive] = useState(defect.preventive_action ?? "")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [edit, setEdit] = useState({ title: defect.title, description: defect.description ?? "", category: defect.category as DefectCategory, severity: defect.severity as QaSeverity, reference: defect.reference ?? "", assignedTo: defect.assigned_to ?? "", due: defect.due_date?.slice(0, 10) ?? "" })

  useEffect(() => {
    setRoot(defect.root_cause ?? "")
    setCorrective(defect.corrective_action ?? "")
    setPreventive(defect.preventive_action ?? "")
  }, [defect.root_cause, defect.corrective_action, defect.preventive_action, defect.status])

  const ref = refNumber("ncr", defect.number)
  const due = dueState(defect, today)
  const closed = defect.status === "closed"
  const working = canWork && (defect.status === "open" || defect.status === "in_progress")
  const refresh = async () => {
    await Promise.all([onChanged(), reloadEvents()])
  }

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>, failure: string, success: string, detail?: string) => {
    setBusy(true)
    const outcome = await action()
    setBusy(false)
    if (!outcome.ok) return toast.error(failure, outcome.message)
    toast.success(success, detail)
    setNote("")
    await refresh()
  }

  const startWork = () => run(() => qaActions.updateDefect({ id: defect.id, status: "in_progress", rootCause: root, corrective, preventive }), "Could not start", "Work started", ref)
  const saveNotes = () => run(() => qaActions.updateDefect({ id: defect.id, status: "in_progress", rootCause: root, corrective, preventive }), "Not saved", "Notes saved")
  const send = () => run(() => qaActions.updateDefect({ id: defect.id, status: "for_verification", rootCause: root, corrective, preventive }), "Cannot send for verification yet", "Sent for verification", "The engineer is notified")
  const close = async () => {
    if (!(await confirm({ title: `Close ${ref}?`, message: "Closing confirms you have seen the corrected work and it meets the requirement. It cannot be reopened.", confirmLabel: "Close NCR" }))) return
    await run(() => qaActions.verifyDefect(defect.id, true, note.trim()), "Not closed", `${ref} closed`)
  }
  const sendBack = () => run(() => qaActions.verifyDefect(defect.id, false, note.trim()), "Not sent back", "Sent back to the contractor", "Say what is still wrong in the note")
  const saveEdit = async () => {
    await run(() => qaActions.editDefect({ id: defect.id, title: edit.title.trim(), description: edit.description.trim(), category: edit.category, severity: edit.severity, reference: edit.reference.trim(), assignedTo: edit.assignedTo || null, due: edit.due || null }), "Not saved", "Changes saved")
    setEditing(false)
  }
  const print = () => {
    if (!printHtml(defectReportHtml({ defect, events, project, nameOf, today }))) toast.error("Could not open the print dialog")
  }

  const footer = (
    <>
      <button type="button" className={buttonSecondary} onClick={print}>Print / PDF</button>
      {canVerify && !closed && !editing ? <button type="button" className={buttonSecondary} onClick={() => setEditing(true)}>Edit</button> : null}
      {working && defect.status === "open" ? <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void startWork()}>Start work</button> : null}
      {working && defect.status === "in_progress" ? (
        <>
          <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void saveNotes()}>Save notes</button>
          <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void send()}>Send for verification</button>
        </>
      ) : null}
      <button type="button" className={buttonSecondary} onClick={onClose}>Close window</button>
    </>
  )

  return (
    <Modal title={`${ref}  ${defect.title}`} description={`${tradeLabels[defect.trade]} • ${categoryLabels[defect.category]}`} size="xl" onClose={onClose} footer={footer}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={defectTone[defect.status]}>{defectStatusLabels[defect.status]}</Chip>
          <SeverityChip severity={defect.severity} />
          <Chip tone={dueTone[due.state]}>{dueText(defect, today)}</Chip>
          {defect.inspection_id && onOpenInspection ? <button type="button" onClick={() => onOpenInspection(defect.inspection_id as string)} className="text-xs font-bold text-brand-text underline">View the inspection</button> : null}
        </div>

        {editing ? (
          <div className="space-y-3 rounded-xl border border-brand p-3">
            <div><label className={label} htmlFor="d-title">Title</label><input id="d-title" className={inputClass} maxLength={160} value={edit.title} onChange={(event) => setEdit({ ...edit, title: event.target.value })} /></div>
            <div><label className={label} htmlFor="d-desc">Description</label><textarea id="d-desc" rows={3} maxLength={2000} className={inputClass} value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className={label} htmlFor="d-cat">Category</label><select id="d-cat" className={inputClass} value={edit.category} onChange={(event) => setEdit({ ...edit, category: event.target.value as DefectCategory })}>{categories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}</select></div>
              <div><label className={label} htmlFor="d-sev">Class</label><select id="d-sev" className={inputClass} value={edit.severity} onChange={(event) => setEdit({ ...edit, severity: event.target.value as QaSeverity, due: edit.due || defaultDueDate(event.target.value as QaSeverity, today) })}>{severities.map((s) => <option key={s} value={s}>{qaSeverityLabels[s]}</option>)}</select></div>
              <div><label className={label} htmlFor="d-due">Due date</label><input id="d-due" type="date" className={inputClass} value={edit.due} onChange={(event) => setEdit({ ...edit, due: event.target.value })} /></div>
            </div>
            <p className="text-xs text-fg-muted">{qaSeverityHelp[edit.severity]}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={label} htmlFor="d-ref">Standard / clause</label><input id="d-ref" className={inputClass} maxLength={200} value={edit.reference} onChange={(event) => setEdit({ ...edit, reference: event.target.value })} placeholder="e.g. NSCP 2015, section and clause" /></div>
              <div><label className={label} htmlFor="d-who">Responsible foreman</label><select id="d-who" className={inputClass} value={edit.assignedTo} onChange={(event) => setEdit({ ...edit, assignedTo: event.target.value })}><option value="">Not assigned</option>{foremen.map((f) => <option key={f.user_id} value={f.user_id}>{f.full_name}</option>)}</select></div>
            </div>
            <div className="flex justify-end gap-2"><button type="button" className={buttonSecondary} onClick={() => setEditing(false)}>Cancel</button><button type="button" className={buttonPrimary} disabled={busy || edit.title.trim().length < 3} onClick={() => void saveEdit()}>Save changes</button></div>
          </div>
        ) : (
          <>
            {defect.description ? <p className="whitespace-pre-wrap text-sm">{defect.description}</p> : null}
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {([["Raised by", `${nameOf(defect.raised_by)} • ${when(defect.raised_at)}`], ["Responsible", nameOf(defect.assigned_to)], ["Requirement", defect.reference || "-"], ["Due", defect.due_date ? new Date(defect.due_date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric" }) : "-"]] as const).map(([term, value]) => (
                <div key={term}><dt className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{term}</dt><dd className="font-semibold">{value}</dd></div>
              ))}
            </dl>
          </>
        )}

        <section aria-label="Corrective and preventive action" className="rounded-xl border border-line p-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">Contractor's response (corrective and preventive action)</h3>
          {working ? (
            <div className="mt-2 space-y-3">
              <div><label className={label} htmlFor="d-root">Root cause</label><textarea id="d-root" rows={2} maxLength={1000} className={inputClass} value={root} onChange={(event) => setRoot(event.target.value)} placeholder="Why did it happen? (method, material, supervision, drawing...)" /></div>
              <div><label className={label} htmlFor="d-fix">Corrective action taken</label><textarea id="d-fix" rows={3} maxLength={2000} className={inputClass} value={corrective} onChange={(event) => setCorrective(event.target.value)} placeholder="What was done to fix this item (at least 10 characters)" /></div>
              <div><label className={label} htmlFor="d-prev">Preventive action</label><textarea id="d-prev" rows={2} maxLength={1000} className={inputClass} value={preventive} onChange={(event) => setPreventive(event.target.value)} placeholder="What will stop it happening again?" /></div>
              {defect.severity !== "minor" ? <p className="text-xs font-bold text-amber-800 dark:text-amber-300">A photo of the corrected work is required before a {defect.severity} item can be sent for verification.</p> : null}
            </div>
          ) : (
            <dl className="mt-2 space-y-2 text-sm">
              {([["Root cause", defect.root_cause], ["Corrective action", defect.corrective_action], ["Preventive action", defect.preventive_action]] as const).map(([term, value]) => (
                <div key={term}><dt className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{term}</dt><dd className="whitespace-pre-wrap">{value || "-"}</dd></div>
              ))}
            </dl>
          )}
          <div className="mt-3">
            <p className={label}>Evidence</p>
            <EvidenceStrip projectId={defect.project_id} photos={photos} target={{ defectId: defect.id }} canAdd={!closed && (canWork || canVerify)} canRemove={() => !closed} onChanged={reloadPhotos} label={`${ref} evidence`} />
          </div>
        </section>

        {canVerify && defect.status === "for_verification" ? (
          <section aria-label="Verification" className="rounded-xl border border-brand p-3">
            <h3 className="text-sm font-extrabold">Verify the corrected work</h3>
            <p className="mt-1 text-xs text-fg-muted">Inspect the work and the photos. Close the NCR if it now meets the requirement, or send it back with what is still wrong.</p>
            <label className="sr-only" htmlFor="d-note">Verification note</label>
            <textarea id="d-note" rows={2} maxLength={1000} className={`${inputClass} mt-2`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Verification note (at least 5 characters)" />
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button type="button" className={buttonSecondary} disabled={busy || note.trim().length < 5} onClick={() => void sendBack()}>Send back</button>
              <button type="button" className={buttonPrimary} disabled={busy || note.trim().length < 5} onClick={() => void close()}>Close NCR</button>
            </div>
          </section>
        ) : null}
        {closed && defect.closing_note ? <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-900/30 dark:text-green-100"><strong>Closed by {nameOf(defect.closed_by)} • {when(defect.closed_at)}:</strong> {defect.closing_note}</p> : null}

        <section aria-label="History">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">History</h3>
          <ol className="space-y-1.5 border-l-2 border-line pl-4 text-sm">
            {events.map((event) => (
              <li key={event.id} className="relative">
                <span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
                <span className="font-semibold">{eventWord(event.kind, event.from_status, event.to_status)}</span>
                <span className="text-fg-muted"> • {nameOf(event.actor_id)} • {when(event.created_at)}</span>
                {event.note ? <p className="whitespace-pre-wrap text-fg-muted">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Modal>
  )
}

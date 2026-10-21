import { useState } from "react"
import { PhotoGrid } from "../PhotoGallery"
import { inputClass } from "../ui/PageParts"
import { formatStamp } from "../../lib/blueprints"
import { submittedChecklistItems } from "../../lib/qaChecklistModel"
import type { WorkQaSubmission } from "../../lib/qaAttemptsModel"
import { inspectionStatusLabels, inspectionTone, type Inspection } from "../../lib/qa"
import { irRef, itemAttempts } from "../../lib/workItemModel"

// Read the immutable request snapshots, never today's editable checklist or another item's evidence.
export default function SubmittedEvidence({ itemId, pinId, submissions, inspections, loading, error, nameOf }: {
  itemId: string
  pinId: string
  submissions: WorkQaSubmission[]
  inspections: Inspection[]
  loading: boolean
  error?: string
  nameOf: (id: string | null) => string
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const rows = itemAttempts(itemId, submissions.filter(row => row.pin_id === pinId), inspections)
  const selected = rows.find(row => row.submission.id === selectedId) ?? rows[rows.length - 1]
  if (loading) return <p role="status" className="text-sm text-fg-muted">Loading submitted evidence…</p>
  if (error) return <p role="alert" className="text-sm text-danger-fg">{error}</p>
  if (!selected) return <p role="status" className="text-sm text-fg-muted">No submitted evidence yet. Photos and remarks will appear here after a QA request is submitted.</p>

  const { submission, inspection, label } = selected
  const checklist = submittedChecklistItems(submission, itemId)[0]
  const photos = submission.photos_snapshot.filter(photo => photo.checklist_item_id === itemId)
  const request = inspection ? irRef(inspection.number) : "Recorded request"
  return <section className="min-w-0 space-y-4 rounded-xl border border-line p-4" aria-label="Submitted evidence">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-extrabold">Submitted evidence</h3><p className="mt-1 text-xs text-fg-muted">Photos and remarks saved with each request. Later corrections do not change them.</p></div>
      {rows.length > 1 && <label className="block w-full space-y-1 text-xs font-bold sm:max-w-sm">Request
        <select aria-label="Evidence request" className={inputClass} value={submission.id} onChange={event => setSelectedId(event.target.value)}>
          {[...rows].reverse().map(row => <option key={row.submission.id} value={row.submission.id}>{row.label} · {row.inspection ? irRef(row.inspection.number) : "Recorded request"} · {formatStamp(row.submission.submitted_at)}</option>)}
        </select>
      </label>}
    </div>
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2"><strong>{label} · {request}</strong>{inspection && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${inspectionTone[inspection.status]}`}>{inspectionStatusLabels[inspection.status]}</span>}</div>
      <p className="text-xs text-fg-muted">Submitted {formatStamp(submission.submitted_at)} · {nameOf(submission.submitted_by)}</p>
    </div>
    <div className="rounded-lg bg-surface-muted p-3 text-sm">
      <h4 className="font-bold">Foreman remark</h4>
      <p className="whitespace-pre-wrap break-words">{checklist?.remark || "No Foreman remark recorded for this request."}</p>
      {checklist?.remark_at && <p className="mt-1 text-xs text-fg-muted">Remark saved {formatStamp(checklist.remark_at)}</p>}
    </div>
    <div className="space-y-2"><h4 className="text-sm font-bold">Submitted photos · {photos.length}</h4>
      <PhotoGrid bucket="pin-photos" photos={photos.map(photo => ({ ...photo, label: `${request} evidence`, requestLabel: `${label} · ${request}`, recordState: "snapshot", uploaderName: nameOf(photo.uploaded_by ?? null), checklist }))} emptyHint="No photos were saved with this request." />
    </div>
  </section>
}

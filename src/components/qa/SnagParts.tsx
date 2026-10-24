import { useState } from "react"
import Modal from "../Modal"
import { buttonSecondary } from "../ui/PageParts"
import { Chip } from "./QaBits"
import OpenOnBlueprint from "../OpenOnBlueprint"
import { useSignedUrl } from "../../lib/blueprints"
import { fixStageText, refNumber, snagStatusLabels, snagTone, urgencyLabels } from "../../lib/qaModel"
import { useProjectWork } from "../../lib/projectWork"
import { useSnags, useSnagPhotos, type Snag, type SnagPhoto } from "../../lib/snags"
import IssuePhotoEditor from "../issues/IssuePhotoEditor"
import { MarkupLayer } from "../issues/MarkupLayer"

function Thumb({ photo, className }: { photo: SnagPhoto; className: string }) {
  const [height, setHeight] = useState(750)
  const { url, failed } = useSignedUrl("snag-photos", photo.path)
  if (failed) return <div className={`${className} flex items-center justify-center bg-surface-muted text-[11px] text-fg-muted`}>Unavailable</div>
  if (!url) return <div className={`${className} skeleton`} aria-hidden="true" />
  return <div className={`relative ${className}`}><img src={url} alt={photo.caption || "Photo of the reported problem"} loading="lazy" onLoad={event => setHeight(1000 * event.currentTarget.naturalHeight / event.currentTarget.naturalWidth)} className="h-full w-full object-contain" /><svg viewBox={`0 0 1000 ${height}`} className="pointer-events-none absolute inset-0 h-full w-full"><MarkupLayer items={photo.annotations ?? []} height={height} /></svg></div>
}

// Photos attached to a client report, with a larger viewer.
export function SnagPhotoStrip({ photos }: { photos: SnagPhoto[] }) {
  const [viewing, setViewing] = useState<SnagPhoto | null>(null)
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((photo, index) => (
        <button key={photo.id} type="button" onClick={() => setViewing(photo)} aria-label={`View photo ${index + 1}`} className="overflow-hidden rounded-lg border border-line hover:ring-2 hover:ring-brand"><Thumb photo={photo} className="h-20 w-20" /></button>
      ))}
      {viewing ? (
        <SavedSnagPhoto key={viewing.id} photo={viewing} onClose={() => setViewing(null)} />
      ) : null}
    </div>
  )
}

function SavedSnagPhoto({ photo, onClose }: { photo: SnagPhoto; onClose: () => void }) {
  const { url, failed } = useSignedUrl("snag-photos", photo.path)
  if (!url) return <Modal title="Report photo" onClose={onClose} footer={<button type="button" className={buttonSecondary} onClick={onClose}>Close</button>}><p>{failed ? "Photo unavailable" : "Loading photo…"}</p></Modal>
  return <IssuePhotoEditor photos={[{ id: photo.id, src: url, annotations: photo.annotations ?? [], caption: photo.caption || "Reported problem" }]} readOnly onClose={onClose} />
}

const reportedAt = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// The client's own report: status in plain words, the engineer's answer, the linked pin and the original photos.
// Used on Report a problem and in the client's pin panel (onPlan hides the plan link there).
export function ClientSnagModal({ snag, onClose, onWithdraw, onPlan = false }: { snag: Snag; onClose: () => void; onWithdraw?: () => void; onPlan?: boolean }) {
  const { photos, error, reload } = useSnagPhotos(snag.id)
  const work = useProjectWork(snag.project_id)
  const pin = work.pins.find(row => row.id === snag.pin_id)
  return (
    <Modal title={`${refNumber("snag", snag.number)}  ${snag.title}`} description={`${reportedAt(snag.created_at)} • ${urgencyLabels[snag.urgency]}${snag.location ? ` • ${snag.location}` : ""}`} size="lg" onClose={onClose}
      footer={<>{snag.status === "submitted" && onWithdraw ? <button type="button" className={buttonSecondary} onClick={onWithdraw}>Withdraw</button> : null}<button type="button" className={buttonSecondary} onClick={onClose}>Close</button></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Chip tone={snagTone[snag.status]}>{snagStatusLabels[snag.status]}</Chip><span className="text-sm">{fixStageText(snag.status, snag.fix_stage)}</span></div>
        <p className="text-xs font-semibold text-fg-muted">{pin ? `Work pin: ${pin.title}` : snag.pin_id ? "Linked work pin unavailable" : "Project-wide report (not one pin)"}</p>
        {snag.description ? <p className="whitespace-pre-wrap text-sm">{snag.description}</p> : null}
        {snag.response ? <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm"><strong>The engineer wrote:</strong> {snag.response}</p> : null}
        {pin && !onPlan ? <OpenOnBlueprint projectId={snag.project_id} pinId={pin.id} sheetId={pin.blueprint_id} section="issues" label={`Open on blueprint: ${pin.title}`} /> : null}
        {error ? <p role="alert" className="text-sm text-danger-fg">{error} <button type="button" onClick={() => void reload()} className="underline">Retry photos</button></p> : null}
        {photos.length ? <SnagPhotoStrip photos={photos} /> : null}
      </div>
    </Modal>
  )
}

// Keep the client's original annotated problem visible alongside the Foreman's
// separate correction evidence in the NCR; never copy/flatten/replace originals.
export function LinkedClientReportEvidence({ projectId, defectId }: { projectId: string; defectId: string }) {
  const { snags, loading, error } = useSnags(projectId)
  const report = snags.find(snag => snag.project_id === projectId && snag.defect_id === defectId)
  const { photos, error: photoError, reload } = useSnagPhotos(report?.id ?? null)
  if (loading) return <p className="text-xs text-fg-muted">Checking linked client report…</p>
  if (error) return <p role="alert" className="text-xs text-danger-fg">Could not check the linked client report.</p>
  if (!report) return null
  return <section aria-label="Original client problem report" className="space-y-3 rounded-xl border border-line bg-surface-muted/40 p-4">
    <div><h3 className="text-sm font-extrabold">Original client problem report</h3><p className="mt-1 text-xs text-fg-muted">{new Date(report.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · {report.location || "No location note"}</p></div>
    <p className="break-words text-sm font-bold">{report.title}</p>
    {report.description ? <p className="whitespace-pre-wrap break-words text-sm">{report.description}</p> : null}
    {photoError ? <p role="alert" className="text-xs text-danger-fg">{photoError} <button type="button" className="underline" onClick={() => void reload()}>Retry</button></p> : photos.length ? <SnagPhotoStrip photos={photos} /> : <p className="text-xs text-fg-muted">No client photos attached.</p>}
    <p className="text-xs text-fg-muted">Client annotations are preserved separately from original photos. Correction photos remain in the NCR evidence section.</p>
  </section>
}

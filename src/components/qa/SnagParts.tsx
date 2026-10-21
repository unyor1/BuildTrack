import { useState } from "react"
import Modal from "../Modal"
import { buttonSecondary } from "../ui/PageParts"
import { useSignedUrl } from "../../lib/blueprints"
import { useSnags, useSnagPhotos, type SnagPhoto } from "../../lib/snags"
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

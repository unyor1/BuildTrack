import { useRef, useState } from "react"
import PhotoViewer from "../PhotoViewer"
import { useSignedUrl } from "../../lib/blueprints"
import { removeQaPhoto, uploadQaPhoto, qaSeverityLabels, severityTone, type PhotoTarget, type QaPhoto, type QaSeverity } from "../../lib/qa"
import { useConfirm } from "../../lib/confirm"
import { errorText, useToast } from "../../lib/toast"
import { buttonSecondary } from "../ui/PageParts"
import { captureStamp, stampSummary, photoPreviewBlocked } from "../../lib/photoStamp"
import { useAuth } from "../../lib/auth"
import { useProjectTeam } from "../../lib/projects"

export function Chip({ tone, children, title }: { tone: string; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${tone}`}>{children}</span>
}

export const SeverityChip = ({ severity }: { severity: QaSeverity }) => <Chip tone={severityTone[severity]}>{qaSeverityLabels[severity]}</Chip>

export const HoldChip = () => (
  <Chip tone="bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/40 dark:text-fuchsia-200" title="Hold point: work may not go on until the engineer has passed this item">
    Hold point
  </Chip>
)

// Score with the pass mark drawn on the bar.
export function ScoreBar({ score, threshold, label = "Score" }: { score: number | null; threshold: number; label?: string }) {
  const value = score ?? 0
  const good = score !== null && score >= threshold
  return (
    <div role="img" aria-label={score === null ? `${label}: not judged yet` : `${label} ${score} percent, pass mark ${threshold} percent`}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-bold uppercase tracking-wider text-fg-muted">{label}</span>
        <span className="font-extrabold tabular-nums">{score === null ? "-" : `${score}%`} <span className="font-semibold text-fg-muted">/ pass mark {threshold}%</span></span>
      </div>
      <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-surface-muted">
        <div className={`h-full rounded-full transition-all ${score === null ? "" : good ? "bg-green-600" : "bg-red-600"}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${threshold}%` }} aria-hidden="true" />
      </div>
    </div>
  )
}

function Thumb({ photo, className }: { photo: QaPhoto; className: string }) {
  const { profile } = useAuth()
  const blocked = photoPreviewBlocked(profile?.role, photo)
  const { url, failed } = useSignedUrl("qa-evidence", blocked ? null : photo.path)
  if (blocked) return <div className={`${className} flex items-center justify-center bg-danger-soft p-1 text-[10px] text-danger-fg`}>Site/time check failed</div>
  if (failed) return <div className={`${className} flex items-center justify-center bg-surface-muted text-[11px] text-fg-muted`}>Unavailable</div>
  if (!url) return <div className={`${className} skeleton`} aria-hidden="true" />
  return <img src={url} alt={photo.caption ?? "Evidence photo"} loading="lazy" className={`${className} object-cover`} />
}

// Evidence photos for one item, inspection or defect: thumbnails with a viewer, and an add button when the person may add.
export function EvidenceStrip({
  projectId,
  photos,
  target,
  canAdd,
  canRemove,
  onChanged,
  label,
  compact = false,
}: {
  projectId: string
  photos: QaPhoto[]
  target: PhotoTarget
  canAdd: boolean
  canRemove?: (photo: QaPhoto) => boolean
  onChanged: () => void | Promise<void>
  label: string
  compact?: boolean
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const { team } = useProjectTeam(projectId)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<QaPhoto | null>(null)
  const size = compact ? "h-12 w-12" : "h-16 w-16"

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const stamp = await captureStamp() // the phone's time and (if allowed) position, checked against the site by the database
      for (const file of Array.from(files).slice(0, 6)) await uploadQaPhoto(projectId, target, file, undefined, stamp)
      toast.success(files.length > 1 ? "Photos added" : "Photo added")
      await onChanged()
    } catch (error) {
      toast.error("Photo not added", errorText(error))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  const remove = async (photo: QaPhoto) => {
    if (!(await confirm({ title: "Remove this photo?", message: "It is deleted from the evidence for good.", confirmLabel: "Remove", tone: "danger" }))) return
    const problem = await removeQaPhoto(photo)
    if (problem) return toast.error("Not removed", problem)
    setViewing(null)
    await onChanged()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {photos.map((photo) => (
        <button key={photo.id} type="button" onClick={() => setViewing(photo)} aria-label={`View photo: ${photo.caption ?? label}`} className="overflow-hidden rounded-lg border border-line transition hover:ring-2 hover:ring-brand">
          <Thumb photo={photo} className={size} />
        </button>
      ))}
      {stampSummary(photos) ? <p role="status" className="w-full rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">Check these photos: {stampSummary(photos)}.</p> : null}
      {canAdd ? (
        <>
          <button type="button" disabled={busy} onClick={() => input.current?.click()} aria-label={`Add a photo: ${label}`} className={`flex ${size} flex-col items-center justify-center rounded-lg border border-dashed border-line text-fg-muted transition hover:border-brand hover:bg-brand-soft hover:text-brand-text disabled:opacity-60`}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
            <span className="text-[11px] font-bold">{busy ? "..." : "Photo"}</span>
          </button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple hidden onChange={(event) => void add(event.target.files)} />
        </>
      ) : null}
      {viewing ? <PhotoViewer key={viewing.id} bucket="qa-evidence" photo={{...viewing,label,uploaderName:team.find(row=>row.user_id===viewing.uploaded_by)?.full_name}} onClose={()=>setViewing(null)} actions={canRemove?.(viewing) ? <button type="button" className={buttonSecondary} onClick={() => void remove(viewing)}>Remove</button> : null} /> : null}
    </div>
  )
}

import { useEffect, useRef, useState, type ReactNode } from "react"
import Modal from "./Modal"
import PhotoDetails from "./PhotoDetails"
import { MarkupLayer } from "./issues/IssuePhotoEditor"
import { useSignedUrl } from "../lib/blueprints"
import { useAuth } from "../lib/auth"
import { photoPreviewBlocked } from "../lib/photoStamp"
import type { GalleryPhoto } from "../lib/photoGalleryModel"
import { adjustPhotoZoom } from "../lib/photoGalleryModel"
import { buttonSecondary } from "./ui/PageParts"

export type PhotoBucket = "pin-photos" | "daily-photos" | "qa-evidence"

const arrow = "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-2xl font-bold leading-none text-white shadow-lg transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:hidden"

// One photo with zoom and details. In a gallery, ‹ › (or the ← → keys) step to the previous / next photo of the same list.
export default function PhotoViewer({ photo, bucket, onClose, actions, onPrev, onNext, position, detailsToggle = false, initialDetails = false }: {
  photo: GalleryPhoto; bucket: PhotoBucket; onClose: () => void; actions?: ReactNode
  onPrev?: () => void; onNext?: () => void; position?: string; detailsToggle?: boolean; initialDetails?: boolean
}) {
  const { profile } = useAuth()
  const blocked = photoPreviewBlocked(profile?.role, photo)
  const { url, failed } = useSignedUrl(bucket, blocked ? null : photo.path)
  const [zoom, setZoom] = useState(100)
  const [details, setDetails] = useState(!detailsToggle || initialDetails)
  // Saved markup (QA evidence) is drawn over the original; both letterbox the same way (object-contain = "meet").
  const markup = photo.annotations ?? []
  const [showMarkup, setShowMarkup] = useState(true)
  const [natural, setNatural] = useState<{ id: string; height: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => { setZoom(100); setShowMarkup(true) }, [photo.id])

  // Arrow keys move through the gallery unless the person is typing or another dialog sits on top of this one.
  const steps = useRef({ onPrev, onNext })
  steps.current = { onPrev, onNext }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      const dialogs = document.querySelectorAll("[data-bt-dialog]")
      if (frame.current && !dialogs[dialogs.length - 1]?.contains(frame.current)) return
      const step = event.key === "ArrowLeft" ? steps.current.onPrev : steps.current.onNext
      if (!step) return
      event.preventDefault()
      step()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return <Modal title={photo.caption || photo.label || "Photo and details"} size="2xl" onClose={onClose} footer={<>{actions}<button type="button" className={buttonSecondary} onClick={onClose}>Close photo</button></>}>
    <div className={`grid min-w-0 items-start gap-4 ${details ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,1fr)]" : ""}`}>
      <div ref={frame} className="min-w-0 space-y-2">
        <div role="group" aria-label="Photo zoom" className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonSecondary} aria-label="Zoom out" disabled={!url || blocked || zoom <= 100} onClick={() => setZoom(value => adjustPhotoZoom(value,-25))}>−</button>
          <span className="min-w-12 text-center text-sm font-bold" role="status">{zoom}%</span>
          <button type="button" className={buttonSecondary} aria-label="Zoom in" disabled={!url || blocked || zoom >= 300} onClick={() => setZoom(value => adjustPhotoZoom(value,25))}>+</button>
          <button type="button" className={buttonSecondary} disabled={!url || zoom === 100} onClick={() => setZoom(100)}>Fit photo</button>
          {markup.length ? <button type="button" className={buttonSecondary} aria-pressed={!showMarkup} disabled={!url || blocked} onClick={() => setShowMarkup(value => !value)}>{showMarkup ? "View original" : "Show markup"}</button> : null}
          {detailsToggle ? <button type="button" className={buttonSecondary + " !px-3"} aria-label="Photo details" title="Photo details" aria-expanded={details} onClick={() => setDetails(value => !value)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></svg></button> : null}
          {position ? <span className="ml-auto text-sm font-bold text-fg-muted" aria-live="polite">{position}</span> : null}
        </div>
        <div className="relative">
          {onPrev || onNext ? <>
            <button type="button" className={`${arrow} left-2`} aria-label="Previous photo" title="Previous photo (←)" disabled={!onPrev} onClick={onPrev}>‹</button>
            <button type="button" className={`${arrow} right-2`} aria-label="Next photo" title="Next photo (→)" disabled={!onNext} onClick={onNext}>›</button>
          </> : null}
          <div tabIndex={0} aria-label="Photo preview; scroll to pan when zoomed" className="max-h-[60vh] overflow-auto overscroll-contain rounded-xl border border-line bg-surface-muted">
            {blocked ? <p className="p-8 text-sm text-danger-fg">Image blocked: photo failed the site or time check.</p> : failed ? <p className="p-8 text-sm text-fg-muted">Photo unavailable.</p> : url ? <div className="relative" style={{width:`${zoom}%`}}>
              <img src={url} alt={photo.caption || photo.label} className="block w-full object-contain" style={{height:`${55*zoom/100}vh`}} onLoad={markup.length ? (event) => setNatural({ id: photo.id, height: 1000 * event.currentTarget.naturalHeight / event.currentTarget.naturalWidth }) : undefined} />
              {markup.length && showMarkup && natural?.id === photo.id ? <svg viewBox={`0 0 1000 ${natural.height}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true"><MarkupLayer items={markup} height={natural.height} /></svg> : null}
            </div> : <div className="skeleton h-64" aria-label="Loading photo" />}
          </div>
        </div>
        {zoom > 100 ? <p className="text-xs text-fg-muted">Scroll horizontally and vertically to inspect the zoomed photo.</p> : null}
      </div>
      {details ? <PhotoDetails photo={photo} bucket={bucket} /> : null}
    </div>
  </Modal>
}

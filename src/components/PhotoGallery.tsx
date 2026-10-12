import { useMemo, useState } from "react"
import Modal from "./Modal"
import { EmptyState, buttonSecondary } from "./ui/PageParts"
import { SkeletonCardGrid } from "./ui/Skeleton"
import { formatStamp, useSignedUrl, type Pin, type PinPhoto } from "../lib/blueprints"
import { useProjectPhotos } from "../lib/reports"

function Thumb({ photo, className }: { photo: PinPhoto; className: string }) {
  const { url, failed } = useSignedUrl("pin-photos", photo.path)
  if (failed) return <div className={`${className} flex items-center justify-center bg-surface-muted text-xs text-fg-muted`}>Photo unavailable</div>
  if (!url) return <div className={`${className} skeleton`} aria-hidden="true" />
  return <img src={url} alt={photo.caption ?? "Site photo"} loading="lazy" className={className} />
}

// Every photo attached to the project's pins, newest first, with a viewer. Photos are added from a pin (the foreman's Report dialog).
export default function PhotoGallery({ projectId, pins, loading: outerLoading = false, emptyHint }: { projectId: string | null; pins: Pin[]; loading?: boolean; emptyHint: string }) {
  const { photos, loading } = useProjectPhotos(projectId)
  const [viewing, setViewing] = useState<PinPhoto | null>(null)
  const pinTitle = useMemo(() => new Map(pins.map((pin) => [pin.id, pin.title])), [pins])

  if (loading || outerLoading) return <SkeletonCardGrid count={4} label="Loading photos" />
  if (photos.length === 0) return <EmptyState title="No photos yet">{emptyHint}</EmptyState>
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button type="button" onClick={() => setViewing(photo)} className="group block w-full overflow-hidden rounded-xl border border-line bg-surface text-left transition hover:shadow-md">
              <div className="overflow-hidden"><Thumb photo={photo} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" /></div>
              <span className="block px-3 py-2"><span className="block truncate text-sm font-semibold">{photo.caption || pinTitle.get(photo.pin_id) || "Site photo"}</span><span className="block truncate text-xs text-fg-muted">{pinTitle.get(photo.pin_id) ?? ""} • {formatStamp(photo.created_at)}</span></span>
            </button>
          </li>
        ))}
      </ul>
      {viewing ? (
        <Modal title={viewing.caption || pinTitle.get(viewing.pin_id) || "Site photo"} description={`${pinTitle.get(viewing.pin_id) ?? ""} • ${formatStamp(viewing.created_at)}`} size="xl" onClose={() => setViewing(null)} footer={<button type="button" className={buttonSecondary} onClick={() => setViewing(null)}>Close</button>}>
          <Thumb photo={viewing} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg" />
        </Modal>
      ) : null}
    </>
  )
}

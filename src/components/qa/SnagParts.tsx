import { useState } from "react"
import Modal from "../Modal"
import { buttonSecondary } from "../ui/PageParts"
import { useSignedUrl } from "../../lib/blueprints"
import type { SnagPhoto } from "../../lib/snags"

function Thumb({ photo, className }: { photo: SnagPhoto; className: string }) {
  const { url, failed } = useSignedUrl("snag-photos", photo.path)
  if (failed) return <div className={`${className} flex items-center justify-center bg-surface-muted text-[11px] text-fg-muted`}>Unavailable</div>
  if (!url) return <div className={`${className} skeleton`} aria-hidden="true" />
  return <img src={url} alt="Photo of the reported problem" loading="lazy" className={`${className} object-cover`} />
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
        <Modal title="Photo" size="xl" onClose={() => setViewing(null)} footer={<button type="button" className={buttonSecondary} onClick={() => setViewing(null)}>Close</button>}>
          <Thumb photo={viewing} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg" />
        </Modal>
      ) : null}
    </div>
  )
}

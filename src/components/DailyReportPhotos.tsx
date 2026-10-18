import { useRef, useState } from "react"
import { PhotoGrid, type GalleryPhoto } from "./PhotoGallery"
import { compressPhoto } from "../lib/blueprints"
import { useEvidencePhotos } from "../lib/dailyPhotos"
import { captureStamp, stampFields } from "../lib/photoStamp"
import { supabase } from "../lib/supabase"
import { useToast } from "../lib/toast"
import { useConfirm } from "../lib/confirm"

// Same limit as the database (prepare_daily_report_photo, 20261018172839).
const MAX_PHOTOS = 50

export default function DailyReportPhotos({ projectId, reportId, editable = false, ensureDraft, onBusy }: {
  projectId: string; reportId: string | null; editable?: boolean; ensureDraft?: () => Promise<string | null>; onBusy?: (busy: boolean) => void
}) {
  const { photos, loading, error, reload } = useEvidencePhotos(projectId, "daily", reportId)
  const latestReload = useRef(reload)
  latestReload.current = reload
  const [busy, setBusy] = useState(false)
  const working = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const toast = useToast()
  const confirm = useConfirm()
  const setWorking = (value: boolean) => { working.current = value; setBusy(value); onBusy?.(value) }
  const upload = async (files: FileList | null) => {
    if (!files?.length || working.current) return
    const selected = Array.from(files)
    const room = MAX_PHOTOS - photos.length
    if (selected.length > room) {
      if (input.current) input.current.value = ""
      if (camera.current) camera.current.value = ""
      return toast.error("Too many photos", room > 0 ? `This report can take ${room} more photo${room === 1 ? "" : "s"} (up to ${MAX_PHOTOS}). Choose fewer.` : `This report already has ${MAX_PHOTOS} photos.`)
    }
    setWorking(true)
    let added = 0
    try {
      if (!navigator.onLine) throw new Error("Connect to the internet to upload daily report photos. Your report can still be saved offline.")
      const id = reportId ?? await ensureDraft?.()
      if (!id) return
      const stamp = await captureStamp()
      setProgress({ done: 0, total: selected.length })
      for (const file of selected) {
        if (!file.type.startsWith("image/")) throw new Error("Choose an image file.")
        const blob = await compressPhoto(file)
        const path = `${projectId}/${id}/${crypto.randomUUID()}.jpg`
        const upload = await supabase.storage.from("daily-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false })
        if (upload.error) throw upload.error
        const insert = await supabase.from("daily_report_photos").insert({ report_id: id, project_id: projectId, path, ...stampFields(stamp) })
        if (insert.error) {
          // Only remove the unreferenced file. Storage RLS refuses removal if the insert actually committed.
          await supabase.storage.from("daily-photos").remove([path])
          throw insert.error
        }
        added++
        setProgress({ done: added, total: selected.length })
      }
      toast.success(added === 1 ? "Photo added" : `${added} photos added`)
    } catch (e) { toast.error(added ? `${added} of ${selected.length} photos added` : "Photo not added", e instanceof Error ? e.message : (e as { message?: string }).message ?? "Upload failed.") }
    finally { if (input.current) input.current.value = ""; if (camera.current) camera.current.value = ""; setProgress(null); setWorking(false); await latestReload.current() }
  }
  const remove = async (photo: GalleryPhoto) => {
    if (working.current || !(await confirm({ title: "Remove this photo?", message: "This draft photo will be removed.", confirmLabel: "Remove photo", tone: "danger" }))) return
    setWorking(true)
    try {
      const result = await supabase.from("daily_report_photos").delete().eq("id", photo.id).select("id")
      if (result.error) throw result.error
      if (!result.data?.length) throw new Error("Photo was not removed. Refresh and check your access.")
      const storage = await supabase.storage.from("daily-photos").remove([photo.path])
      if (storage.error) toast.error("Photo record removed", "The unused file could not be cleaned up.")
      else toast.success("Photo removed")
    } catch (e) { toast.error("Could not remove photo", (e as { message?: string }).message ?? "Please retry.") }
    finally { setWorking(false); await reload() }
  }
  return <section aria-label="Report photos" className="space-y-3">
    <h3 className="text-sm font-extrabold">Photos</h3>
    {editable ? <>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void upload(e.target.files)} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || loading || photos.length >= MAX_PHOTOS} onClick={() => input.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-muted disabled:opacity-60">Choose photos</button>
        <button type="button" disabled={busy || loading || photos.length >= MAX_PHOTOS} onClick={() => camera.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-muted disabled:opacity-60">Take photo</button>
        {progress ? <span role="status" className="text-xs font-bold text-brand-text">Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}…</span> : null}
      </div>
      <p className="text-xs text-fg-muted">{photos.length} of {MAX_PHOTOS} photos. Choose several at once from your gallery, or take them one by one. A new report is saved as a draft before uploading.</p>
    </> : null}
    {error ? <p role="alert" className="text-sm text-danger-fg">{error} <button type="button" onClick={() => void reload()} className="min-h-6 underline">Retry</button></p> : <PhotoGrid photos={photos} bucket="daily-photos" loading={loading} emptyHint="No photos for this report yet." onRemove={editable && !busy ? (photo) => void remove(photo) : undefined} />}
  </section>
}

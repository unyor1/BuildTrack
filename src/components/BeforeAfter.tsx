import { useEffect, useRef, useState } from "react"
import { formatStamp, useSignedUrl } from "../lib/blueprints"
import type { GalleryPhoto } from "../lib/photoGalleryModel"
import { adjustPhotoZoom } from "../lib/photoGalleryModel"
import { comparisonFitWidth } from "../lib/comparisonModel"
import { useAuth } from "../lib/auth"
import { photoPreviewBlocked } from "../lib/photoStamp"
import ComparisonCanvas from "./ComparisonCanvas"
import Modal from "./Modal"
import PhotoDetails from "./PhotoDetails"
import { buttonSecondary } from "./ui/PageParts"

type Bucket = "pin-photos" | "qa-evidence"
export type ComparePhoto = { path: string; at: string; caption?: string | null; photo?: GalleryPhoto }

// Enlarge the complete before/after overlay, retaining its divider and both photos' details.
export default function BeforeAfter({ bucket, before, after, labels = ["Before", "Latest"] }: { bucket: Bucket; before: ComparePhoto; after: ComparePhoto; labels?: [string, string] }) {
  const [split, setSplit] = useState(50)
  const [viewing, setViewing] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [fitWidth, setFitWidth] = useState(0)
  const viewport = useRef<HTMLDivElement>(null)
  const { profile } = useAuth()
  const firstBlocked = photoPreviewBlocked(profile?.role,before.photo ?? {})
  const lastBlocked = photoPreviewBlocked(profile?.role,after.photo ?? {})
  const first = useSignedUrl(bucket,firstBlocked ? null : before.path)
  const last = useSignedUrl(bucket,lastBlocked ? null : after.path)
  const blocked = firstBlocked || lastBlocked
  const ready = !blocked && Boolean(first.url && last.url)
  const open = () => { setZoom(100); setViewing(true) }

  useEffect(() => {
    const element=viewport.current
    if(!viewing || !element) return
    const measure=()=>setFitWidth(comparisonFitWidth(element.clientWidth,element.clientHeight))
    measure()
    const observer=new ResizeObserver(measure)
    observer.observe(element)
    return ()=>observer.disconnect()
  },[viewing])

  const metadata = (source:ComparePhoto,label:string):GalleryPhoto =>
    source.photo ?? {id:source.path,path:source.path,created_at:source.at,caption:source.caption ?? null,label}

  const comparison = (enlarge=false) => ready
    ? <ComparisonCanvas firstUrl={first.url!} lastUrl={last.url!} labels={labels} split={split} onSplit={setSplit} onEnlarge={enlarge ? open : undefined} />
    : blocked
      ? <p className="grid aspect-[4/3] place-items-center p-4 text-sm text-danger-fg">Comparison blocked: an image failed the site or time check.</p>
      : first.failed || last.failed
        ? <p className="grid aspect-[4/3] place-items-center text-sm text-fg-muted">The photos could not be loaded.</p>
        : <div className="skeleton aspect-[4/3]" aria-label="Loading comparison" />

  return <>
    <figure className="overflow-hidden rounded-xl border border-line bg-surface-muted">
      {comparison(true)}
      <figcaption className="space-y-2 px-3 py-2 text-xs text-fg-muted">
        <p><strong className="text-fg">{labels[0]}</strong> {formatStamp(before.at)} · <strong className="text-fg">{labels[1]}</strong> {formatStamp(after.at)}. Drag to compare. Click to enlarge the comparison.</p>
        <button type="button" className="rounded-lg border border-line bg-surface px-3 py-1.5 font-bold text-brand-text" disabled={!ready} onClick={open}>Enlarge comparison and details</button>
      </figcaption>
    </figure>
    {viewing ? <Modal title={labels[0]+" / "+labels[1]+" comparison"} description="Drag the divider to compare both photos. Zoom applies to the whole comparison." size="2xl" onClose={()=>setViewing(false)} footer={<button type="button" className={buttonSecondary} onClick={()=>setViewing(false)}>Close comparison</button>}>
      <div className="min-w-0 space-y-4">
        <div role="group" aria-label="Comparison zoom" className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonSecondary} aria-label="Zoom comparison out" disabled={!ready || zoom<=100} onClick={()=>setZoom(value=>adjustPhotoZoom(value,-25))}>−</button>
          <span className="min-w-12 text-center text-sm font-bold" role="status">{zoom}%</span>
          <button type="button" className={buttonSecondary} aria-label="Zoom comparison in" disabled={!ready || zoom>=300} onClick={()=>setZoom(value=>adjustPhotoZoom(value,25))}>+</button>
          <button type="button" className={buttonSecondary} disabled={zoom===100} onClick={()=>{setZoom(100);viewport.current?.scrollTo(0,0)}}>Fit comparison</button>
        </div>
        <div ref={viewport} tabIndex={0} aria-label="Enlarged before and after comparison; scroll to pan when zoomed" className="h-[60vh] overflow-auto overscroll-contain rounded-xl border border-line bg-surface-muted">
          <div className="mx-auto" style={{width:fitWidth ? fitWidth*zoom/100 : "100%"}}>{comparison()}</div>
        </div>
        <p className="text-xs text-fg-muted">Drag the divider, or focus it and use the arrow keys. At higher zoom, scroll to pan both photos together.</p>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <section aria-label={labels[0]+" photo details"} className="min-w-0 space-y-2"><h3 className="text-sm font-extrabold">{labels[0]}</h3><PhotoDetails bucket={bucket} photo={metadata(before,labels[0])} /></section>
          <section aria-label={labels[1]+" photo details"} className="min-w-0 space-y-2"><h3 className="text-sm font-extrabold">{labels[1]}</h3><PhotoDetails bucket={bucket} photo={metadata(after,labels[1])} /></section>
        </div>
      </div>
    </Modal> : null}
  </>
}

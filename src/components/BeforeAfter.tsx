import { useId, useState } from "react"
import { formatStamp, useSignedUrl } from "../lib/blueprints"

type Bucket = "pin-photos" | "qa-evidence"
export type ComparePhoto = { path: string; at: string; caption?: string | null }

// Drag (or use the arrow keys) to compare the first photo of a piece of work with the latest one: the state when it was reported
// against the state now. Both come from the same record (pin photos or NCR evidence), so the comparison is the evidence itself.
export default function BeforeAfter({ bucket, before, after, labels = ["Before", "Latest"] }: { bucket: Bucket; before: ComparePhoto; after: ComparePhoto; labels?: [string, string] }) {
  const [split, setSplit] = useState(50)
  const id = useId()
  const first = useSignedUrl(bucket, before.path)
  const last = useSignedUrl(bucket, after.path)
  const ready = first.url && last.url

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface-muted">
      <div className="relative aspect-[4/3] select-none">
        {ready ? (
          <>
            <img src={last.url ?? ""} alt={`${labels[1]}: ${after.caption ?? formatStamp(after.at)}`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            <img src={first.url ?? ""} alt={`${labels[0]}: ${before.caption ?? formatStamp(before.at)}`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} draggable={false} />
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${split}%` }} aria-hidden="true">
              <span className="absolute left-1/2 top-1/2 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-xs font-extrabold text-[#1c1722] shadow-lg">⇆</span>
            </div>
            <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{labels[0]}</span>
            <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">{labels[1]}</span>
          </>
        ) : first.failed || last.failed ? (
          <p className="grid h-full place-items-center text-sm text-fg-muted">The photos could not be loaded.</p>
        ) : (
          <div className="skeleton absolute inset-0 rounded-none" aria-hidden="true" />
        )}
        <label htmlFor={id} className="sr-only">Compare {labels[0].toLowerCase()} and {labels[1].toLowerCase()} photos</label>
        <input id={id} type="range" min={0} max={100} value={split} onChange={(event) => setSplit(Number(event.target.value))} disabled={!ready} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
      </div>
      <figcaption className="px-3 py-1.5 text-xs text-fg-muted">
        <span className="font-semibold text-fg">{labels[0]}</span> {formatStamp(before.at)} · <span className="font-semibold text-fg">{labels[1]}</span> {formatStamp(after.at)}. Drag to compare.
      </figcaption>
    </figure>
  )
}

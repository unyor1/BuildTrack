import { stampLabel, type StampedPhoto } from "../lib/photoStamp"

const tones = {
  good: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  warn: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100",
  bad: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  muted: "bg-surface-muted text-fg-muted",
}

// Small badge under a photo: where and when it was taken, as the database checked it. Renders nothing for photos from before the stamp.
export default function StampChip({ photo }: { photo: StampedPhoto }) {
  const label = stampLabel(photo)
  if (!label) return null
  return (
    <span title={label.detail} className={`inline-block max-w-full break-words rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-tight ${tones[label.tone]}`}>
      {label.text}
      <span className="sr-only">. {label.detail}</span>
    </span>
  )
}

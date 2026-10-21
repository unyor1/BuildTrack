import { useState } from "react"
import { useWorkerPhoto } from "../../lib/attendance"
import { workerInitials } from "../../lib/attendanceModel"

export default function WorkerPortrait({
  path,
  name,
}: {
  path: string | null
  name: string
}) {
  const url = useWorkerPhoto(path)
  const [failedUrl, setFailedUrl] = useState("")
  return (
    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-border bg-brand-soft">
      {url && url !== failedUrl ? (
        <img
          src={url}
          alt={`${name}'s profile`}
          className="h-full w-full object-contain"
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <div className="text-center">
          <span className="text-6xl font-extrabold text-brand">
            {workerInitials(name)}
          </span>
          <p className="mb-0 mt-4 text-xs text-fg-muted">
            Profile photo unavailable
          </p>
        </div>
      )}
    </div>
  )
}

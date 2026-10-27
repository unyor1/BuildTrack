import { useEffect } from "react"
import { useScanNotices } from "../../lib/scanNotices"
import { noticeDuration } from "../../lib/scanNoticeModel"
import { attendanceTime } from "../../lib/attendanceModel"

const tones = {
  ok: { box: "border-ok-fg bg-ok-soft", icon: "border-ok-fg text-ok-fg", mark: "✓", label: "Recorded" },
  warn: { box: "border-[light-dark(#b45309,#f6ad55)] bg-[light-dark(#fff7e6,#3a2a10)]", icon: "border-[light-dark(#b45309,#f6ad55)] text-[light-dark(#b45309,#f6ad55)]", mark: "!", label: "Not recorded again" },
  error: { box: "border-danger-fg bg-danger-soft", icon: "border-danger-fg text-danger-fg", mark: "✕", label: "Not recorded" },
}

// Large message for the worker standing at the scanner: acknowledgement for a recorded scan, a warning when they
// already timed in / out (repeat scan) and an error for a finger that is not registered. Closes by itself.
export default function ScanNoticePopup({ projectId }: { projectId: string }) {
  const { current, dismiss } = useScanNotices(projectId)
  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(dismiss, noticeDuration(current))
    return () => window.clearTimeout(timer)
  }, [current, dismiss])
  if (!current) return null
  const tone = tones[current.tone]
  return (
    <div className="pointer-events-none fixed inset-x-0 top-6 z-[950] flex justify-center px-4">
      <div
        role={current.tone === "ok" ? "status" : "alert"}
        aria-live={current.tone === "ok" ? "polite" : "assertive"}
        className={`pointer-events-auto flex w-full max-w-xl items-start gap-4 rounded-2xl border-2 p-5 text-fg shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)] ${tone.box}`}
      >
        <span aria-hidden="true" className={`grid h-14 w-14 shrink-0 place-items-center rounded-full border-[3px] bg-surface text-3xl font-black ${tone.icon}`}>
          {tone.mark}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{tone.label} · {attendanceTime(current.at)}</p>
          <p className="mt-1 text-2xl font-extrabold leading-tight">{current.title}</p>
          <p className="mt-2 text-base">{current.message}</p>
        </div>
        <button type="button" onClick={dismiss} className="min-h-11 shrink-0 rounded-xl border border-line bg-surface px-4 !text-sm !font-bold text-fg">
          OK
        </button>
      </div>
    </div>
  )
}

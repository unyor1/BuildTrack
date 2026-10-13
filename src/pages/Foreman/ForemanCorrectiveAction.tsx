import { useCallback, useEffect, useMemo, useState } from "react"
import { EmptyState, PageHead, buttonPrimary } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { severityChip, severityLabels, statusChip, statusLabels, type Pin } from "../../lib/blueprints"
import { useAuth } from "../../lib/auth"
import { isOverdue, manilaToday } from "../../lib/progress"
import { useProjects } from "../../lib/projects"
import { supabase } from "../../lib/supabase"
import { fetchAll } from "../../lib/paging"
import { useLiveReload } from "../../lib/realtime"
import ReportModal from "./ReportModal"
import type { ForemanPageProps } from "./types"

type Reason = { pin_id: string; note: string | null; created_at: string }

// Everything the engineer sent back or marked as a problem, with the engineer's reason, so nothing is missed.
export default function ForemanCorrectiveAction(_: ForemanPageProps) {
  const { profile } = useAuth()
  const { projects } = useProjects()
  const [pins, setPins] = useState<Pin[]>([])
  const [reasons, setReasons] = useState<Map<string, Reason>>(new Map())
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<Pin | null>(null)
  const today = manilaToday()

  const load = useCallback(async () => {
    const [pinResult, sentBack] = await Promise.all([
      fetchAll<Pin>((from, to) => supabase.from("pins").select("*").neq("category", "note").order("id").range(from, to)),
      fetchAll<{ pin_id: string }>((from, to) => supabase.from("pin_events").select("pin_id").eq("kind", "status").eq("from_status", "for_review").eq("to_status", "in_progress").order("id").range(from, to)),
    ])
    setFailed(pinResult.error)
    const all = pinResult.data.map((pin) => ({ ...pin, x: Number(pin.x), y: Number(pin.y) }))
    const returned = new Set(sentBack.data.map((row) => row.pin_id))
    const needed = all.filter((pin) => (pin.assigned_to === profile?.id || pin.assigned_to === null) && (pin.status === "issue" || (pin.status === "in_progress" && returned.has(pin.id))))
    setPins(needed)
    if (needed.length) {
      const { data } = await supabase.from("pin_events").select("pin_id,note,created_at").eq("kind", "comment").in("pin_id", needed.map((pin) => pin.id)).order("created_at", { ascending: false })
      const latest = new Map<string, Reason>()
      for (const row of (data as Reason[] | null) ?? []) if (!latest.has(row.pin_id) && /^(Sent back|Issue|Please fix):/.test(row.note ?? "")) latest.set(row.pin_id, row)
      setReasons(latest)
    } else setReasons(new Map())
    setLoading(false)
  }, [profile?.id])

  useLiveReload([{ table: "pins" }], () => void load())

  useEffect(() => {
    void load()
  }, [load])

  const projectName = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])

  return (
    <div className="foreman-page">
      <PageHead eyebrow="Fix list" title="Corrective actions" description="Work the engineer sent back and problems found on site. Fix them, add a photo, and send them for review again." />
      {failed ? <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">Could not load the list. Check your connection and refresh.</p> : null}
      {loading ? (
        <SkeletonList rows={4} label="Loading corrective actions" />
      ) : pins.length === 0 ? (
        <EmptyState title="Nothing to correct">When the engineer sends work back or marks a problem, it appears here and you get a notification.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {pins.map((pin) => {
            const reason = reasons.get(pin.id)
            return (
              <li key={pin.id} className={`rounded-xl border border-line border-l-4 bg-surface p-4 ${pin.status === "issue" ? "border-l-red-600" : "border-l-orange-500"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold">{pin.title}</p>
                    <p className="text-xs text-fg-muted">{projectName.get(pin.project_id) ?? "Project"}</p>
                  </div>
                  <span className="flex items-center gap-2 text-[11px]">
                    <span className={`rounded px-1.5 py-0.5 font-extrabold uppercase ${severityChip[pin.severity]}`}>{severityLabels[pin.severity]}</span>
                    <span className={`rounded-full px-2 py-0.5 font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
                    {isOverdue(pin, today) ? <span className="font-bold text-red-700 dark:text-red-300">Overdue</span> : null}
                  </span>
                </div>
                {reason?.note ? <p className="mt-3 rounded-lg bg-surface-muted p-3 text-sm"><span className="mb-0.5 block text-xs font-bold text-brand-text">Engineer's note</span>{reason.note.replace(/^(Sent back|Issue|Please fix):\s*/, "")}</p> : pin.description ? <p className="mt-3 text-sm text-fg-muted">{pin.description}</p> : null}
                <div className="mt-3 text-right"><button type="button" className={buttonPrimary + " !px-3 !py-1.5 !text-xs"} onClick={() => setOpen(pin)}>Fix and report</button></div>
              </li>
            )
          })}
        </ul>
      )}
      {open ? <ReportModal pin={open} onClose={() => setOpen(null)} onSaved={async () => { setOpen(null); await load() }} /> : null}
    </div>
  )
}

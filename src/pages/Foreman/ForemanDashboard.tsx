import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import AssignedProjects from "../../components/AssignedProjects"
import { EmptyState, PageHead, StatCard, buttonPrimary, buttonSecondary } from "../../components/ui/PageParts"
import { SkeletonCardGrid } from "../../components/ui/Skeleton"
import { categoryLabels, severityChip, severityLabels, statusChip, statusLabels, type Pin, type PinStatus } from "../../lib/blueprints"
import { useAuth } from "../../lib/auth"
import { useOfflineQueue } from "../../lib/offlineQueue"
import { isOverdue, manilaToday } from "../../lib/progress"
import { openProject, useProjects } from "../../lib/projects"
import { useQaLite } from "../../lib/qaLite"
import { dueState, dueText, qaSeverityLabels, refNumber, severityTone } from "../../lib/qaModel"
import { supabase } from "../../lib/supabase"
import { fetchAll } from "../../lib/paging"
import { useLiveReload } from "../../lib/realtime"
import ReportModal from "./ReportModal"
import type { ForemanPageProps } from "./types"

// The foreman's day: the pins assigned to them (or open to anyone), what the engineer sent back, and a one-tap report.
export default function ForemanDashboard({ onNavigate }: ForemanPageProps) {
  const { profile } = useAuth()
  const { projects } = useProjects()
  const { items: queued } = useOfflineQueue(profile?.id ?? null)
  const [pins, setPins] = useState<Pin[]>([])
  const [sentBack, setSentBack] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reporting, setReporting] = useState<Pin | null>(null)
  const today = manilaToday()
  const qa = useQaLite("foreman-dashboard")

  const load = useCallback(async () => {
    const [pinResult, eventResult] = await Promise.all([
      fetchAll<Pin>((from, to) => supabase.from("pins").select("*").neq("category", "note").order("id").range(from, to)),
      fetchAll<{ pin_id: string }>((from, to) => supabase.from("pin_events").select("pin_id").eq("kind", "status").eq("from_status", "for_review").eq("to_status", "in_progress").order("id").range(from, to)),
    ])
    setFailed(pinResult.error)
    setPins(pinResult.data.map((pin) => ({ ...pin, x: Number(pin.x), y: Number(pin.y) })))
    setSentBack(new Set(eventResult.data.map((event) => event.pin_id)))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])
  // The engineer verifies or sends work back: the foreman's list follows at once.
  useLiveReload([{ table: "pins" }], () => void load())

  // ?pin=<id> (from a QR code or a shared link) opens that pin's report dialog once.
  const wanted = useRef(new URLSearchParams(window.location.search).get("pin"))
  useEffect(() => {
    if (!wanted.current || loading) return
    const target = pins.find((item) => item.id === wanted.current)
    wanted.current = null
    if (target) setReporting(target)
    const url = new URL(window.location.href)
    url.searchParams.delete("pin")
    window.history.replaceState({}, "", url)
  }, [loading, pins])

  // Reports saved offline show at once with their new status, marked "waiting to send".
  const waitingStatus = useMemo(() => {
    const map = new Map<string, PinStatus>()
    for (const item of queued) if (item.kind === "pin_progress" && item.status === "pending") map.set(item.payload.pinId as string, item.payload.status as PinStatus)
    return map
  }, [queued])
  const mine = useMemo(() => pins.filter((pin) => pin.assigned_to === profile?.id || pin.assigned_to === null).map((pin) => (waitingStatus.has(pin.id) ? { ...pin, status: waitingStatus.get(pin.id) as PinStatus } : pin)), [pins, profile?.id, waitingStatus])
  const projectName = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects])
  const returned = mine.filter((pin) => pin.status === "in_progress" && sentBack.has(pin.id))
  const late = mine.filter((pin) => isOverdue(pin, today) && !returned.includes(pin) && pin.status !== "for_review")
  const doing = mine.filter((pin) => pin.status === "in_progress" && !returned.includes(pin) && !late.includes(pin))
  const todo = mine.filter((pin) => pin.status === "not_started" && !late.includes(pin))
  const waiting = mine.filter((pin) => pin.status === "for_review")
  const issues = mine.filter((pin) => pin.status === "issue")
  const doneCount = mine.filter((pin) => pin.status === "verified").length
  const first = (profile?.full_name || "Foreman").split(" ")[0]
  const myDefects = qa.defects.filter((row) => row.assigned_to === profile?.id && (row.status === "open" || row.status === "in_progress")).sort((x, y) => String(x.due_date).localeCompare(String(y.due_date)))
  const myInspections = qa.inspections.filter((row) => row.status === "requested" || row.status === "in_progress")

  const groups: Array<{ key: string; title: string; hint?: string; pins: Pin[]; tone?: string }> = [
    { key: "returned", title: "Sent back to you", hint: "The engineer asked for more work. Read the reason in the timeline.", pins: returned, tone: "border-l-orange-500" },
    { key: "late", title: "Overdue", pins: late, tone: "border-l-red-600" },
    { key: "issues", title: "Open issues", pins: issues, tone: "border-l-red-600" },
    { key: "doing", title: "In progress", pins: doing, tone: "border-l-amber-500" },
    { key: "todo", title: "Not started", pins: todo, tone: "border-l-sky-500" },
    { key: "waiting", title: "Waiting for the engineer", pins: waiting, tone: "border-l-fuchsia-600" },
  ]

  return (
    <div className="foreman-page">
      <PageHead
        eyebrow="Foreman"
        title={`Good day, ${first}`}
        description="Your work for today. Start a pin, add photos and tick the checklist, then send it to the engineer when it is done."
        actions={<button type="button" className={buttonSecondary} onClick={() => onNavigate("daily-work")}>Site plan</button>}
      />
      {failed ? <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">Could not load your work. Check your connection and refresh.</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="To do" value={loading ? "-" : todo.length + doing.length} tone="sky" note="Not started or in progress" />
        <StatCard label="Sent back" value={loading ? "-" : returned.length} tone={returned.length ? "amber" : "green"} note="Needs more work" />
        <StatCard label="Overdue" value={loading ? "-" : late.length} tone={late.length ? "red" : "green"} note="Past the deadline" />
        <StatCard label="Waiting / done" value={loading ? "-" : `${waiting.length} / ${doneCount}`} tone="green" note="For review / verified" />
      </div>

      {myDefects.length || myInspections.length ? (
        <section aria-label="Quality tasks" className="mb-6">
          <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Quality tasks <span className="text-sm font-semibold text-fg-muted">({myDefects.length + myInspections.length})</span></h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {myDefects.slice(0, 6).map((defect) => {
              const due = dueState(defect, today)
              return (
                <li key={defect.id} className={`rounded-xl border border-line border-l-4 bg-surface p-4 ${due.state === "overdue" ? "border-l-red-600" : "border-l-amber-500"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-extrabold leading-snug">{refNumber("ncr", defect.number)} {defect.title}</p>
                    <span className={`flex-none rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase ${severityTone[defect.severity]}`}>{qaSeverityLabels[defect.severity]}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold ${due.state === "overdue" ? "text-red-700 dark:text-red-300" : "text-fg-muted"}`}>{dueText(defect, today)}</span>
                    <button type="button" className={buttonPrimary + " !px-3 !py-1.5 !text-xs"} onClick={() => { window.history.pushState({}, "", `/foreman/issues?project=${defect.project_id}&defect=${defect.id}`); window.dispatchEvent(new PopStateEvent("popstate")) }}>Fix it</button>
                  </div>
                </li>
              )
            })}
            {myInspections.slice(0, 4).map((row) => (
              <li key={row.id} className="rounded-xl border border-line border-l-4 border-l-sky-500 bg-surface p-4">
                <p className="text-sm font-extrabold leading-snug">{refNumber("ir", row.number)} {row.title}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg-muted">{row.status === "requested" ? "Waiting for the engineer" : "Being inspected"}</span>
                  <button type="button" className={buttonSecondary + " !px-3 !py-1.5 !text-xs"} onClick={() => { window.history.pushState({}, "", `/foreman/quality-control?project=${row.project_id}&tab=inspections&inspection=${row.id}`); window.dispatchEvent(new PopStateEvent("popstate")) }}>View</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <SkeletonCardGrid count={3} label="Loading your work" />
      ) : mine.length === 0 ? (
        <EmptyState title="No work for you yet">When an engineer assigns a pin to you, it shows here and you get a notification.</EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.filter((group) => group.pins.length).map((group) => (
            <section key={group.key}>
              <h2 className="mb-1 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">{group.title} <span className="text-sm font-semibold text-fg-muted">({group.pins.length})</span></h2>
              {group.hint ? <p className="mb-2 pl-4 text-xs text-fg-muted">{group.hint}</p> : null}
              <ul className="grid gap-3 md:grid-cols-2">
                {group.pins.map((pin) => (
                  <li key={pin.id} className={`rounded-xl border border-line border-l-4 bg-surface p-4 ${group.tone ?? ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold leading-snug">{pin.title}</p>
                        <p className="text-xs text-fg-muted">{projectName.get(pin.project_id) ?? "Project"} • {categoryLabels[pin.category]}</p>
                      </div>
                      <span className={`flex-none rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase ${severityChip[pin.severity]}`}>{severityLabels[pin.severity]}</span>
                    </div>
                    {pin.description ? <p className="mt-2 line-clamp-2 text-xs text-fg-muted">{pin.description}</p> : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
                        {waitingStatus.has(pin.id) ? <span className="rounded-full bg-surface-muted px-2 py-0.5 font-semibold text-fg-muted">Waiting to send</span> : null}
                        {pin.due_date ? <span className={`font-semibold ${isOverdue(pin, today) ? "text-red-700 dark:text-red-300" : "text-fg-muted"}`}>{isOverdue(pin, today) ? "Overdue " : "Due "}{new Date(pin.due_date + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short" })}</span> : null}
                      </span>
                      <button type="button" className={buttonPrimary + " !px-3 !py-1.5 !text-xs"} onClick={() => setReporting(pin)}>{pin.status === "for_review" ? "View" : "Report"}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="mt-8"><AssignedProjects title="My projects" /></div>
      <p className="mt-2 text-xs text-fg-muted">Attendance (biometrics) is the one part still being connected. <button type="button" className="font-bold text-brand-text underline" onClick={() => projects[0] && openProject("foreman", projects[0].id)}>Open the site plan</button></p>

      {reporting ? <ReportModal pin={reporting} onClose={() => setReporting(null)} onSaved={async () => { setReporting(null); await load() }} /> : null}
    </div>
  )
}

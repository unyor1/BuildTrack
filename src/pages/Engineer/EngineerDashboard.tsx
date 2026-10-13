import { useEffect, useMemo, useState } from "react"
import GetStarted, { type SetupStep } from "../../components/GetStarted"
import { EmptyState, Meter, PageHead, StatCard, buttonPrimary, buttonSecondary } from "../../components/ui/PageParts"
import { SkeletonCardGrid } from "../../components/ui/Skeleton"
import { severityChip, severityLabels, type Pin } from "../../lib/blueprints"
import { useAuth } from "../../lib/auth"
import { followLink } from "../../lib/notifications"
import { daysBetween, isOverdue, manilaToday, summarize } from "../../lib/progress"
import { openProject, phaseLabels, statusColor, statusLabels, useProjects } from "../../lib/projects"
import { useQaLite, type QaLiteDefect, type QaLiteInspection } from "../../lib/qaLite"
import { refNumber, severityTone } from "../../lib/qaModel"
import { supabase } from "../../lib/supabase"
import { fetchAll } from "../../lib/paging"
import { useLiveReload } from "../../lib/realtime"
import type { EngineerPageProps } from "./types"

type LitePin = Pick<Pin, "id" | "project_id" | "title" | "status" | "severity" | "category" | "due_date" | "updated_at" | "assigned_to">

// Everything across the engineer's projects in one look: what needs a decision now, and how each project is going.
export default function EngineerDashboard({ onNavigate }: EngineerPageProps) {
  const { profile } = useAuth()
  const { projects, loading: projectsLoading } = useProjects()
  const [pins, setPins] = useState<LitePin[]>([])
  const [pinsLoading, setPinsLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const today = manilaToday()
  const qa = useQaLite("dashboard")
  const [tick, setTick] = useState(0)
  const [sheetCounts, setSheetCounts] = useState<Map<string, number> | null>(null)
  useLiveReload([{ table: "pins" }, { table: "pin_events" }], () => setTick((value) => value + 1))

  // Sheets per project, for the first-run checklist (a few rows, not pins).
  useEffect(() => {
    let active = true
    supabase.from("blueprints").select("project_id").then(({ data }) => {
      if (!active) return
      const counts = new Map<string, number>()
      for (const row of (data as Array<{ project_id: string }> | null) ?? []) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1)
      setSheetCounts(counts)
    })
    return () => {
      active = false
    }
  }, [tick])

  useEffect(() => {
    let active = true
    fetchAll<LitePin>((from, to) => supabase.from("pins").select("id,project_id,title,status,severity,category,due_date,updated_at,assigned_to").order("id").range(from, to)).then(({ data, error }) => {
      if (!active) return
      setFailed(error)
      setPins(data)
      setPinsLoading(false)
    })
    return () => {
      active = false
    }
  }, [tick])

  const totals = useMemo(() => summarize(pins, today), [pins, today])
  const projectName = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const loading = projectsLoading || pinsLoading
  const qaToDo = qa.inspections.filter((row) => row.status === "requested").length + qa.defects.filter((row) => row.status === "for_verification").length

  const attention = useMemo(() => {
    const items: Array<{ key: string; pin: LitePin | null; defect?: QaLiteDefect; inspection?: QaLiteInspection; reason: string; tone: string; path: string; weight: number }> = []
    for (const pin of pins) {
      if (pin.category === "note") continue
      if (pin.status === "for_review") items.push({ key: `r${pin.id}`, pin, reason: `Waiting for review ${Math.max(0, daysBetween(pin.updated_at.slice(0, 10), today))} d`, tone: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/40 dark:text-fuchsia-200", path: "verification", weight: 2 })
      else if (pin.status === "issue") items.push({ key: `i${pin.id}`, pin, reason: `${severityLabels[pin.severity]} issue`, tone: severityChip[pin.severity], path: "report-issue", weight: pin.severity === "critical" ? 4 : pin.severity === "high" ? 3 : 1 })
      else if (isOverdue(pin, today)) items.push({ key: `o${pin.id}`, pin, reason: `${-daysBetween(today, pin.due_date as string)} d overdue`, tone: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200", path: "progress", weight: 1 })
    }
    for (const defect of qa.defects) {
      const late = Boolean(defect.due_date) && (defect.due_date as string).slice(0, 10) < today
      if (defect.status === "for_verification") items.push({ key: `v${defect.id}`, pin: null, defect, reason: "Verify the repair", tone: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200", path: `qa?tab=defects&defect=${defect.id}`, weight: 3 })
      else if (late) items.push({ key: `d${defect.id}`, pin: null, defect, reason: `${refNumber("ncr", defect.number)} overdue`, tone: severityTone[defect.severity], path: `qa?tab=defects&defect=${defect.id}`, weight: defect.severity === "critical" ? 5 : 2 })
    }
    for (const row of qa.inspections) if (row.status === "requested") items.push({ key: `q${row.id}`, pin: null, inspection: row, reason: "Inspection requested", tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200", path: `qa?tab=inspections&inspection=${row.id}`, weight: 3 })
    return items.sort((a, b) => b.weight - a.weight).slice(0, 8)
  }, [pins, qa.defects, qa.inspections, today])

  const qaOf = (projectId: string) => qa.inspections.filter((row) => row.project_id === projectId && row.status === "requested").length + qa.defects.filter((row) => row.project_id === projectId && row.status === "for_verification").length
  const go = (path: string, projectId: string) => followLink(`/engineer/${path}?project=${projectId}`, projectId)
  const first = (profile?.full_name || "Engineer").split(" ")[0]

  // First-run checklist for the first project that is not fully set up. "Done" always comes from the data.
  const setup = useMemo(() => {
    if (loading || sheetCounts === null) return null
    for (const project of projects) {
      if (project.status === "completed" || project.status === "cancelled") continue
      const work = pins.filter((pin) => pin.project_id === project.id && pin.category !== "note")
      const steps: SetupStep[] = [
        { key: "sheet", title: "Upload the first plan sheet", text: "Export the drawing from AutoCAD as PDF or PNG and upload it. Pins are placed on this sheet.", done: (sheetCounts.get(project.id) ?? 0) > 0, action: { label: "Upload a sheet", run: () => go("project-blueprint", project.id) } },
        { key: "pins", title: "Mark the work on the plan", text: "Open the plan editor and drop a pin on each piece of work you will track.", done: work.length > 0, action: { label: "Open the plan", run: () => go("annotation", project.id) } },
        { key: "dates", title: "Give the pins due dates", text: "Due dates draw the planned line of the S-curve, so progress can be compared with the plan.", done: work.some((pin) => Boolean(pin.due_date)), action: { label: "Open the plan", run: () => go("annotation", project.id) } },
        { key: "foreman", title: "Assign the work to a foreman", text: "The foreman is notified and sees the pin in their list.", done: work.some((pin) => Boolean(pin.assigned_to)), action: { label: "Assignment board", run: () => go("assignments", project.id) } },
        { key: "verify", title: "Verify the first completed work", text: "When a foreman reports work as done, check it and approve it. Only verified work counts as progress.", done: work.some((pin) => pin.status === "verified"), action: { label: "Verification queue", run: () => go("verification", project.id) } },
      ]
      if (steps.some((step) => !step.done)) return { project, steps }
    }
    return null
  }, [loading, sheetCounts, projects, pins])

  return (
    <div className="engineer-page">
      <PageHead
        eyebrow="Engineer"
        title={`Good day, ${first}`}
        description="What needs your decision today, and how your projects are going."
        actions={<button type="button" className={buttonPrimary} onClick={() => onNavigate("projects")}>My projects</button>}
      />

      {failed ? <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">Could not load your pins. Check your connection and refresh.</p> : null}

      {setup ? <GetStarted title={`Set up ${setup.project.name}`} intro="Five steps take a new project from an empty plan to verified progress. Each one is ticked by the system when the work is really done." steps={setup.steps} /> : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Projects" value={loading ? "-" : projects.length} tone="brand" onClick={() => onNavigate("projects")} note="Assigned to you" />
        <StatCard label="Verified" value={loading ? "-" : `${totals.percentVerified}%`} tone="green" note={`${totals.verified} of ${totals.total} work pins`} />
        <StatCard label="To review" value={loading ? "-" : totals.for_review} tone="amber" note="Sent by foremen" />
        <StatCard label="Open issues" value={loading ? "-" : totals.issue} tone={totals.issue ? "red" : "green"} />
        <StatCard label="Overdue" value={loading ? "-" : totals.overdue} tone={totals.overdue ? "red" : "green"} note="Past their deadline" />
        <StatCard label="QA to action" value={loading || qa.loading ? "-" : qaToDo} tone={qaToDo ? "amber" : "green"} onClick={() => onNavigate("qa")} note="Inspections and repairs to verify" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section>
          <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Needs your attention</h2>
          {loading ? (
            <SkeletonCardGrid count={2} label="Loading" />
          ) : attention.length === 0 ? (
            <EmptyState title="Nothing needs you right now">Reviews, issues and late work show up here.</EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
              {attention.map(({ key, pin, defect, inspection, reason, tone, path }) => {
                const projectId = (pin ?? defect ?? inspection)!.project_id
                const title = pin ? pin.title : defect ? `${refNumber("ncr", defect.number)} ${defect.title}` : `${refNumber("ir", inspection!.number)} ${inspection!.title}`
                return (
                <li key={key}>
                  <button type="button" onClick={() => (pin ? go(path, projectId) : followLink(`/engineer/${path.replace("?", `?project=${projectId}&`)}`, projectId))} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-muted">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{title}</span>
                      <span className="text-xs text-fg-muted">{projectName.get(projectId)?.name ?? "Project"}</span>
                    </span>
                    <span className={`flex-none rounded px-2 py-0.5 text-xs font-bold ${tone}`}>{reason}</span>
                  </button>
                </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Your projects</h2>
          {loading ? (
            <SkeletonCardGrid count={2} label="Loading" />
          ) : projects.length === 0 ? (
            <EmptyState title="No projects yet">An administrator assigns projects to you. You will get a notification.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {projects.map((project) => {
                const own = summarize(pins.filter((pin) => pin.project_id === project.id), today)
                return (
                  <li key={project.id} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand-text">{project.code}</p>
                        <h3 className="truncate text-sm font-extrabold">{project.name}</h3>
                        <p className="text-xs text-fg-muted">{phaseLabels[project.phase]}</p>
                      </div>
                      <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[project.status]}`}>{statusLabels[project.status]}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1"><Meter value={own.percentVerified} tone="green" label={`${project.name} verified`} /></div>
                      <span className="text-sm font-extrabold">{own.percentVerified}%</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={buttonSecondary + " !px-3 !py-1 !text-xs"} onClick={() => openProject("engineer", project.id)}>Plans</button>
                      <button type="button" className={buttonSecondary + " !px-3 !py-1 !text-xs"} onClick={() => go("verification", project.id)}>Queue{own.for_review ? ` (${own.for_review})` : ""}</button>
                      <button type="button" className={buttonSecondary + " !px-3 !py-1 !text-xs"} onClick={() => go("progress", project.id)}>Progress</button>
                      <button type="button" className={buttonSecondary + " !px-3 !py-1 !text-xs"} onClick={() => go("qa", project.id)}>QA{qaOf(project.id) ? ` (${qaOf(project.id)})` : ""}</button>
                      <button type="button" className={buttonSecondary + " !px-3 !py-1 !text-xs"} onClick={() => go("assignments", project.id)}>Assign</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

import { useMemo } from "react"
import SCurveChart from "../../components/SCurveChart"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, Meter, PageHead, StatCard, buttonSecondary } from "../../components/ui/PageParts"
import { SkeletonCardGrid } from "../../components/ui/Skeleton"
import { statusDot, statusLabels, type Pin, type PinStatus } from "../../lib/blueprints"
import { followLink } from "../../lib/notifications"
import { STATUSES, byZone, daysBetween, downloadCsv, isDueSoon, isOverdue, scheduleElapsed, summarize, toCsv, type Totals } from "../../lib/progress"
import { disciplineLabels, getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import type { EngineerPageProps } from "./types"

export function StackedBar({ totals }: { totals: Totals }) {
  if (!totals.total) return <div className="h-2.5 rounded-full bg-surface-muted" aria-label="No pins yet" />
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-muted" role="img" aria-label={STATUSES.map((status) => `${totals[status]} ${statusLabels[status].toLowerCase()}`).join(", ")}>
      {STATUSES.filter((status) => totals[status] > 0).map((status) => (
        <span key={status} title={`${statusLabels[status]}: ${totals[status]}`} style={{ width: `${(totals[status] / totals.total) * 100}%`, background: statusDot[status] }} />
      ))}
    </div>
  )
}

export function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
      {STATUSES.map((status) => (
        <li key={status} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: statusDot[status] }} />{statusLabels[status]}</li>
      ))}
    </ul>
  )
}

// Where the project stands: share verified overall, per sheet (floor / zone) and per discipline, against the schedule.
export default function EngineerProgress({ onNavigate }: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const totals = useMemo(() => summarize(work.pins, work.today), [work.pins, work.today])
  const zones = useMemo(() => byZone(work.blueprints, work.pins, work.today), [work.blueprints, work.pins, work.today])
  const elapsed = work.project ? scheduleElapsed(work.project.start_date, work.project.end_date, work.today) : null
  const gap = elapsed === null ? null : totals.percentVerified - elapsed

  const disciplines = useMemo(() => {
    const groups = new Map<string, Pin[]>()
    for (const pin of work.pins) {
      const sheet = work.blueprints.find((bp) => bp.id === pin.blueprint_id)
      const key = pin.discipline ?? sheet?.discipline ?? "none"
      groups.set(key, [...(groups.get(key) ?? []), pin])
    }
    return [...groups.entries()].map(([key, pins]) => ({ key, label: key === "none" ? "Not set" : disciplineLabels[key as keyof typeof disciplineLabels], totals: summarize(pins, work.today) })).filter((row) => row.totals.total > 0)
  }, [work.pins, work.blueprints, work.today])

  const deadlines = useMemo(
    () =>
      work.pins
        .filter((pin) => isOverdue(pin, work.today) || isDueSoon(pin, work.today, 7))
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
        .slice(0, 8),
    [work.pins, work.today],
  )

  const exportCsv = () => {
    const header = ["Sheet", "Level", "Discipline", "Work pins", "Verified", "For review", "In progress", "Not started", "Issues", "Overdue", "% verified"]
    const rows = zones.map((zone) => [zone.title, zone.level ?? "", zone.discipline ? disciplineLabels[zone.discipline as keyof typeof disciplineLabels] : "", zone.totals.total, zone.totals.verified, zone.totals.for_review, zone.totals.in_progress, zone.totals.not_started, zone.totals.issue, zone.totals.overdue, zone.totals.percentVerified])
    downloadCsv(`progress-${work.project?.code ?? "project"}-${work.today}.csv`, toCsv(header, rows))
  }

  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Progress"
        title="Progress by zone"
        description="Only work the engineer has verified counts as done. Sheets with problems or late work are listed first."
        actions={<button type="button" className={buttonSecondary} onClick={exportCsv} disabled={!zones.length}>Export CSV</button>}
      />

      {!projectId ? null : work.loading ? (
        <SkeletonCardGrid count={3} />
      ) : totals.total === 0 ? (
        <EmptyState title="No work pins yet">Add pins on the plan to track work here. Notes do not count as work.</EmptyState>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Verified" value={`${totals.percentVerified}%`} tone="green" note={`${totals.verified} of ${totals.total} work pins`} />
            <StatCard label="Schedule" value={elapsed === null ? "n/a" : `${elapsed}%`} tone="sky" note={elapsed === null ? "Set start and end dates on the project" : "of the project time has passed"} />
            <StatCard label="Awaiting review" value={totals.for_review} tone="amber" onClick={() => onNavigate("verification")} note="Open the queue" />
            <StatCard label="Late or problem" value={totals.overdue + totals.issue} tone={totals.overdue + totals.issue ? "red" : "green"} note={`${totals.overdue} overdue, ${totals.issue} issue${totals.issue === 1 ? "" : "s"}`} onClick={() => onNavigate("report-issue")} />
          </div>

          <section className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-extrabold">Whole project</h2>
              {gap !== null ? (
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${gap >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : gap > -15 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"}`}>
                  {gap >= 0 ? `On or ahead of schedule (+${gap} pts)` : `${Math.abs(gap)} pts behind schedule`}
                </span>
              ) : null}
            </div>
            <div className="mt-3"><StackedBar totals={totals} /></div>
            <div className="mt-3"><StatusLegend /></div>
            {elapsed !== null ? (
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-fg-muted"><span>Verified {totals.percentVerified}%</span><span>Time passed {elapsed}%</span></div>
                <div className="relative"><Meter value={totals.percentVerified} tone="green" label="Verified share" /><span className="absolute -top-1 h-4 w-0.5 bg-fg" style={{ left: `${elapsed}%` }} title={`Schedule: ${elapsed}%`} /></div>
              </div>
            ) : null}
          </section>

          <section className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-sm" aria-labelledby="s-curve-title">
            <h2 id="s-curve-title" className="text-base font-extrabold">Planned vs verified (S-curve)</h2>
            <p className="mb-3 text-xs text-fg-muted">Planned follows the due dates on the pins; verified follows your verifications. A widening gap is the early warning.</p>
            <SCurveChart pins={work.pins} start={work.project?.start_date ?? null} end={work.project?.end_date ?? null} today={work.today} />
          </section>

          <section className="mb-6">
            <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Sheets and zones</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {zones.map((zone) => (
                <article key={zone.blueprintId} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-extrabold">{zone.title}</h3>
                      <p className="text-xs text-fg-muted">{[zone.level ? `Level ${zone.level}` : null, zone.discipline ? disciplineLabels[zone.discipline as keyof typeof disciplineLabels] : null].filter(Boolean).join(" • ") || "No level or discipline set"}</p>
                    </div>
                    <span className="text-2xl font-extrabold leading-none text-fg">{zone.totals.percentVerified}%</span>
                  </div>
                  <div className="mt-3"><StackedBar totals={zone.totals} /></div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                    <span>{zone.totals.total} pins</span>
                    {zone.totals.for_review ? <span className="font-bold text-fuchsia-700 dark:text-fuchsia-300">{zone.totals.for_review} to review</span> : null}
                    {zone.totals.issue ? <span className="font-bold text-red-700 dark:text-red-300">{zone.totals.issue} issue{zone.totals.issue === 1 ? "" : "s"}</span> : null}
                    {zone.totals.overdue ? <span className="font-bold text-red-700 dark:text-red-300">{zone.totals.overdue} overdue</span> : null}
                    <button type="button" className="ml-auto inline-flex min-h-6 items-center font-bold text-brand-text hover:underline" onClick={() => followLink(`/engineer/annotation?project=${projectId}`, projectId)}>Open plan</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">By discipline</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {disciplines.map((row) => (
                  <li key={row.key} className="px-4 py-3">
                    <div className="mb-1.5 flex items-center justify-between text-sm"><span className="font-bold">{row.label}</span><span className="text-fg-muted">{row.totals.percentVerified}% of {row.totals.total}</span></div>
                    <StackedBar totals={row.totals} />
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Deadlines</h2>
              {deadlines.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line bg-surface p-5 text-center text-sm text-fg-muted">Nothing is late or due in the next 7 days.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                  {deadlines.map((pin) => {
                    const days = daysBetween(work.today, pin.due_date as string)
                    const late = days < 0
                    return (
                      <li key={pin.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span className="min-w-0"><span className="block truncate font-semibold">{pin.title}</span><span className="text-xs text-fg-muted">{work.sheetOf(pin.blueprint_id)} • {work.nameOf(pin.assigned_to)} • {statusLabels[pin.status as PinStatus]}</span></span>
                        <span className={`flex-none rounded px-2 py-0.5 text-xs font-bold ${late ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"}`}>{late ? `${-days} d late` : days === 0 ? "today" : `in ${days} d`}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useState } from "react"
import { ReportSlideshow } from "../../components/client/PinDailyReports"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, PageHead } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { getSelectedProjectId } from "../../lib/projects"
import { reportDateLong, useDailyReports, weatherLabels } from "../../lib/reports"
import type { ClientPageProps } from "./types"
import { useProjectWork } from "../../lib/projectWork"
import { clientPinPath, openClientPath } from "../../lib/clientPortalModel"

// Daily site logs written by the foreman, each with its own photos. (Separate "progress" pin photos no longer exist.)
export default function ClientSiteLogs(_: ClientPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const { reports, loading: reportsLoading, error } = useDailyReports(projectId)
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("report"))
  const logs = reports.filter((report) => report.project_id === projectId && report.status === "submitted")
  useEffect(() => { const changed = () => setOpenId(new URLSearchParams(window.location.search).get("report")); window.addEventListener("popstate", changed); return () => window.removeEventListener("popstate", changed) }, [])

  return (
    <div className="client-page">
      <ProjectContextBar listPath="/client/overview" listLabel="Overview" />
      <PageHead eyebrow="Site records" title="Site logs" description="What happened on site each day, with the photos taken that day." />
      {!projectId ? null : reportsLoading ? (
        <SkeletonList rows={4} label="Loading logs" />
      ) : error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p>
      ) : logs.length === 0 ? (
        <EmptyState title="No site logs yet">The foreman's daily reports appear here once they are submitted.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {logs.map((report) => {
            const open = openId === report.id
            // Problems, delays and safety are no longer asked for; older logs that have them still show them.
            const sections = ([["Work done", report.work_done], ["Problems", report.issues], ["Delays", report.delays], ["Safety", report.safety]] as const).filter(([label, value]) => label === "Work done" || value)
            return (
              <li key={report.id} className="rounded-xl border border-line bg-surface">
                <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : report.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
                  <span>
                    <span className="block text-sm font-extrabold">{reportDateLong(report.report_date)}</span>
                    <span className="text-xs text-fg-muted">{weatherLabels[report.weather]} • {report.workers_count} workers on site</span>
                  </span>
                  <span aria-hidden="true">{open ? "−" : "+"}</span>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-line px-4 py-4 text-sm">
                    {sections.map(([label, value]) => (
                      <div key={label}><p className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{label}</p><p className="whitespace-pre-wrap">{value || "None reported"}</p></div>
                    ))}
                    {(report.linked_work ?? []).length ? <section className="border-t border-line pt-3"><h3 className="mb-2 text-xs font-bold text-fg-muted">Linked work pins</h3><div className="flex flex-wrap gap-2">{[...new Set(report.linked_work?.map(link => link.pin_id))].map(id => { const pin = work.pins.find(pin => pin.id === id); return pin ? <button type="button" key={id} className="rounded-lg border border-line px-3 py-2 text-xs font-bold text-brand-text hover:bg-surface-muted" onClick={() => openClientPath(clientPinPath(report.project_id, pin.blueprint_id, pin.id))}>{pin.title}</button> : <span key={id} className="text-xs text-fg-muted">Work pin unavailable</span> })}</div></section> : <p className="text-xs text-fg-muted">This report has no linked work pins.</p>}
                    <ReportSlideshow key={report.id} report={report} authorName={work.nameOf(report.author_id)} />
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

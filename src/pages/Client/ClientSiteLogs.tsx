import { useState } from "react"
import DailyReportPhotos from "../../components/DailyReportPhotos"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, PageHead } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { getSelectedProjectId } from "../../lib/projects"
import { reportDateLong, useDailyReports, weatherLabels } from "../../lib/reports"
import type { ClientPageProps } from "./types"

// Daily site logs written by the foreman, each with its own photos. (Separate "progress" pin photos no longer exist.)
export default function ClientSiteLogs(_: ClientPageProps) {
  const projectId = getSelectedProjectId()
  const { reports, loading: reportsLoading, error } = useDailyReports(projectId)
  const [openId, setOpenId] = useState<string | null>(null)
  const logs = reports.filter((report) => report.status === "submitted")

  return (
    <div className="client-page">
      <ProjectContextBar listPath="/client/overview" listLabel="My projects" />
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
                    <DailyReportPhotos projectId={report.project_id} reportId={report.id} />
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

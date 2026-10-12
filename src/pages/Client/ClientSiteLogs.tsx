import { useState } from "react"
import PhotoGallery from "../../components/PhotoGallery"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, PageHead } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import { reportDateLong, useDailyReports, useProjectPhotos, weatherLabels } from "../../lib/reports"
import type { ClientPageProps } from "./types"

type Tab = "logs" | "photos"

// Daily site logs written by the foreman and the photos the team attached to work items.
export default function ClientSiteLogs(_: ClientPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const { reports, loading: reportsLoading, error } = useDailyReports(projectId)
  const { photos } = useProjectPhotos(projectId)
  const [tab, setTab] = useState<Tab>("logs")
  const [openId, setOpenId] = useState<string | null>(null)
  const logs = reports.filter((report) => report.status === "submitted")

  return (
    <div className="client-page">
      <ProjectContextBar listPath="/client/overview" listLabel="My projects" />
      <PageHead eyebrow="Site records" title="Site logs and photos" description="What happened on site each day, and photos of the work as it progresses." />
      {!projectId ? null : (
        <>
          <div className="mb-4 inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm" role="tablist" aria-label="Site records">
            {([["logs", `Daily logs (${logs.length})`], ["photos", `Photos (${photos.length})`]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${tab === key ? "bg-brand text-white shadow-[0_6px_14px_-8px_rgba(158,31,147,0.9)]" : "text-fg-muted hover:bg-surface-muted hover:text-fg"}`}>{label}</button>
            ))}
          </div>
          {tab === "logs" ? (
            reportsLoading ? (
              <SkeletonList rows={4} label="Loading logs" />
            ) : error ? (
              <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p>
            ) : logs.length === 0 ? (
              <EmptyState title="No site logs yet">The foreman's daily reports appear here once they are submitted.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {logs.map((report) => {
                  const open = openId === report.id
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
                          {([["Work done", report.work_done], ["Problems", report.issues], ["Delays", report.delays], ["Safety", report.safety]] as const).map(([label, value]) => (
                            <div key={label}><p className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{label}</p><p className="whitespace-pre-wrap">{value || "None reported"}</p></div>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )
          ) : (
            <PhotoGallery projectId={projectId} pins={work.pins} loading={work.loading} emptyHint="Photos the team attaches to work items show up here." />
          )}
        </>
      )}
    </div>
  )
}

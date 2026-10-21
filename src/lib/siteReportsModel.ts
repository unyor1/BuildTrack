import { reportDateLong, type DailyReport } from "./reportFormat.ts"

export type SiteReportState = "all" | "pending" | "reviewed" | "returned"
// Engineer site logs never include an unsubmitted private draft, even if the caller can read one.
export const siteLogReports = (reports: DailyReport[], projectId: string | null) => reports.filter(row => row.project_id === projectId && (row.status === "submitted" || row.review_state === "returned"))
export function filterSiteLogs(reports: DailyReport[], filter: { query: string; state: SiteReportState; from: string; to: string }, author: (id: string) => string, links: (report: DailyReport) => string) {
  if (filter.from && filter.to && filter.from > filter.to) return []
  const text = filter.query.trim().toLowerCase()
  return reports.filter(row => (filter.state === "all" || (row.review_state ?? "pending") === filter.state)
    && (!filter.from || row.report_date >= filter.from) && (!filter.to || row.report_date <= filter.to)
    && (!text || [row.report_date, reportDateLong(row.report_date), row.work_done, row.issues, row.delays, row.safety, author(row.author_id), links(row)].join(" ").toLowerCase().includes(text)))
}

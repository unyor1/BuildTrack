import { reportHtml } from "./printReport.ts"
import { toCsv } from "./progress.ts"
import { attendanceDate, attendanceDay, attendanceTime } from "./attendanceModel.ts"
import { attendanceReportSummary, reportPeriodTitle, reportTime, type AttendanceReportData } from "./attendanceReportModel.ts"

export function attendanceReportHtml(data: AttendanceReportData) {
  const summary = attendanceReportSummary(data.events), range = data.range
  const document = reportHtml({
    title: `${reportPeriodTitle(range.period)} attendance report${data.worker ? ` — ${data.worker.full_name}` : ""}`,
    subtitle: `${data.project.code} · ${data.project.name}`,
    meta: [["Period", `${range.startDay} – ${range.endDay}`], ["Records through", `${range.throughDay} · Philippine time`], ["Workers with scans", String(summary.workers)], ["Recorded scans", String(summary.scans)]],
    sections: [
      { heading: "Report details", rows: [["Scope", data.worker ? `${data.worker.full_name} · ${data.worker.worker_code}` : "All workers with recorded scans in this project"], ["Generated", `${attendanceDate(data.generatedAt)} ${attendanceTime(data.generatedAt)} PHT`], ["Clock-ins / clock-outs", `${summary.clockIns} / ${summary.clockOuts}`], ["Days with scans", String(summary.days)]] },
      { heading: "Daily attendance summary", table: summary.rows.length ? { head: ["Date (PHT)", "Worker", "Code", "Trade", "Clock-ins", "Clock-outs", "First in (PHT)", "Last out (PHT)"], rows: summary.rows.map(row => [row.day, row.name, row.code, row.trade, String(row.clockIns), String(row.clockOuts), reportTime(row.firstIn), reportTime(row.lastOut)]) } : undefined, body: summary.rows.length ? undefined : "No attendance recorded for this scope and period." },
      { heading: "Attendance scan records", table: data.events.length ? { head: ["Date (PHT)", "Worker", "Code", "Attendance", "Scan time (PHT)", "Received (PHT)", "Terminal"], rows: data.events.map(event => [attendanceDay(new Date(event.occurred_at)), event.worker?.full_name ?? "Worker unavailable", event.worker?.worker_code ?? event.worker_id, event.direction === "in" ? "Clock in" : "Clock out", attendanceTime(event.occurred_at), `${attendanceDate(event.received_at)} ${attendanceTime(event.received_at)}`, event.device_id]) } : undefined },
      { heading: "Notes", body: "This report includes all returned biometric scan records for the specified project, worker scope and period—not just the visible page. Weeks run Monday–Sunday; months are calendar months. Current periods include records only through today. Missing scans or unmatched clock-ins/outs are not treated as absences, worked hours, overtime or payroll calculations." },
    ],
  })
  return document.replace("</style>", "@page{size:A4 landscape;margin:12mm}section{break-inside:auto}tr{break-inside:avoid}thead{display:table-header-group}th,td{overflow-wrap:anywhere;font-size:10px}</style>")
}

export function attendanceReportCsv(data: AttendanceReportData) {
  return toCsv(["Project code", "Project", "Worker code", "Worker", "Trade", "Date (PHT)", "Attendance", "Scan time (PHT)", "Received date (PHT)", "Received time (PHT)", "Terminal", "Scan ID", "Report period", "Period start", "Period end", "Records through", "Generated at (UTC)"], data.events.map(event => [data.project.code, data.project.name, event.worker?.worker_code ?? event.worker_id, event.worker?.full_name ?? "Worker unavailable", event.worker?.trade ?? "", attendanceDay(new Date(event.occurred_at)), event.direction === "in" ? "Clock in" : "Clock out", attendanceTime(event.occurred_at), attendanceDay(new Date(event.received_at)), attendanceTime(event.received_at), event.device_id, event.id, data.range.period, data.range.startDay, data.range.endDay, data.range.throughDay, data.generatedAt]))
}

export function attendanceReportFilename(data: AttendanceReportData) {
  return `attendance-${data.project.code}-${data.worker?.worker_code ?? "all-workers"}-${data.range.period}-${data.range.startDay}-${data.range.throughDay}`.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 180) + ".csv"
}

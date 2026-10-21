import { useEffect, useMemo, useState } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import DailyReportPhotos from "../../components/DailyReportPhotos"
import { AttendanceImport, ReportReviewPanel } from "../../components/DailyReportWorkflow"
import { EmptyState, PageHead, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { severityLabels, statusLabels } from "../../lib/blueprints"
import { daysBetween, downloadCsv, isOverdue, byZone, summarize, toCsv } from "../../lib/progress"
import { printHtml, reportHtml } from "../../lib/printReport"
import WeeklyReportModal from "../../components/WeeklyReportModal"
import { useDefects, useInspections } from "../../lib/qa"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import { dailyReportHtml, reportDateLong, useDailyReports, useQuestions, weatherLabels, type DailyReport, type ProjectQuestion } from "../../lib/reports"
import { linkedWorkLabel, type ReportWork } from "../../lib/reportFormat"
import { useProjectWorkItems } from "../../lib/dailyPhotos"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { EngineerPageProps } from "./types"
import { filterSiteLogs, siteLogReports, type SiteReportState } from "../../lib/siteReportsModel"

type Tab = "reports" | "questions"
const initialTab = (): Tab => (new URLSearchParams(window.location.search).get("tab") === "questions" ? "questions" : "reports")
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// Site logs (the foreman's submitted daily reports), client questions to answer, and a printable progress report.
export default function EngineerReports({ onNavigate }: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const workItems = useProjectWorkItems(projectId, true)
  const { reports, loading: reportsLoading, error: reportsError, reload: reloadReports } = useDailyReports(projectId)
  const { questions, loading: questionsLoading, error: questionsError, reload: reloadQuestions } = useQuestions(projectId)
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("report"))
  const [query, setQuery] = useState("")
  const [weekly, setWeekly] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<SiteReportState>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  useEffect(() => { setQuery(""); setReviewFilter("all"); setFrom(""); setTo(""); setOpenId(new URLSearchParams(window.location.search).get("report")) }, [projectId])
  useEffect(() => {
    const changed = () => { setOpenId(new URLSearchParams(window.location.search).get("report")); setTab(initialTab()) }
    window.addEventListener("popstate", changed)
    return () => window.removeEventListener("popstate", changed)
  }, [])
  const { defects } = useDefects(projectId)
  const { inspections } = useInspections(projectId)

  const describe = (link: ReportWork) => linkedWorkLabel(link, (id) => work.pins.find(pin => pin.id === id)?.title, (id) => workItems.find(item => item.id === id)?.text)
  const logs = siteLogReports(reports, projectId)
  const submitted = filterSiteLogs(logs, { query, state: reviewFilter, from, to }, work.nameOf, report => (report.linked_work ?? []).map(describe).join(" "))
  const badRange = Boolean(from && to && from > to)
  const unanswered = questions.filter((question) => !question.answer).length

  const printReport = (report: DailyReport) => {
    if (!work.project) return
    const describe = (link: ReportWork) => linkedWorkLabel(link, (id) => work.pins.find((pin) => pin.id === id)?.title, (id) => workItems.find((item) => item.id === id)?.text)
    if (!printHtml(dailyReportHtml(report, work.project, work.nameOf(report.author_id), describe))) toast.error("Could not open the print dialog")
  }

  const exportReports = () => {
    const rows = submitted.map((report) => [report.report_date, work.nameOf(report.author_id), weatherLabels[report.weather], report.workers_count, report.work_done, report.issues ?? "", report.delays ?? "", report.safety ?? "", report.review_state ?? "pending", report.revision ?? 0, report.review_note ?? ""])
    downloadCsv(`site-logs-${work.project?.code ?? "project"}-${work.today}.csv`, toCsv(["Date", "Prepared by", "Weather", "Workers", "Work done", "Issues", "Delays", "Safety", "Review", "Revision", "Review feedback"], rows))
  }

  const printProgress = () => {
    if (!work.project) return
    const totals = summarize(work.pins, work.today)
    const zones = byZone(work.blueprints, work.pins, work.today)
    const open = work.pins.filter((pin) => pin.status === "issue")
    const late = work.pins.filter((pin) => isOverdue(pin, work.today))
    const html = reportHtml({
      title: "Progress report",
      subtitle: `${work.project.name} (${work.project.code})${work.project.location ? " - " + work.project.location : ""}`,
      meta: [["As of", reportDateLong(work.today)], ["Verified", `${totals.percentVerified}%`], ["Work pins", String(totals.total)], ["Overdue / issues", `${totals.overdue} / ${totals.issue}`]],
      sections: [
        { heading: "Status summary", rows: (["verified", "for_review", "in_progress", "not_started", "issue"] as const).map((status) => [statusLabels[status], String(totals[status])] as [string, string]) },
        { heading: "Progress by sheet", table: { head: ["Sheet", "Level", "Pins", "Verified", "To review", "Issues", "Overdue", "% verified"], rows: zones.map((zone) => [zone.title, zone.level ?? "-", String(zone.totals.total), String(zone.totals.verified), String(zone.totals.for_review), String(zone.totals.issue), String(zone.totals.overdue), `${zone.totals.percentVerified}%`]) } },
        { heading: "Open issues", table: open.length ? { head: ["Issue", "Sheet", "Severity", "Assigned to"], rows: open.map((pin) => [pin.title, work.sheetOf(pin.blueprint_id), severityLabels[pin.severity], work.nameOf(pin.assigned_to)]) } : undefined, body: open.length ? undefined : "No open issues." },
        { heading: "Late work", table: late.length ? { head: ["Pin", "Sheet", "Due", "Days late", "Assigned to"], rows: late.map((pin) => [pin.title, work.sheetOf(pin.blueprint_id), pin.due_date ?? "", String(daysBetween(pin.due_date as string, work.today)), work.nameOf(pin.assigned_to)]) } : undefined, body: late.length ? undefined : "Nothing is past its deadline." },
      ],
    })
    if (!printHtml(html)) toast.error("Could not open the print dialog")
  }

  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Reports"
        title="Site logs and reports"
        description="Daily reports from the foreman, questions from the client, and a printable progress report."
        actions={
          <>
            <button type="button" className={buttonSecondary} onClick={printProgress} disabled={!projectId || work.loading || Boolean(work.error)}>Status snapshot</button>
            <button type="button" className={buttonPrimary} onClick={() => setWeekly(true)} disabled={!projectId || work.loading || reportsLoading || Boolean(work.error || reportsError)}>Weekly report</button>
          </>
        }
      />
      {work.error ? <p role="alert" className="mb-3 text-sm text-danger-fg">{work.error} <button type="button" className="underline" onClick={() => void work.reload()}>Reload project data</button></p> : null}
      {!projectId ? null : (
        <>
          <div className="mb-4 inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm" role="tablist" aria-label="Reports">
            {([["reports", `Daily reports (${logs.length})`], ["questions", `Client questions${unanswered ? ` (${unanswered} new)` : ""}`]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${tab === key ? "bg-brand text-white shadow-[0_6px_14px_-8px_rgba(158,31,147,0.9)]" : "text-fg-muted hover:bg-surface-muted hover:text-fg"}`}>{label}</button>
            ))}
          </div>

          {tab === "reports" ? (
            <>
              <div className="mb-4 space-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
                <p>Connected to the Foreman's <strong>Daily progress report</strong> for this project. Only submitted reports and returned revisions appear here; private drafts are not site logs. QA requests do not create daily reports automatically.</p>
                <p className="text-xs text-fg-muted">{logs.length} reports · {logs.filter(row => (row.review_state ?? "pending") === "pending").length} awaiting review · {logs.filter(row => row.review_state === "reviewed").length} reviewed · {logs.filter(row => row.review_state === "returned").length} returned. Updates automatically.</p>
                <button type="button" className="text-xs font-bold text-brand-text underline" onClick={() => onNavigate("qa")}>Open QA requests, evidence and NCRs in the QA register</button>
              </div>
              <AttendanceImport projectId={projectId} />
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Date, Foreman, work or checklist..." aria-label="Search the logs" className={`${inputClass} !w-64`} />
                <label className="text-xs font-bold">Review status<select className={inputClass} aria-label="Filter report review" value={reviewFilter} onChange={event => setReviewFilter(event.target.value as SiteReportState)}><option value="all">All reports</option><option value="pending">Awaiting review</option><option value="reviewed">Reviewed</option><option value="returned">Returned</option></select></label>
                <label className="text-xs font-bold">From<input type="date" className={inputClass} value={from} onChange={event => setFrom(event.target.value)} /></label>
                <label className="text-xs font-bold">To<input type="date" className={inputClass} value={to} onChange={event => setTo(event.target.value)} /></label>
                <button type="button" className={buttonSecondary} onClick={() => { setQuery(""); setReviewFilter("all"); setFrom(""); setTo("") }}>Clear filters</button>
                <button type="button" className={buttonSecondary} onClick={exportReports} disabled={!submitted.length || reportsLoading || Boolean(reportsError) || badRange}>Export CSV</button>
              </div>
              <p className="mb-3 text-xs text-fg-muted">Showing {submitted.length} of {logs.length} site logs.</p>
              {badRange ? <p role="alert" className="mb-3 text-sm text-danger-fg">The end date must not be before the start date.</p> : null}
              {reportsError ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{reportsError}</p> : null}
              {reportsLoading ? (
                <SkeletonList rows={4} label="Loading reports" />
              ) : submitted.length === 0 ? (
                <EmptyState title={logs.length ? "No reports match these filters" : "No submitted reports"}>{logs.length ? "Clear the filters to view all site logs." : "The Foreman must submit a Daily progress report. Saving a draft or submitting checklist QA alone does not create a site log."}</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {submitted.map((report) => {
                    const open = openId === report.id
                    return (
                      <li key={report.id} className="rounded-xl border border-line bg-surface">
                        <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : report.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
                          <span>
                            <span className="block text-sm font-extrabold">{reportDateLong(report.report_date)}</span>
                            <span className="block text-xs font-bold text-brand-text">{report.review_state === "reviewed" ? "Reviewed" : report.review_state === "returned" ? "Returned · awaiting corrections" : "Awaiting Engineer review"} · revision {report.revision ?? 0}</span>
                            <span className="text-xs text-fg-muted">{work.nameOf(report.author_id)} • {weatherLabels[report.weather]} • {report.workers_count} workers</span>
                          </span>
                          <span className="flex items-center gap-2 text-xs">
                            {report.issues ? <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-800 dark:bg-red-900/40 dark:text-red-200">Issues</span> : null}
                            {report.delays ? <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Delays</span> : null}
                            <span aria-hidden="true">{open ? "−" : "+"}</span>
                          </span>
                        </button>
                        {open ? (
                          <div className="space-y-3 border-t border-line px-4 py-4 text-sm">
                            {([["Work done", report.work_done], ["Issues and problems", report.issues], ["Delays", report.delays], ["Safety", report.safety]] as const).map(([label, value]) => (
                              <div key={label}><p className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{label}</p><p className="whitespace-pre-wrap">{value || "-"}</p></div>
                            ))}
                            {!(report.linked_work ?? []).length ? <p className="text-xs text-fg-muted">This report has no linked work pins or checklist items. The Foreman can link them when preparing a new report or a returned revision.</p> : null}
                            <DailyReportPhotos projectId={report.project_id} reportId={report.id} />
                            <ReportReviewPanel report={report} pins={work.pins} nameOf={work.nameOf} onChanged={reloadReports} />
                            <div className="flex flex-wrap justify-end gap-2 pt-1">
                              <button type="button" className={buttonSecondary + " !py-1.5 !text-xs"} onClick={() => printReport(report)}>Print / PDF</button>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : (
            <Questions questions={questions} loading={questionsLoading} error={questionsError} nameOf={work.nameOf} pinTitle={(id) => work.pins.find((pin) => pin.id === id)?.title ?? null} pinPath={id => { const pin = work.pins.find(pin => pin.id === id); return pin ? `/engineer/annotation?project=${encodeURIComponent(pin.project_id)}&sheet=${encodeURIComponent(pin.blueprint_id)}&pin=${encodeURIComponent(pin.id)}` : null }} onAnswered={reloadQuestions} />
          )}
        </>
      )}
      {weekly && work.project ? (
        <WeeklyReportModal
          audience="team"
          project={work.project}
          pins={work.pins}
          start={work.project.start_date}
          end={work.project.end_date}
          logs={reports}
          questions={questions}
          defects={defects}
          inspections={inspections}
          nameOf={work.nameOf}
          sheetOf={work.sheetOf}
          onClose={() => setWeekly(false)}
        />
      ) : null}
    </div>
  )
}

function Questions({ questions, loading, error, nameOf, pinTitle, pinPath, onAnswered }: { questions: ProjectQuestion[]; loading: boolean; error: string; nameOf: (id: string | null) => string; pinTitle: (id: string) => string | null; pinPath: (id: string) => string | null; onAnswered: () => Promise<void> }) {
  const toast = useToast()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [wanted, setWanted] = useState(() => new URLSearchParams(window.location.search).get("question"))
  useEffect(() => { const changed = () => setWanted(new URLSearchParams(window.location.search).get("question")); window.addEventListener("popstate", changed); return () => window.removeEventListener("popstate", changed) }, [])
  useEffect(() => { if (wanted && questions.some(question => question.id === wanted)) document.getElementById(`client-question-${wanted}`)?.scrollIntoView({ block: "center", behavior: "smooth" }) }, [wanted, questions])
  const sorted = [...questions].sort((a, b) => Number(Boolean(a.answer)) - Number(Boolean(b.answer)) || b.created_at.localeCompare(a.created_at))

  const answer = async (question: ProjectQuestion) => {
    const text = (drafts[question.id] ?? "").trim()
    if (!text) return toast.error("Write an answer first")
    setBusy(question.id)
    const { error: rpcError } = await supabase.rpc("answer_question", { p_id: question.id, p_answer: text }).then(result => result, () => ({ error: { message: "Connection interrupted. Check the saved answer before trying again." } }))
    setBusy(null)
    if (rpcError) return toast.error("Not sent", rpcError.message)
    toast.success("Answer sent", `${nameOf(question.author_id)} is notified`)
    setDrafts((current) => ({ ...current, [question.id]: "" }))
    await onAnswered()
  }

  if (loading) return <SkeletonList rows={3} label="Loading questions" />
  if (error) return <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p>
  if (!sorted.length) return <EmptyState title="No questions from the client">Questions the client asks about the project or a pin show up here, and you get a notification.</EmptyState>
  return (
    <ul className="space-y-3">
      {sorted.map((question) => (
        <li id={`client-question-${question.id}`} key={question.id} className={`rounded-xl border bg-surface p-4 ${question.answer && question.id !== wanted ? "border-line" : "border-brand"} ${question.id === wanted ? "ring-1 ring-brand" : ""}`}>
          <p className="text-xs text-fg-muted">{nameOf(question.author_id)} • {when(question.created_at)}{question.pin_id && pinTitle(question.pin_id) ? ` • about "${pinTitle(question.pin_id)}"` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{question.question}</p>
          {question.pin_id && pinPath(question.pin_id) ? <a className="mt-2 inline-block text-xs font-bold text-brand-text underline" href={pinPath(question.pin_id)!}>Open linked work pin</a> : null}
          {question.answer ? (
            <div className="mt-3 rounded-lg bg-surface-muted p-3 text-sm">
              <p className="text-xs font-bold text-brand-text">Answered by {nameOf(question.answered_by)} • {question.answered_at ? when(question.answered_at) : ""}</p>
              <p className="mt-1 whitespace-pre-wrap">{question.answer}</p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor={`answer-${question.id}`}>Answer</label>
              <textarea id={`answer-${question.id}`} rows={2} maxLength={2000} value={drafts[question.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Write a clear answer in plain language." className={`${inputClass} flex-1`} />
              <button type="button" className={buttonPrimary + " self-end"} disabled={busy === question.id} onClick={() => void answer(question)}>{busy === question.id ? "Sending..." : "Send answer"}</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

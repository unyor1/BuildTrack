import { useMemo, useState } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, PageHead, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { severityLabels, statusLabels } from "../../lib/blueprints"
import { useConfirm } from "../../lib/confirm"
import { daysBetween, downloadCsv, isOverdue, byZone, summarize, toCsv } from "../../lib/progress"
import { printHtml, reportHtml } from "../../lib/printReport"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import { dailyReportHtml, reportDateLong, useDailyReports, useQuestions, weatherLabels, type DailyReport, type ProjectQuestion } from "../../lib/reports"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { EngineerPageProps } from "./types"

type Tab = "reports" | "questions"
const initialTab = (): Tab => (new URLSearchParams(window.location.search).get("tab") === "questions" ? "questions" : "reports")
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// Site logs (the foreman's submitted daily reports), client questions to answer, and a printable progress report.
export default function EngineerReports(_: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const { reports, loading: reportsLoading, error: reportsError, reload: reloadReports } = useDailyReports(projectId)
  const { questions, loading: questionsLoading, error: questionsError, reload: reloadQuestions } = useQuestions(projectId)
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [openId, setOpenId] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const submitted = useMemo(() => {
    const text = query.trim().toLowerCase()
    return reports.filter((report) => report.status === "submitted" && (!text || `${report.work_done} ${report.issues ?? ""} ${report.delays ?? ""} ${report.safety ?? ""} ${work.nameOf(report.author_id)}`.toLowerCase().includes(text)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, query, work.team])
  const unanswered = questions.filter((question) => !question.answer).length

  const reopen = async (report: DailyReport) => {
    if (!(await confirm({ title: "Reopen this report?", message: `${work.nameOf(report.author_id)} gets it back as a draft, can correct it and submit again.`, confirmLabel: "Reopen" }))) return
    const { error } = await supabase.rpc("reopen_daily_report", { p_id: report.id })
    if (error) return toast.error("Could not reopen", error.message)
    toast.success("Report reopened", reportDateLong(report.report_date))
    await reloadReports()
  }

  const printReport = (report: DailyReport) => {
    if (!work.project) return
    if (!printHtml(dailyReportHtml(report, work.project, work.nameOf(report.author_id)))) toast.error("Could not open the print dialog")
  }

  const exportReports = () => {
    const rows = submitted.map((report) => [report.report_date, work.nameOf(report.author_id), weatherLabels[report.weather], report.workers_count, report.work_done, report.issues ?? "", report.delays ?? "", report.safety ?? ""])
    downloadCsv(`site-logs-${work.project?.code ?? "project"}-${work.today}.csv`, toCsv(["Date", "Prepared by", "Weather", "Workers", "Work done", "Issues", "Delays", "Safety"], rows))
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
        actions={<button type="button" className={buttonPrimary} onClick={printProgress} disabled={!projectId || work.loading}>Print progress report</button>}
      />
      {!projectId ? null : (
        <>
          <div className="mb-4 inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm" role="tablist" aria-label="Reports">
            {([["reports", `Daily reports (${reports.filter((report) => report.status === "submitted").length})`], ["questions", `Client questions${unanswered ? ` (${unanswered} new)` : ""}`]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${tab === key ? "bg-brand text-white shadow-[0_6px_14px_-8px_rgba(158,31,147,0.9)]" : "text-fg-muted hover:bg-surface-muted hover:text-fg"}`}>{label}</button>
            ))}
          </div>

          {tab === "reports" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the logs..." aria-label="Search the logs" className={`${inputClass} !w-64`} />
                <button type="button" className={buttonSecondary} onClick={exportReports} disabled={!submitted.length}>Export CSV</button>
              </div>
              {reportsError ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{reportsError}</p> : null}
              {reportsLoading ? (
                <SkeletonList rows={4} label="Loading reports" />
              ) : submitted.length === 0 ? (
                <EmptyState title="No submitted reports">When the foreman submits a daily report it appears here and you get a notification.</EmptyState>
              ) : (
                <ul className="space-y-2">
                  {submitted.map((report) => {
                    const open = openId === report.id
                    return (
                      <li key={report.id} className="rounded-xl border border-line bg-surface">
                        <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : report.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
                          <span>
                            <span className="block text-sm font-extrabold">{reportDateLong(report.report_date)}</span>
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
                            <div className="flex flex-wrap justify-end gap-2 pt-1">
                              <button type="button" className={buttonSecondary + " !py-1.5 !text-xs"} onClick={() => printReport(report)}>Print / PDF</button>
                              <button type="button" className={buttonSecondary + " !py-1.5 !text-xs"} onClick={() => void reopen(report)}>Reopen for correction</button>
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
            <Questions questions={questions} loading={questionsLoading} error={questionsError} nameOf={work.nameOf} pinTitle={(id) => work.pins.find((pin) => pin.id === id)?.title ?? null} onAnswered={reloadQuestions} />
          )}
        </>
      )}
    </div>
  )
}

function Questions({ questions, loading, error, nameOf, pinTitle, onAnswered }: { questions: ProjectQuestion[]; loading: boolean; error: string; nameOf: (id: string | null) => string; pinTitle: (id: string) => string | null; onAnswered: () => Promise<void> }) {
  const toast = useToast()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const sorted = [...questions].sort((a, b) => Number(Boolean(a.answer)) - Number(Boolean(b.answer)) || b.created_at.localeCompare(a.created_at))

  const answer = async (question: ProjectQuestion) => {
    const text = (drafts[question.id] ?? "").trim()
    if (!text) return toast.error("Write an answer first")
    setBusy(question.id)
    const { error: rpcError } = await supabase.rpc("answer_question", { p_id: question.id, p_answer: text })
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
        <li key={question.id} className={`rounded-xl border bg-surface p-4 ${question.answer ? "border-line" : "border-brand"}`}>
          <p className="text-xs text-fg-muted">{nameOf(question.author_id)} • {when(question.created_at)}{question.pin_id && pinTitle(question.pin_id) ? ` • about "${pinTitle(question.pin_id)}"` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{question.question}</p>
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

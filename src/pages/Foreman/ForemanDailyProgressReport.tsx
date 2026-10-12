import { useEffect, useMemo, useState, type FormEvent } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, PageHead, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { useAuth } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { isNetworkProblem } from "../../lib/offlineModel"
import { enqueue } from "../../lib/offlineQueue"
import { manilaToday } from "../../lib/progress"
import { printHtml } from "../../lib/printReport"
import { getSelectedProjectId, useProject } from "../../lib/projects"
import { dailyReportHtml, reportDateLong, reportError, reportableDates, useDailyReports, weatherLabels, type DailyReport, type Weather } from "../../lib/reports"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { ForemanPageProps } from "./types"

type Form = { weather: Weather; workers_count: string; work_done: string; issues: string; delays: string; safety: string }
const emptyForm: Form = { weather: "sunny", workers_count: "", work_done: "", issues: "", delays: "", safety: "" }
const fromReport = (report: DailyReport): Form => ({ weather: report.weather, workers_count: String(report.workers_count), work_done: report.work_done, issues: report.issues ?? "", delays: report.delays ?? "", safety: report.safety ?? "" })

// The foreman's daily site report: write it (autosave is a button press, not a surprise), submit it, and it becomes the site log.
export default function ForemanDailyProgressReport(_: ForemanPageProps) {
  const projectId = getSelectedProjectId()
  const { profile } = useAuth()
  const { project } = useProject(projectId)
  const { reports, loading, error, reload } = useDailyReports(projectId)
  const toast = useToast()
  const confirm = useConfirm()
  const today = manilaToday()
  const dates = useMemo(() => reportableDates(today), [today])
  const [date, setDate] = useState(today)
  const [form, setForm] = useState<Form>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const [busy, setBusy] = useState(false)

  const mine = reports.filter((report) => report.author_id === profile?.id)
  const existing = mine.find((report) => report.report_date === date) ?? null
  const readOnly = existing?.status === "submitted"

  // Load the report for the chosen day into the form (or a blank one).
  useEffect(() => {
    setForm(existing ? fromReport(existing) : emptyForm)
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, existing?.id, existing?.updated_at])

  const validate = (submitting: boolean) => {
    const found: typeof errors = {}
    const workers = Number(form.workers_count || 0)
    if (!Number.isInteger(workers) || workers < 0 || workers > 5000) found.workers_count = "Enter a whole number from 0 to 5000."
    if (submitting && form.work_done.trim().length < 5) found.work_done = "Describe the work done today (at least 5 characters)."
    if (form.work_done.length > 4000) found.work_done = "Keep it under 4000 characters."
    for (const key of ["issues", "delays", "safety"] as const) if (form[key].length > 2000) found[key] = "Keep it under 2000 characters."
    setErrors(found)
    return Object.keys(found).length === 0
  }

  const save = async (status: "draft" | "submitted", event?: FormEvent) => {
    event?.preventDefault()
    if (!projectId || !validate(status === "submitted")) return
    if (status === "submitted" && !(await confirm({ title: "Submit this report?", message: "After you submit, the report cannot be edited. The engineers are notified and the client can read it in the site logs.", confirmLabel: "Submit report" }))) return
    setBusy(true)
    const values = { weather: form.weather, workers_count: Number(form.workers_count || 0), work_done: form.work_done.trim(), issues: form.issues.trim() || null, delays: form.delays.trim() || null, safety: form.safety.trim() || null, status }
    // No signal: keep the report on this device and send it when the connection is back.
    const saveOffline = async () => {
      if (!profile) return
      await enqueue({ userId: profile.id, kind: "daily_report", label: reportDateLong(date), payload: { projectId, date, values } })
      setBusy(false)
      toast.info("Saved on this device", "It will be sent when you are back online.")
    }
    if (!navigator.onLine) return saveOffline()
    const { error: writeError } = existing
      ? await supabase.from("daily_reports").update(values).eq("id", existing.id)
      : await supabase.from("daily_reports").insert({ project_id: projectId, report_date: date, ...values })
    if (writeError && isNetworkProblem(writeError)) return saveOffline()
    setBusy(false)
    if (writeError) return toast.error(status === "submitted" ? "Report not submitted" : "Draft not saved", reportError(writeError))
    toast.success(status === "submitted" ? "Report submitted" : "Draft saved", reportDateLong(date))
    await reload()
  }

  const remove = async () => {
    if (!existing || !(await confirm({ title: "Delete this draft?", message: "This cannot be undone.", confirmLabel: "Delete draft", tone: "danger" }))) return
    const { error: deleteError } = await supabase.from("daily_reports").delete().eq("id", existing.id)
    if (deleteError) return toast.error("Could not delete", reportError(deleteError))
    toast.success("Draft deleted")
    await reload()
  }

  const print = () => {
    if (!existing || !project) return
    if (!printHtml(dailyReportHtml(existing, project, profile?.full_name || profile?.email || "Foreman"))) toast.error("Could not open the print dialog")
  }

  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const note = (key: keyof Form) => (errors[key] ? <span className="mt-1 block text-xs font-normal text-danger-fg">{errors[key]}</span> : null)

  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/dashboard" listLabel="My projects" />
      <PageHead eyebrow="Daily site report" title="Daily progress report" description="Write what happened on site today. Submitted reports become the project's site log, which engineers and the client can read." />

      {!projectId ? null : (
        <div className="grid gap-5 lg:grid-cols-[17rem_1fr]">
          <aside aria-label="Your reports">
            <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Your reports</h2>
            {loading ? (
              <SkeletonList rows={4} label="Loading reports" />
            ) : (
              <ul className="space-y-1.5">
                {dates.slice(0, 14).map((day) => {
                  const report = mine.find((item) => item.report_date === day)
                  return (
                    <li key={day}>
                      <button type="button" onClick={() => setDate(day)} aria-current={day === date} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${day === date ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-muted"}`}>
                        <span className="font-semibold">{day === today ? "Today" : reportDateLong(day)}</span>
                        {report ? (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase ${report.status === "submitted" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"}`}>{report.status === "submitted" ? "Submitted" : "Draft"}</span>
                        ) : (
                          <span className="text-[11px] text-fg-muted">Empty</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className="mt-3 text-xs text-fg-muted">You can write a report for today and the 13 days before.</p>
          </aside>

          <section className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            {error ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p> : null}
            <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-extrabold">{reportDateLong(date)}</h2>
                <p className="text-xs text-fg-muted">{readOnly ? "Submitted. It can no longer be edited. Ask an engineer to reopen it if something is wrong." : existing ? "Draft: only you can see it." : "New report"}</p>
              </div>
              {existing ? <button type="button" className={buttonSecondary} onClick={print}>Print / Save as PDF</button> : null}
            </header>
            <form className="space-y-4" noValidate onSubmit={(event) => void save("draft", event)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold">Weather
                  <select className={`${inputClass} mt-1`} value={form.weather} onChange={set("weather")} disabled={readOnly}>
                    {(Object.keys(weatherLabels) as Weather[]).map((key) => <option key={key} value={key}>{weatherLabels[key]}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-semibold">Workers on site (head count)
                  <input className={`${inputClass} mt-1`} inputMode="numeric" value={form.workers_count} onChange={set("workers_count")} disabled={readOnly} placeholder="0" />
                  {note("workers_count")}
                </label>
              </div>
              <label className="block text-sm font-semibold">Work done today *
                <textarea className={`${inputClass} mt-1`} rows={5} value={form.work_done} onChange={set("work_done")} disabled={readOnly} placeholder="e.g. Poured slab B (north), 12 workers. Formwork for column C4 completed." />
                {note("work_done")}
              </label>
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block text-sm font-semibold">Issues and problems
                  <textarea className={`${inputClass} mt-1`} rows={3} value={form.issues} onChange={set("issues")} disabled={readOnly} />
                  {note("issues")}
                </label>
                <label className="block text-sm font-semibold">Delays
                  <textarea className={`${inputClass} mt-1`} rows={3} value={form.delays} onChange={set("delays")} disabled={readOnly} placeholder="Rain, late delivery, waiting for inspection..." />
                  {note("delays")}
                </label>
                <label className="block text-sm font-semibold">Safety
                  <textarea className={`${inputClass} mt-1`} rows={3} value={form.safety} onChange={set("safety")} disabled={readOnly} placeholder="Toolbox talk, near misses, incidents." />
                  {note("safety")}
                </label>
              </div>
              {!readOnly ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                  <div>{existing ? <button type="button" className={buttonDanger + " !bg-transparent !text-danger-fg hover:!bg-danger-soft"} onClick={() => void remove()} disabled={busy}>Delete draft</button> : null}</div>
                  <div className="flex gap-2">
                    <button type="submit" className={buttonSecondary} disabled={busy}>{busy ? "Saving..." : "Save draft"}</button>
                    <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void save("submitted")}>Submit report</button>
                  </div>
                </div>
              ) : null}
            </form>
          </section>
        </div>
      )}
      {projectId && !loading && mine.length === 0 ? <div className="mt-5"><EmptyState title="No reports yet">Pick a day on the left and write your first report.</EmptyState></div> : null}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Modal from "../../components/Modal"
import ProjectContextBar from "../../components/ProjectContextBar"
import { dbMessage } from "../../components/editor/PinParts"
import { EmptyState, PageHead, StatCard, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { categoryLabels, severityChip, severityLabels, severityRank, type Pin, type PinSeverity } from "../../lib/blueprints"
import { useConfirm } from "../../lib/confirm"
import { followLink } from "../../lib/notifications"
import { daysBetween, downloadCsv, isOverdue, severityOrder, toCsv } from "../../lib/progress"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { EngineerPageProps } from "./types"

type Tab = "open" | "resolved"

// When each pin was last marked as an issue (from its timeline), so the register can show how long it has been open.
function useRaisedDates(projectId: string | null, version: number) {
  const [raised, setRaised] = useState<Record<string, string>>({})
  const [everRaised, setEverRaised] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!projectId) return
    let active = true
    supabase
      .from("pin_events")
      .select("pin_id,created_at")
      .eq("project_id", projectId)
      .eq("kind", "status")
      .eq("to_status", "issue")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return
        const latest: Record<string, string> = {}
        for (const row of (data as Array<{ pin_id: string; created_at: string }> | null) ?? []) latest[row.pin_id] = row.created_at
        setRaised(latest)
        setEverRaised(new Set(Object.keys(latest)))
      })
    return () => {
      active = false
    }
  }, [projectId, version])
  return { raised, everRaised }
}

export default function EngineerReportIssue({ onNavigate }: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const toast = useToast()
  const confirm = useConfirm()
  const [version, setVersion] = useState(0)
  const { raised, everRaised } = useRaisedDates(projectId, version)
  const [tab, setTab] = useState<Tab>("open")
  const [query, setQuery] = useState("")
  const [severity, setSeverity] = useState<PinSeverity | "all">("all")
  const [logging, setLogging] = useState(false)
  const [reopening, setReopening] = useState<Pin | null>(null)

  const refresh = useCallback(async () => {
    await work.reloadPins()
    setVersion((value) => value + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work.reloadPins])

  const foremen = work.team.filter((member) => member.role === "foreman")
  const open = work.pins.filter((pin) => pin.status === "issue")
  const resolved = work.pins.filter((pin) => pin.status === "verified" && everRaised.has(pin.id))

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase()
    const source = tab === "open" ? open : resolved
    return source
      .filter((pin) => (severity === "all" || pin.severity === severity) && (!text || `${pin.title} ${pin.description ?? ""} ${work.sheetOf(pin.blueprint_id)}`.toLowerCase().includes(text)))
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || (raised[a.id] ?? a.updated_at).localeCompare(raised[b.id] ?? b.updated_at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, open, resolved, query, severity, raised])

  const ageOf = (pin: Pin) => {
    const days = daysBetween((raised[pin.id] ?? pin.updated_at).slice(0, 10), work.today)
    return days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`
  }

  const patch = async (pin: Pin, changes: Record<string, unknown>, success: string) => {
    const { data, error } = await supabase.from("pins").update(changes).eq("id", pin.id).select("id")
    if (error || !data?.length) return toast.error("Not saved", error ? dbMessage(error) : "You may not be allowed to edit this pin.")
    toast.success(success)
    await refresh()
  }

  const close = async (pin: Pin) => {
    if (!(await confirm({ title: `Close "${pin.title}"?`, message: "Mark the issue as fixed and verified. The foreman and the client are notified.", confirmLabel: "Close as verified" }))) return
    await patch(pin, { status: "verified" }, "Issue closed")
  }

  const exportCsv = () => {
    const header = ["Title", "Sheet", "Category", "Severity", "Status", "Assigned to", "Raised", "Open for", "Due", "Description"]
    const body = rows.map((pin) => [pin.title, work.sheetOf(pin.blueprint_id), categoryLabels[pin.category], severityLabels[pin.severity], tab === "open" ? "Open" : "Resolved", work.nameOf(pin.assigned_to), (raised[pin.id] ?? pin.updated_at).slice(0, 10), tab === "open" ? ageOf(pin) : "", pin.due_date ?? "", pin.description ?? ""])
    downloadCsv(`issue-register-${work.project?.code ?? "project"}-${work.today}.csv`, toCsv(header, body))
    toast.success("Exported", `${rows.length} issue${rows.length === 1 ? "" : "s"}`)
  }

  const counts = Object.fromEntries(severityOrder.map((level) => [level, open.filter((pin) => pin.severity === level).length])) as Record<PinSeverity, number>

  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Quality"
        title="Issue register"
        description="Every problem found on site, how serious it is and how long it has been open. Assign it, send it back to the foreman, or close it when it is fixed."
        actions={
          <>
            <button type="button" className={buttonSecondary} onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
            <button type="button" className={buttonPrimary} onClick={() => setLogging(true)} disabled={!projectId}>Log an issue</button>
          </>
        }
      />

      {!projectId ? null : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Open issues" value={open.length} tone={open.length ? "red" : "green"} note={open.length ? `${open.filter((pin) => isOverdue(pin, work.today)).length} past deadline` : "Nothing open"} />
            <StatCard label="Critical" value={counts.critical} tone="red" note="Fix first" onClick={() => { setTab("open"); setSeverity("critical") }} />
            <StatCard label="High" value={counts.high} tone="amber" onClick={() => { setTab("open"); setSeverity("high") }} />
            <StatCard label="Resolved" value={resolved.length} tone="green" note="Closed after an issue" onClick={() => setTab("resolved")} />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm" role="tablist" aria-label="Issue list">
              {([["open", `Open (${open.length})`], ["resolved", `Resolved (${resolved.length})`]] as const).map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${tab === key ? "bg-brand text-white shadow-[0_6px_14px_-8px_rgba(158,31,147,0.9)]" : "text-fg-muted hover:bg-surface-muted hover:text-fg"}`}>{label}</button>
              ))}
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search issues..." aria-label="Search issues" className={`${inputClass} !w-56`} />
            <select value={severity} onChange={(event) => setSeverity(event.target.value as PinSeverity | "all")} aria-label="Filter by severity" className={`${inputClass} !w-40`}>
              <option value="all">All severities</option>
              {severityOrder.map((level) => <option key={level} value={level}>{severityLabels[level]}</option>)}
            </select>
          </div>

          {work.loading ? (
            <SkeletonList rows={5} label="Loading issues" />
          ) : rows.length === 0 ? (
            <EmptyState title={tab === "open" ? (open.length ? "No issue matches" : "No open issues") : "No resolved issues yet"}>
              {tab === "open" && !open.length ? "Mark a pin as an issue on the plan, or press \"Log an issue\"." : "Change the search or the severity filter."}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wider text-fg-muted">
                  <tr>
                    <th className="px-4 py-2.5">Issue</th>
                    <th className="px-3 py-2.5">Severity</th>
                    <th className="px-3 py-2.5">{tab === "open" ? "Open for" : "Closed"}</th>
                    <th className="px-3 py-2.5">Assigned to</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((pin) => (
                    <tr key={pin.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-bold text-fg">{pin.title}</p>
                        <p className="text-xs text-fg-muted">{work.sheetOf(pin.blueprint_id)} • {categoryLabels[pin.category]}{pin.due_date && isOverdue(pin, work.today) ? " • past deadline" : ""}</p>
                        {pin.description ? <p className="mt-1 line-clamp-2 max-w-md text-xs text-fg-muted">{pin.description}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        {tab === "open" ? (
                          <select value={pin.severity} aria-label={`Severity of ${pin.title}`} onChange={(event) => void patch(pin, { severity: event.target.value }, "Severity updated")} className={`rounded-md border-0 px-2 py-1 text-xs font-extrabold ${severityChip[pin.severity]}`}>
                            {severityOrder.map((level) => <option key={level} value={level}>{severityLabels[level]}</option>)}
                          </select>
                        ) : (
                          <span className={`rounded px-2 py-1 text-xs font-extrabold ${severityChip[pin.severity]}`}>{severityLabels[pin.severity]}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-fg-muted">{tab === "open" ? ageOf(pin) : pin.verified_at ? new Date(pin.verified_at).toLocaleDateString("en-PH", { day: "numeric", month: "short" }) : ""}</td>
                      <td className="px-3 py-3">
                        {tab === "open" ? (
                          <select value={pin.assigned_to ?? ""} aria-label={`Assign ${pin.title}`} onChange={(event) => void patch(pin, { assigned_to: event.target.value || null }, "Assignment updated")} className="max-w-[10rem] rounded-md border border-line bg-surface px-2 py-1 text-xs">
                            <option value="">Anyone</option>
                            {foremen.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}
                          </select>
                        ) : (
                          <span className="text-fg-muted">{work.nameOf(pin.assigned_to)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button type="button" className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-surface-muted" onClick={() => followLink(`/engineer/annotation?project=${pin.project_id}&pin=${pin.id}`, pin.project_id)}>Plan</button>
                          {tab === "open" ? (
                            <>
                              <button type="button" className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-surface-muted" onClick={() => setReopening(pin)}>Back to foreman</button>
                              <button type="button" className="rounded-md bg-green-700 px-2.5 py-1 text-xs font-bold text-white hover:bg-green-800" onClick={() => void close(pin)}>Close</button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {logging ? <LogIssueModal pins={work.pins} sheetOf={work.sheetOf} onClose={() => setLogging(false)} onDone={async () => { setLogging(false); setTab("open"); await refresh() }} /> : null}
      {reopening ? <BackToForemanModal pin={reopening} onClose={() => setReopening(null)} onDone={async () => { setReopening(null); await refresh() }} /> : null}
      <p className="mt-6 text-xs text-fg-muted">Tip: foremen and engineers can also mark a pin as an issue directly on the plan. <button type="button" className="inline-flex min-h-6 items-center font-bold text-brand-text underline" onClick={() => onNavigate("annotation")}>Open the plan</button></p>
    </div>
  )
}

function LogIssueModal({ pins, sheetOf, onClose, onDone }: { pins: Pin[]; sheetOf: (id: string) => string; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const candidates = pins.filter((pin) => pin.status !== "issue" && pin.category !== "note")
  const [pinId, setPinId] = useState(candidates[0]?.id ?? "")
  const [severity, setSeverity] = useState<PinSeverity>("medium")
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!pinId) return setError("Pick the pin where the problem is.")
    if (reason.trim().length < 5) return setError("Describe the problem (at least 5 characters).")
    setError("")
    setBusy(true)
    const { data, error: updateError } = await supabase.from("pins").update({ status: "issue", severity }).eq("id", pinId).select("id")
    if (updateError || !data?.length) {
      setBusy(false)
      return setError(updateError ? dbMessage(updateError) : "You may not be allowed to change this pin.")
    }
    const { error: commentError } = await supabase.from("pin_events").insert({ pin_id: pinId, project_id: "00000000-0000-0000-0000-000000000000", kind: "comment", note: `Issue: ${reason.trim()}`.slice(0, 2000) })
    setBusy(false)
    if (commentError) toast.error("Logged, but the description was not saved", dbMessage(commentError))
    else toast.success("Issue logged")
    await onDone()
  }

  return (
    <Modal title="Log an issue" description="Mark an existing pin as a problem. To mark a new spot, add a pin on the plan first." onClose={busy ? () => undefined : onClose}
      footer={<><button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="log-issue-form" className={buttonDanger} disabled={busy || !candidates.length}>{busy ? "Saving..." : "Log issue"}</button></>}>
      {!candidates.length ? (
        <p className="text-sm text-fg-muted">There are no pins to mark yet. Add pins on the plan first.</p>
      ) : (
        <form id="log-issue-form" className="space-y-3" noValidate onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-semibold">Pin
            <select className={`${inputClass} mt-1`} value={pinId} onChange={(event) => setPinId(event.target.value)}>
              {candidates.map((pin) => <option key={pin.id} value={pin.id}>{pin.title} ({sheetOf(pin.blueprint_id)})</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Severity
            <select className={`${inputClass} mt-1`} value={severity} onChange={(event) => setSeverity(event.target.value as PinSeverity)}>
              {severityOrder.slice().reverse().map((level) => <option key={level} value={level}>{severityLabels[level]}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">What is wrong? *
            <textarea className={`${inputClass} mt-1`} rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          {error ? <p role="alert" className="text-sm text-danger-fg">{error}</p> : null}
        </form>
      )}
    </Modal>
  )
}

function BackToForemanModal({ pin, onClose, onDone }: { pin: Pin; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (note.trim().length < 5) return setError("Tell the foreman what to fix (at least 5 characters).")
    setBusy(true)
    const { data, error: updateError } = await supabase.from("pins").update({ status: "in_progress" }).eq("id", pin.id).select("id")
    if (updateError || !data?.length) {
      setBusy(false)
      return setError(updateError ? dbMessage(updateError) : "You may not be allowed to change this pin.")
    }
    const { error: commentError } = await supabase.from("pin_events").insert({ pin_id: pin.id, project_id: "00000000-0000-0000-0000-000000000000", kind: "comment", note: `Please fix: ${note.trim()}`.slice(0, 2000) })
    setBusy(false)
    if (commentError) toast.error("Reopened, but the note was not saved", dbMessage(commentError))
    else toast.success("Sent back to the foreman")
    await onDone()
  }

  return (
    <Modal title="Send back to the foreman" description={pin.title} onClose={busy ? () => undefined : onClose}
      footer={<><button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>Cancel</button><button type="submit" form="back-foreman-form" className={buttonPrimary} disabled={busy}>{busy ? "Sending..." : "Send back"}</button></>}>
      <form id="back-foreman-form" noValidate onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-semibold">What should the foreman do? *
          <textarea className={`${inputClass} mt-1`} rows={4} maxLength={1000} autoFocus value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error ? <p role="alert" className="mt-2 text-sm text-danger-fg">{error}</p> : null}
        <p className="mt-3 text-xs text-fg-muted">The pin goes back to "In progress" and the note is saved in its timeline.</p>
      </form>
    </Modal>
  )
}

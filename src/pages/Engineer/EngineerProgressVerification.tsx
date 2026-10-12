import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Modal from "../../components/Modal"
import ProjectContextBar from "../../components/ProjectContextBar"
import { PinChecklist, PinPhotos, PinTimeline, ProgressTracker, dbMessage } from "../../components/editor/PinParts"
import { EmptyState, PageHead, StatCard, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { categoryLabels, formatStamp, severityChip, severityLabels, severityRank, statusChip, statusLabels, type Pin } from "../../lib/blueprints"
import { useAuth } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { followLink } from "../../lib/notifications"
import { daysBetween, isOverdue } from "../../lib/progress"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import { usePinQuality } from "../../lib/qaLite"
import { defectStatusLabels, inspectionStatusLabels, inspectionTone, pinQualityWarning, qaSeverityLabels, refNumber, severityTone } from "../../lib/qaModel"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { EngineerPageProps } from "./types"

type Filter = "all" | "overdue" | "serious"

const waiting = (pin: Pin, today: string) => {
  const days = daysBetween(pin.updated_at.slice(0, 10), today)
  return days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`
}

// The Engineer's inspection queue: everything a foreman sent for review, oldest first. Approve it or send it back with a reason.
export default function EngineerProgressVerification({ onNavigate }: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")

  const queue = useMemo(() => {
    return work.pins
      .filter((pin) => pin.status === "for_review")
      .filter((pin) => (filter === "overdue" ? isOverdue(pin, work.today) : filter === "serious" ? severityRank[pin.severity] >= 2 : true))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
  }, [work.pins, work.today, filter])

  const allInReview = work.pins.filter((pin) => pin.status === "for_review")
  const recent = useMemo(() => work.pins.filter((pin) => pin.status === "verified" && pin.verified_at).sort((a, b) => (b.verified_at ?? "").localeCompare(a.verified_at ?? "")).slice(0, 5), [work.pins])
  const selected = queue.find((pin) => pin.id === selectedId) ?? null

  // Keep a pin selected so the detail never sits empty while there is work.
  useEffect(() => {
    if (!selected && queue.length) setSelectedId(queue[0].id)
    if (!queue.length) setSelectedId(null)
  }, [queue, selected])

  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Inspection"
        title="Verification queue"
        description="Work the foreman reported as done. Check the checklist and photos, then approve it or send it back with a reason."
        actions={<button type="button" className={buttonSecondary} onClick={() => onNavigate("annotation")}>Open the plan</button>}
      />

      {!projectId ? null : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Waiting for review" value={allInReview.length} tone="amber" note={allInReview.length ? `oldest ${waiting(allInReview.sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0], work.today)}` : "Nothing waiting"} />
            <StatCard label="Open issues" value={work.pins.filter((pin) => pin.status === "issue").length} tone="red" onClick={() => onNavigate("report-issue")} note="See the issue register" />
            <StatCard label="Verified" value={work.pins.filter((pin) => pin.status === "verified").length} tone="green" note={`of ${work.pins.filter((pin) => pin.category !== "note").length} work pins`} />
            <StatCard label="In progress" value={work.pins.filter((pin) => pin.status === "in_progress").length} tone="sky" note="Being worked on" />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Filter the queue">
            {([["all", "All"], ["overdue", "Overdue"], ["serious", "High or critical"]] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-full border px-3 py-1 text-xs font-bold transition ${filter === key ? "border-brand bg-brand text-white" : "border-line text-fg hover:bg-surface-muted"}`}>
                {label}
              </button>
            ))}
          </div>

          {work.loading ? (
            <SkeletonList rows={4} label="Loading the queue" />
          ) : queue.length === 0 ? (
            <EmptyState title={filter === "all" ? "All caught up" : "Nothing matches this filter"} action={filter !== "all" ? <button type="button" className={buttonSecondary} onClick={() => setFilter("all")}>Show everything</button> : undefined}>
              {filter === "all" ? "When a foreman sends work for review it appears here, and you get a notification." : "Try another filter."}
            </EmptyState>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
              <ul className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1" aria-label="Pins waiting for review">
                {queue.map((pin) => (
                  <li key={pin.id}>
                    <button type="button" onClick={() => setSelectedId(pin.id)} aria-current={pin.id === selectedId} className={`w-full rounded-xl border p-3 text-left transition ${pin.id === selectedId ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-surface-muted"}`}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-extrabold leading-snug text-fg">{pin.title}</span>
                        <span className={`flex-none rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase ${severityChip[pin.severity]}`}>{severityLabels[pin.severity]}</span>
                      </span>
                      <span className="mt-1 block text-xs text-fg-muted">{work.sheetOf(pin.blueprint_id)} • {work.nameOf(pin.assigned_to)}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-semibold text-fg-muted">Waiting {waiting(pin, work.today)}</span>
                        {isOverdue(pin, work.today) ? <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-800 dark:bg-red-900/40 dark:text-red-200">Overdue</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {selected ? <ReviewPanel key={selected.id} pin={selected} sheet={work.sheetOf(selected.blueprint_id)} foreman={work.nameOf(selected.assigned_to)} onDecided={async () => { await work.reloadPins() }} /> : null}
            </div>
          )}

          {recent.length ? (
            <section className="mt-8">
              <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Recently verified</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {recent.map((pin) => (
                  <li key={pin.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="font-semibold">{pin.title} <span className="font-normal text-fg-muted">• {work.sheetOf(pin.blueprint_id)}</span></span>
                    <span className="text-xs text-fg-muted">{pin.verified_at ? formatStamp(pin.verified_at) : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

function ReviewPanel({ pin, sheet, foreman, onDecided }: { pin: Pin; sheet: string; foreman: string; onDecided: () => Promise<void> }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [checklist, setChecklist] = useState({ done: 0, total: 0 })
  const [busy, setBusy] = useState(false)
  const [sendingBack, setSendingBack] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const quality = usePinQuality(pin.id)
  const qualityWarning = pinQualityWarning(quality)
  // Stable callback: the checklist reports its counts from an effect, so a new function each render would loop.
  const onChecklist = useCallback((done: number, total: number) => setChecklist((current) => (current.done === done && current.total === total ? current : { done, total })), [])

  const approve = async () => {
    const missing = checklist.total - checklist.done
    const ok = await confirm({
      title: `Verify "${pin.title}"?`,
      message: `${qualityWarning ? qualityWarning + " " : ""}${missing > 0 ? `${missing} of ${checklist.total} checklist items are not ticked. Verifying marks the work as accepted and notifies the foreman and the client.` : "This marks the work as accepted and notifies the foreman and the client."}`,
      confirmLabel: "Verify work",
    })
    if (!ok) return
    setBusy(true)
    const { data, error } = await supabase.from("pins").update({ status: "verified" }).eq("id", pin.id).select("id")
    setBusy(false)
    if (error || !data?.length) return toast.error("Could not verify", error ? dbMessage(error) : "You may not be allowed to verify this pin.")
    toast.success("Verified", pin.title)
    await onDecided()
  }

  return (
    <article className="min-w-0 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-fg-muted">{sheet} • {categoryLabels[pin.category]}</p>
          <h2 className="text-xl font-extrabold text-fg">{pin.title}</h2>
          <p className="mt-1 text-sm text-fg-muted">Reported by {foreman}{pin.due_date ? ` • due ${new Date(pin.due_date + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
      </header>
      {pin.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{pin.description}</p> : null}

      <div className="mt-4"><ProgressTracker status={pin.status} /></div>

      <section className="mt-5">
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Checklist</h3>
        <PinChecklist pinId={pin.id} canEdit={false} canTick={false} onChange={onChecklist} />
      </section>
      <section className="mt-5">
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Photos</h3>
        <PinPhotos pin={pin} canAdd={false} canRemoveAny={false} meId={profile?.id ?? ""} columns={4} />
      </section>
      {quality && (quality.inspections.length || quality.defects.length) ? (
        <section className="mt-5" aria-label="Quality record">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Quality record</h3>
          {qualityWarning ? <p role="status" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">{qualityWarning}</p> : null}
          <ul className="space-y-1.5">
            {quality.inspections.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => followLink(`/engineer/qa?project=${pin.project_id}&tab=inspections&inspection=${row.id}`, pin.project_id)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-surface-muted">
                  <strong className="tabular-nums">{refNumber("ir", row.number)}</strong>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  {row.score !== null ? <span className="text-xs font-bold tabular-nums">{row.score}%</span> : null}
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase ${inspectionTone[row.status]}`}>{inspectionStatusLabels[row.status]}</span>
                </button>
              </li>
            ))}
            {quality.defects.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => followLink(`/engineer/qa?project=${pin.project_id}&tab=defects&defect=${row.id}`, pin.project_id)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-surface-muted">
                  <strong className="tabular-nums">{refNumber("ncr", row.number)}</strong>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase ${severityTone[row.severity]}`}>{qaSeverityLabels[row.severity]}</span>
                  <span className="text-xs font-bold text-fg-muted">{defectStatusLabels[row.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="mt-5">
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Timeline</h3>
        <PinTimeline pinId={pin.id} canComment refreshKey={refresh} />
      </section>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <button type="button" className={buttonSecondary} onClick={() => followLink(`/engineer/annotation?project=${pin.project_id}&pin=${pin.id}`, pin.project_id)}>Open on the plan</button>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonSecondary} disabled={busy} onClick={() => setSendingBack(true)}>Send back</button>
          <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void approve()}>{busy ? "Saving..." : "Verify work"}</button>
        </div>
      </footer>

      {sendingBack ? <SendBackModal pin={pin} onClose={() => setSendingBack(false)} onDone={async () => { setSendingBack(false); setRefresh((value) => value + 1); await onDecided() }} /> : null}
    </article>
  )
}

function SendBackModal({ pin, onClose, onDone }: { pin: Pin; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useToast()
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (reason.trim().length < 5) return setError("Tell the foreman what needs to be fixed (at least 5 characters).")
    setError("")
    setBusy(true)
    const { data, error: updateError } = await supabase.from("pins").update({ status: "in_progress" }).eq("id", pin.id).select("id")
    if (updateError || !data?.length) {
      setBusy(false)
      return setError(updateError ? dbMessage(updateError) : "You may not be allowed to change this pin.")
    }
    const { error: commentError } = await supabase.from("pin_events").insert({ pin_id: pin.id, project_id: "00000000-0000-0000-0000-000000000000", kind: "comment", note: `Sent back: ${reason.trim()}`.slice(0, 2000) })
    setBusy(false)
    if (commentError) toast.error("Sent back, but the reason was not saved", dbMessage(commentError))
    else toast.success("Sent back to the foreman", pin.title)
    await onDone()
  }

  return (
    <Modal
      title="Send back for more work"
      description={pin.title}
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form="send-back-form" className={buttonDanger} disabled={busy}>{busy ? "Sending..." : "Send back"}</button>
        </>
      }
    >
      <form id="send-back-form" noValidate onSubmit={(event) => void submit(event)}>
        <label className="block text-sm font-semibold">
          What needs to be fixed? *
          <textarea className={`${inputClass} mt-1`} rows={4} maxLength={1000} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Rebar spacing on grid C is wider than the plan. Re-do and add a photo." />
        </label>
        {error ? <p role="alert" className="mt-2 text-sm text-danger-fg">{error}</p> : null}
        <p className="mt-3 text-xs text-fg-muted">The pin goes back to "In progress", the foreman is notified and your reason is saved in the timeline.</p>
      </form>
    </Modal>
  )
}

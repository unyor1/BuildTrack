import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Modal from "../../components/Modal"
import ProjectContextBar from "../../components/ProjectContextBar"
import { PinChecklist, PinTimeline, ProgressTracker, dbMessage } from "../../components/editor/PinParts"
import ChecklistPhotos from "../../components/ChecklistPhotos"
import DefectDetail from "../../components/qa/DefectDetail"
import InspectionDetail from "../../components/qa/InspectionDetail"
import { Chip } from "../../components/qa/QaBits"
import WorkItemBoard from "../../components/qa/WorkItemBoard"
import WorkItemWorkspace from "../../components/qa/WorkItemWorkspace"
import { PageHead, StatCard, buttonDanger, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { categoryLabels, formatStamp, statusChip, statusLabels, type Pin } from "../../lib/blueprints"
import { useAuth } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { followLink } from "../../lib/notifications"
import { getSelectedProjectId } from "../../lib/projects"
import { usePinQuality } from "../../lib/qaLite"
import { defectStatusLabels, defectTone, inspectionStatusLabels, inspectionTone, pinQualityWarning, qaSeverityLabels, refNumber, severityTone } from "../../lib/qaModel"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import { supabase } from "../../lib/supabase"
import { usePinQa } from "../../lib/pinQa"
import { useToast } from "../../lib/toast"
import { selectedVerification } from "../../lib/verificationViewModel"
import { useItemParam, useWorkItems } from "../../lib/workItem"
import type { EngineerPageProps } from "./types"

const listButton = "flex w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm hover:bg-surface-muted"

// The Engineer's review inbox: everything waiting for an Engineer decision, grouped by the decision. One guided review per work item
// (inspect -> decide its NCR corrections -> accept), stage / hold-point requests and NCRs outside work items listed separately.
// The QA register is for searching, exports and history; this page is for acting.
export default function EngineerProgressVerification({ onNavigate }: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  const work = ws.work
  const items = useWorkItems(projectId, work.pins, ws.inspections, ws.defects)
  const [itemId, setItemId] = useItemParam()
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [defectId, setDefectId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(new URLSearchParams(window.location.search).get("pin"))
  useEffect(() => { const changed = () => setSelectedId(new URLSearchParams(window.location.search).get("pin")); window.addEventListener("popstate", changed); return () => window.removeEventListener("popstate", changed) }, [])
  useEffect(() => { setSelectedId(new URLSearchParams(window.location.search).get("pin")) }, [projectId])

  const rows = items.rows
  const linked = useMemo(() => new Set(rows.flatMap((row) => row.ncrs.map((ncr) => ncr.id))), [rows])
  const groups = [
    { key: "inspect", short: "Inspect", title: "Inspect", hint: "Requested or in progress: record the results against the inspection criteria.", rows: rows.filter((row) => row.view.action === "inspect") },
    { key: "ncrs", short: "NCRs", title: "Decide NCR corrections", hint: "The Foreman's correction package is in: close each NCR or send it back (sending back returns the work item).", rows: rows.filter((row) => row.view.action !== "inspect" && row.ncrs.some((ncr) => ncr.status === "for_verification")) },
    { key: "accept", short: "Accept", title: "Accept", hint: "Inspection passed and every linked NCR is closed.", rows: rows.filter((row) => row.view.action === "accept") },
    { key: "criteria", short: "Criteria missing", title: "Add criteria to existing items", hint: "These older items need criteria. New items include criteria when created.", rows: rows.filter((row) => row.view.action === "approve_criteria") },
  ]
  const yours = new Set(groups.flatMap((group) => group.rows.map((row) => row.item.id))).size
  const stageOpen = ws.inspections.filter((row) => (row.status === "requested" || row.status === "in_progress") && !items.workInspectionIds.has(row.id))
  const otherNcrs = ws.defects.filter((row) => row.status === "for_verification" && !linked.has(row.id))
  // Every item accepted but the work is not Completed: something outside the items still blocks it (NCR, stage inspection).
  const blockedPins = work.pins.filter((pin) => pin.status !== "verified" && rows.some((row) => row.pin.id === pin.id) && rows.filter((row) => row.pin.id === pin.id).every((row) => row.item.review_status === "verified"))
  // Older whole-work submissions without item review keep the earlier review dialog.
  const legacy = work.pins.filter((pin) => pin.status === "for_review" && !rows.some((row) => row.pin.id === pin.id && row.attempts > 0))
  const recent = useMemo(() => work.pins.filter((pin) => pin.status === "verified" && pin.verified_at).sort((a, b) => (b.verified_at ?? "").localeCompare(a.verified_at ?? "")).slice(0, 5), [work.pins])
  const selected = selectedVerification(work.pins, projectId, selectedId)
  const closeReview = () => {
    setSelectedId(null)
    const url = new URL(window.location.href)
    url.searchParams.delete("pin")
    window.history.replaceState({}, "", url)
  }
  const reload = async () => { await Promise.all([ws.reloadAll(), items.reload()]) }
  const inspection = ws.inspections.find((row) => row.id === inspectionId) ?? null
  const defect = ws.defects.find((row) => row.id === defectId) ?? null
  const project = ws.project ? { id: ws.project.id, name: ws.project.name, code: ws.project.code, location: ws.project.location } : null

  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Inspection"
        title="Review inbox"
        description="What waits for your decision, one work item at a time: inspect it, decide the NCR corrections that came with it, then accept it. The work is Completed automatically when every item is accepted and every NCR and inspection is clear."
        actions={<><button type="button" className={buttonSecondary} onClick={() => onNavigate("qa")}>QA register</button><button type="button" className={buttonSecondary} onClick={() => onNavigate("annotation")}>Open the plan</button></>}
      />

      {!projectId ? null : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Waiting for you" value={yours + stageOpen.length + otherNcrs.length + legacy.length} tone="amber" note={`${yours} work item${yours === 1 ? "" : "s"} · ${stageOpen.length} stage request${stageOpen.length === 1 ? "" : "s"}`} />
            <StatCard label="Waiting for the Foreman" value={rows.filter((row) => row.view.owner === "Foreman" && row.view.stage !== "preparing").length} tone="sky" note="Ready to submit or correcting" />
            <StatCard label="Open NCRs" value={ws.defects.filter((row) => row.status !== "closed").length} tone="red" onClick={() => onNavigate("qa")} note="See the QA register" />
            <StatCard label="Completed work" value={work.pins.filter((pin) => pin.status === "verified").length} tone="green" note={`of ${work.pins.filter((pin) => pin.category !== "note").length} work pins`} />
          </div>

          <WorkItemBoard groups={groups} loading={items.loading || ws.loading} error={items.error || ws.error} nameOf={ws.nameOf} sheetOf={work.sheetOf} onOpen={setItemId}
            emptyTitle="All caught up" emptyText="When a Foreman submits a work item or a correction package, it appears here and you get a notification." />

          {stageOpen.length ? <section className="mt-8" aria-labelledby="stage-open">
            <h2 id="stage-open" className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Stage and hold-point requests ({stageOpen.length})</h2>
            <ul className="space-y-1.5">{stageOpen.map((row) => <li key={row.id}><button type="button" className={listButton} onClick={() => setInspectionId(row.id)}><strong>{refNumber("ir", row.number)}</strong><span className="min-w-0 flex-1 truncate">{row.title}</span><Chip tone="bg-surface-muted text-fg">Stage / hold point</Chip><Chip tone={inspectionTone[row.status]}>{inspectionStatusLabels[row.status]}</Chip></button></li>)}</ul>
          </section> : null}

          {otherNcrs.length ? <section className="mt-8" aria-labelledby="other-ncrs">
            <h2 id="other-ncrs" className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">NCRs to verify outside work items ({otherNcrs.length})</h2>
            <ul className="space-y-1.5">{otherNcrs.map((row) => <li key={row.id}><button type="button" className={listButton} onClick={() => setDefectId(row.id)}><strong>{refNumber("ncr", row.number)}</strong><span className="min-w-0 flex-1 truncate">{row.title}</span><Chip tone={severityTone[row.severity]}>{qaSeverityLabels[row.severity]}</Chip><Chip tone={defectTone[row.status]}>{defectStatusLabels[row.status]}</Chip></button></li>)}</ul>
          </section> : null}

          {blockedPins.length ? <section className="mt-8" aria-labelledby="blocked-work">
            <h2 id="blocked-work" className="mb-1 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Every item accepted, completion blocked ({blockedPins.length})</h2>
            <p className="mb-2 pl-4 text-xs text-fg-muted">An NCR or inspection outside the work items is still open. Clearing it completes the work automatically.</p>
            <ul className="space-y-1.5">{blockedPins.map((pin) => {
              const blockers = ws.defects.filter((row) => row.pin_id === pin.id && row.status !== "closed")
              return <li key={pin.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                <strong>{pin.title}</strong><span className="text-xs text-fg-muted">{work.sheetOf(pin.blueprint_id)}</span>
                <span className="ml-auto flex flex-wrap gap-1.5">{blockers.map((row) => <button key={row.id} type="button" className={buttonSecondary + " !py-1 !text-xs"} onClick={() => setDefectId(row.id)}>{refNumber("ncr", row.number)} · {defectStatusLabels[row.status]}</button>)}{!blockers.length ? <button type="button" className={buttonSecondary + " !py-1 !text-xs"} onClick={() => setSelectedId(pin.id)}>Review work</button> : null}</span>
              </li>
            })}</ul>
          </section> : null}

          {legacy.length ? <section className="mt-8" aria-labelledby="legacy-work">
            <h2 id="legacy-work" className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Older whole-work submissions ({legacy.length})</h2>
            <ul className="space-y-1.5">{legacy.map((pin) => <li key={pin.id}><button type="button" aria-haspopup="dialog" className={listButton} onClick={() => setSelectedId(pin.id)}><strong>{pin.title}</strong><span className="text-xs text-fg-muted">{work.sheetOf(pin.blueprint_id)} · {work.nameOf(pin.assigned_to)}</span><span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span></button></li>)}</ul>
          </section> : null}

          {recent.length ? (
            <section className="mt-8">
              <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Recently completed</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {recent.map((pin) => (
                  <li key={pin.id}><button type="button" aria-haspopup="dialog" onClick={() => setSelectedId(pin.id)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-muted focus-visible:outline-brand">
                    <span className="font-semibold">{pin.title} <span className="font-normal text-fg-muted">• {work.sheetOf(pin.blueprint_id)}</span></span>
                    <span className="text-xs text-fg-muted">{pin.verified_at ? formatStamp(pin.verified_at) : ""}</span>
                  </button></li>
                ))}
              </ul>
            </section>
          ) : null}
          {selected ? <ReviewPanel key={selected.id} pin={selected} sheet={work.sheetOf(selected.blueprint_id)} foreman={work.nameOf(selected.assigned_to)} onClose={closeReview} onDecided={reload} /> : null}
          {itemId ? <WorkItemWorkspace itemId={itemId} onClose={() => setItemId(null)} onChanged={reload} /> : null}
          {inspection && project ? <InspectionDetail key={inspection.id} inspection={inspection} project={project} weights={ws.weights} threshold={ws.threshold} defects={ws.defects} canInspect canRequest nameOf={ws.nameOf}
            onClose={() => setInspectionId(null)} onChanged={reload} onOpenDefect={(row) => { setInspectionId(null); setDefectId(row.id) }} onOpenInspection={setInspectionId} /> : null}
          {defect && project ? <DefectDetail key={defect.id} defect={defect} project={project} foremen={ws.foremen} today={ws.today} canWork={false} canVerify nameOf={ws.nameOf}
            onClose={() => setDefectId(null)} onChanged={reload} onOpenInspection={(id) => { setDefectId(null); setInspectionId(id) }} /> : null}
        </>
      )}
    </div>
  )
}

function ReviewPanel({ pin, sheet, foreman, onDecided, onClose }: { pin: Pin; sheet: string; foreman: string; onDecided: () => Promise<void>; onClose: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [checklist, setChecklist] = useState({ done: 0, total: 0 })
  const [busy, setBusy] = useState(false)
  const [sendingBack, setSendingBack] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [tab, setTab] = useState<"checklist" | "quality" | "photos" | "timeline">("checklist")
  const quality = usePinQuality(pin.id)
  const qa = usePinQa(pin.id)
  const qualityWarning = pinQualityWarning(quality)
  // Stable callback: the checklist reports its counts from an effect, so a new function each render would loop.
  const onChecklist = useCallback((done: number, total: number) => setChecklist((current) => (current.done === done && current.total === total ? current : { done, total })), [])

  // Same gate as the database (guard_pin_verification): the Foreman completed the checklist and QA is clear.
  const missing = checklist.total - checklist.done
  const blocker = qa.error || (!qa.state ? "Checking inspection requirements…" : qa.state.problem) || (missing > 0
    ? `The foreman has not completed the checklist yet (${missing} of ${checklist.total} items open). Send it back or wait for the foreman.`
    : qualityWarning ? `${qualityWarning} Resolve it in Quality before verifying.` : "")

  const approve = async () => {
    if (blocker || !quality) return
    const ok = await confirm({
      title: `Complete "${pin.title}"?`,
      message: "The checklist is complete and QA is clear. This marks step 4 Completed and notifies the Foreman and the client.",
      confirmLabel: "Complete work",
    })
    if (!ok) return
    setBusy(true)
    const { data, error } = await supabase.from("pins").update({ status: "verified" }).eq("id", pin.id).select("id")
    setBusy(false)
    if (error || !data?.length) return toast.error("Could not verify", error ? dbMessage(error) : "You may not be allowed to verify this pin.")
    toast.success("Completed", pin.title)
    await onDecided()
  }

  return (
    <Modal title={pin.title} description={`${sheet} · ${categoryLabels[pin.category]} · ${foreman}`} size="2xl" onClose={busy ? () => undefined : onClose} footer={<>
      <button type="button" className={buttonSecondary} disabled={busy} onClick={onClose}>Close details</button>
      <button type="button" className={buttonSecondary} onClick={() => followLink(`/engineer/annotation?project=${pin.project_id}&pin=${pin.id}`, pin.project_id)}>Open on the plan</button>
      {pin.status === "for_review" ? <button type="button" className={buttonSecondary} disabled={busy || Boolean(qa.state?.open)} onClick={() => setSendingBack(true)}>Send back</button> : null}
      {pin.status !== "verified" ? <button type="button" className={buttonPrimary} disabled={busy || Boolean(blocker) || !quality} title={blocker || undefined} onClick={() => void approve()}>{busy ? "Saving..." : "Complete work"}</button> : null}
    </>}>
    <article className="min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-fg-muted">{sheet} • {categoryLabels[pin.category]}</p>
          <p className="mt-1 text-sm text-fg-muted">Reported by {foreman}{pin.due_date ? ` • due ${new Date(pin.due_date + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}` : ""}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
      </header>
      {pin.description ? <p className="mt-3 whitespace-pre-wrap text-sm">{pin.description}</p> : null}

      <div className="mt-4"><ProgressTracker status={pin.status} /></div>

      {pin.status !== "verified" && blocker ? <div role="status" className="mt-4 rounded-xl border border-line bg-surface-muted p-3 text-sm text-fg-muted"><strong>Before completing work: </strong>{blocker}{quality?.defects.some(row => row.status !== "closed") ? <button type="button" className="ml-2 font-bold text-brand-text underline" onClick={() => setTab("quality")}>Review open NCRs</button> : null}</div> : null}
      <div className="mt-5 flex flex-wrap gap-1 border-b border-line pb-2" role="tablist" aria-label="Work review sections">
        {([ ["checklist", "Checklist"], ["quality", "QA & NCRs"], ["photos", "Photos"], ["timeline", "Timeline"] ] as const).map(([key, label]) => <button key={key} id={`review-tab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`review-section-${key}`} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === key ? "bg-brand text-white" : "text-fg-muted hover:bg-surface-muted"}`}>{label}</button>)}
      </div>

      <section hidden={tab !== "checklist"} id="review-section-checklist" role="tabpanel" aria-labelledby="review-tab-checklist" className="mt-5">
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Checklist</h3>
        <PinChecklist pin={pin} canEdit={false} canTick={false} onChange={onChecklist} onPinChanged={onDecided} />
      </section>
      {tab === "photos" ? <section id="review-section-photos" role="tabpanel" aria-labelledby="review-tab-photos" className="mt-5">
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Photos</h3>
        <ChecklistPhotos pin={pin} />
      </section> : null}
      {tab === "quality" ? (
        <section id="review-section-quality" role="tabpanel" aria-labelledby="review-tab-quality" className="mt-5">
          <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Quality record</h3>
          {qualityWarning ? <p role="status" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">{qualityWarning}</p> : null}
          {!quality ? <p role="status" className="text-sm text-fg-muted">Loading quality records. If this persists, refresh to retry.</p> : !quality.inspections.length && !quality.defects.length ? <p className="text-sm text-fg-muted">No QA records yet.</p> : null}
          <ul className="max-h-96 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
            {quality?.inspections.map((row) => (
              <li key={row.id}>
                <button type="button" onClick={() => followLink(`/engineer/qa?project=${pin.project_id}&tab=inspections&inspection=${row.id}`, pin.project_id)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-surface-muted">
                  <strong className="tabular-nums">{refNumber("ir", row.number)}</strong>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  {row.score !== null ? <span className="text-xs font-bold tabular-nums">{row.score}%</span> : null}
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold uppercase ${inspectionTone[row.status]}`}>{inspectionStatusLabels[row.status]}</span>
                </button>
              </li>
            ))}
            {quality?.defects.map((row) => (
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
      {tab === "timeline" ? <section id="review-section-timeline" role="tabpanel" aria-labelledby="review-tab-timeline" className="mt-5">
        <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Timeline</h3>
        <PinTimeline pinId={pin.id} canComment refreshKey={refresh} />
      </section> : null}

      {sendingBack ? <SendBackModal pin={pin} onClose={() => setSendingBack(false)} onDone={async () => { setSendingBack(false); setRefresh((value) => value + 1); await onDecided() }} /> : null}
    </article>
    </Modal>
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
    const { error: updateError } = await supabase.rpc("return_pin_for_correction", { p_pin: pin.id, p_reason: reason.trim() })
    if (updateError) {
      setBusy(false)
      return setError(updateError ? dbMessage(updateError) : "You may not be allowed to change this pin.")
    }
    setBusy(false)
    toast.success("Sent back to the foreman", pin.title)
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
          Which items failed and what needs to be fixed? *
          <textarea className={`${inputClass} mt-1`} rows={4} maxLength={1000} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Rebar spacing on grid C is wider than the plan. Re-do and add a photo." />
        </label>
        {error ? <p role="alert" className="mt-2 text-sm text-danger-fg">{error}</p> : null}
        <p className="mt-3 text-xs text-fg-muted">The pin goes back to "In progress", the foreman is notified and your reason is saved in the timeline.</p>
      </form>
    </Modal>
  )
}

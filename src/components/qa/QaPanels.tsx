import DefectTrends from "./DefectTrends"
import { useMemo, useState } from "react"
import Modal from "../Modal"
import { EmptyState, Meter, StatCard, buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import { SkeletonKpis, SkeletonList } from "../ui/Skeleton"
import { Chip, HoldChip, SeverityChip } from "./QaBits"
import { useAuth } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { downloadCsv, toCsv } from "../../lib/progress"
import { printHtml } from "../../lib/printReport"
import {
  defectStatusLabels, defectTone, dueState, dueText, inspectionStatusLabels, inspectionTone, qaActions, qaSeverityLabels, refNumber, severities, severityTone, toleranceText, trades, tradeLabels,
  type Defect, type DefectStatus, type Inspection, type InspectionStatus, type Template, type Trade,
} from "../../lib/qa"
import { qaSummaryHtml } from "../../lib/qaPrint"
import type { QaWorkspace } from "../../lib/qaWorkspace"
import { useToast } from "../../lib/toast"

export type QaMode = "engineer" | "foreman"
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short" }) : "-")
const dueTone = { overdue: "text-red-700 dark:text-red-400", due_soon: "text-amber-800 dark:text-amber-300", ok: "text-fg-muted", none: "text-fg-muted", closed: "text-fg-muted" }
const pct = (value: number | null) => (value === null ? "-" : `${value}%`)

function Table({ head, children, label }: { head: string[]; children: React.ReactNode; label: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[640px] text-left text-sm" aria-label={label}>
        <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wider text-fg-muted"><tr>{head.map((cell) => <th key={cell} scope="col" className="px-3 py-2 font-extrabold">{cell}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}

const rowButton = "inline-flex min-h-6 items-center text-left font-bold text-brand-text underline-offset-2 hover:underline focus-visible:outline-2"

// ---------------------------------------------------------------- Overview
export function OverviewPanel({ ws, mode, onOpenInspection, onOpenDefect, onGo }: { ws: QaWorkspace; mode: QaMode; onOpenInspection: (id: string) => void; onOpenDefect: (id: string) => void; onGo: (tab: "inspections" | "defects") => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const s = ws.summary
  const attention = useMemo(() => {
    const rows: Array<{ key: string; tone: string; text: string; sub: string; open: () => void }> = []
    for (const defect of ws.defects) {
      if (defect.status === "closed") continue
      const due = dueState(defect, ws.today)
      const mine = defect.assigned_to === profile?.id
      if (mode === "engineer" && defect.status === "for_verification") rows.push({ key: defect.id, tone: "bg-sky-500", text: `${refNumber("ncr", defect.number)} is ready to verify`, sub: defect.title, open: () => onOpenDefect(defect.id) })
      else if (due.state === "overdue" && (mode === "engineer" || mine)) rows.push({ key: defect.id, tone: "bg-red-600", text: `${refNumber("ncr", defect.number)} is ${dueText(defect, ws.today).toLowerCase()}`, sub: defect.title, open: () => onOpenDefect(defect.id) })
      else if (mode === "foreman" && mine && (defect.status === "open" || defect.status === "in_progress")) rows.push({ key: defect.id, tone: due.state === "due_soon" ? "bg-amber-500" : "bg-fg-muted", text: `${refNumber("ncr", defect.number)} needs your action (${dueText(defect, ws.today).toLowerCase()})`, sub: defect.title, open: () => onOpenDefect(defect.id) })
    }
    if (mode === "engineer") for (const inspection of ws.inspections) if (inspection.status === "requested") rows.push({ key: inspection.id, tone: "bg-amber-500", text: `${refNumber("ir", inspection.number)} is waiting to be inspected`, sub: inspection.title, open: () => onOpenInspection(inspection.id) })
    return rows.slice(0, 8)
  }, [ws.defects, ws.inspections, ws.today, mode, profile?.id, onOpenDefect, onOpenInspection])

  const print = () => {
    if (!s || !ws.project) return
    const stamp = new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "long", year: "numeric" })
    if (!printHtml(qaSummaryHtml({ summary: s, defects: ws.defects, project: ws.project, nameOf: ws.nameOf, today: ws.today, asOf: stamp }))) toast.error("Could not open the print dialog")
  }

  if (ws.summaryLoading && !s) return <><SkeletonKpis count={6} /><SkeletonList rows={3} label="Loading the quality summary" /></>
  if (!s) return <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">Could not load the quality summary.</p>
  const finished = s.inspections.passed + s.inspections.conditional + s.inspections.failed

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard label="First-time pass rate" value={pct(s.inspections.first_pass_rate)} note={finished ? `${finished} inspection${finished === 1 ? "" : "s"} completed` : "No completed inspection yet"} tone={s.inspections.first_pass_rate === null ? "brand" : s.inspections.first_pass_rate >= ws.threshold ? "green" : "red"} />
        <StatCard label="Waiting for inspection" value={s.inspections.requested + s.inspections.in_progress} note={`${s.inspections.in_progress} in progress`} tone="amber" onClick={() => onGo("inspections")} />
        <StatCard label="Open NCRs" value={s.defects.open} note={`${s.defects.critical_open} critical • ${s.defects.major_open} major • ${s.defects.minor_open} minor`} tone={s.defects.critical_open ? "red" : "brand"} onClick={() => onGo("defects")} />
        <StatCard label="Overdue NCRs" value={s.defects.overdue} note={s.defects.overdue ? "Past their deadline" : "None past deadline"} tone={s.defects.overdue ? "red" : "green"} onClick={() => onGo("defects")} />
        <StatCard label="Avg days to close" value={s.defects.average_days_to_close === null ? "-" : s.defects.average_days_to_close} note={`${s.defects.closed} closed`} tone="brand" />
        <StatCard label="Defects per 100 checks" value={s.items.defects_per_100_items === null ? "-" : s.items.defects_per_100_items} note={`${s.items.failed} of ${s.items.checked} items failed`} tone="brand" />
      </div>

      {mode === "engineer" ? <DefectTrends defects={ws.defects} today={ws.today} /> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-label="Needs attention" className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-extrabold">Needs attention</h2>
          {attention.length === 0 ? <p className="text-sm text-fg-muted">Nothing is waiting on you.</p> : (
            <ul className="space-y-1.5">
              {attention.map((row) => (
                <li key={row.key}>
                  <button type="button" onClick={row.open} className="flex w-full items-start gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-muted">
                    <span className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${row.tone}`} aria-hidden="true" />
                    <span className="min-w-0"><span className="block text-sm font-semibold">{row.text}</span><span className="block truncate text-xs text-fg-muted">{row.sub}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Recent inspections" className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-2 text-sm font-extrabold">Recent inspections</h2>
          {s.recent.length === 0 ? <p className="text-sm text-fg-muted">No inspection has been requested yet.</p> : (
            <ul className="space-y-1.5">
              {s.recent.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onOpenInspection(row.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-muted">
                    <strong className="w-20 flex-none text-xs tabular-nums">{refNumber("ir", row.number)}</strong>
                    <span className="min-w-0 flex-1 truncate text-sm">{row.title}</span>
                    {row.score !== null ? <span className="text-xs font-bold tabular-nums">{row.score}%</span> : null}
                    <Chip tone={inspectionTone[row.status]}>{inspectionStatusLabels[row.status]}</Chip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="Quality by trade" className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-extrabold">Quality by trade</h2><button type="button" className={buttonSecondary + " !py-1 !text-xs"} onClick={print}>Print summary</button></div>
        {s.by_trade.length === 0 ? <p className="text-sm text-fg-muted">Appears after the first inspection.</p> : (
          <ul className="space-y-3">
            {s.by_trade.map((row) => (
              <li key={row.trade} className="grid items-center gap-2 sm:grid-cols-[11rem_1fr_9rem]">
                <span className="text-sm font-semibold">{tradeLabels[row.trade]}</span>
                <Meter value={row.pass_rate ?? 0} tone={row.pass_rate === null ? "brand" : row.pass_rate >= ws.threshold ? "green" : "red"} label={`${tradeLabels[row.trade]} pass rate`} />
                <span className="text-xs text-fg-muted">{row.pass_rate === null ? "no result yet" : `${row.pass_rate}% pass`} • {row.open_defects} open NCR{row.open_defects === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- Inspections
export function InspectionsPanel({ ws, onOpen, onNew, canRequest }: { ws: QaWorkspace; onOpen: (id: string) => void; onNew: () => void; canRequest: boolean }) {
  const [status, setStatus] = useState<"all" | "open" | InspectionStatus>("all")
  const [trade, setTrade] = useState<"all" | Trade>("all")
  const [query, setQuery] = useState("")
  const list = useMemo(() => {
    const text = query.trim().toLowerCase()
    return ws.inspections.filter((row) => (status === "all" || (status === "open" ? row.status === "requested" || row.status === "in_progress" : row.status === status)) && (trade === "all" || row.trade === trade) && (!text || `${refNumber("ir", row.number)} ${row.title} ${row.location ?? ""}`.toLowerCase().includes(text)))
  }, [ws.inspections, status, trade, query])

  const exportCsv = () => downloadCsv(`inspections-${ws.project?.code ?? "project"}-${ws.today}.csv`, toCsv(["IR", "Title", "Trade", "Location", "Status", "Score %", "Pass mark %", "Requested by", "Requested", "Inspector", "Completed"], list.map((row) => [refNumber("ir", row.number), row.title, tradeLabels[row.trade], row.location ?? "", inspectionStatusLabels[row.status], row.score ?? "", row.threshold ?? "", ws.nameOf(row.requested_by), row.requested_at.slice(0, 10), ws.nameOf(row.inspector_id), row.completed_at?.slice(0, 10) ?? ""]))) // eslint-disable-line

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search inspections..." aria-label="Search inspections" className={`${inputClass} !w-56`} />
        <select aria-label="Filter by status" className={`${inputClass} !w-auto`} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All statuses</option><option value="open">Waiting or in progress</option>
          {(["requested", "in_progress", "passed", "conditional", "failed", "cancelled"] as const).map((value) => <option key={value} value={value}>{inspectionStatusLabels[value]}</option>)}
        </select>
        <select aria-label="Filter by trade" className={`${inputClass} !w-auto`} value={trade} onChange={(event) => setTrade(event.target.value as typeof trade)}><option value="all">All trades</option>{trades.map((value) => <option key={value} value={value}>{tradeLabels[value]}</option>)}</select>
        <span className="ml-auto flex gap-2">
          <button type="button" className={buttonSecondary} onClick={exportCsv} disabled={!list.length}>Export CSV</button>
          {canRequest ? <button type="button" className={buttonPrimary} onClick={onNew}>Request inspection</button> : null}
        </span>
      </div>
      {ws.loading ? <SkeletonList rows={5} label="Loading inspections" /> : ws.inspections.length === 0 ? (
        <EmptyState title="No inspections yet" action={canRequest ? <button type="button" className={buttonPrimary} onClick={onNew}>Request the first inspection</button> : undefined}>An inspection is requested by the foreman when work is ready, and recorded by the engineer against a checklist.</EmptyState>
      ) : list.length === 0 ? <EmptyState title="Nothing matches">Change the filters or the search.</EmptyState> : (
        <Table label="Inspections" head={["IR", "Inspection", "Trade", "Status", "Score", "Requested", "Inspector"]}>
          {list.map((row: Inspection) => (
            <tr key={row.id} className="hover:bg-surface-muted/60">
              <td className="whitespace-nowrap px-3 py-2"><button type="button" className={rowButton} onClick={() => onOpen(row.id)}>{refNumber("ir", row.number)}</button></td>
              <td className="px-3 py-2"><span className="block font-semibold">{row.title}</span>{row.location ? <span className="block text-xs text-fg-muted">{row.location}</span> : null}</td>
              <td className="px-3 py-2 text-xs">{tradeLabels[row.trade]}</td>
              <td className="px-3 py-2"><Chip tone={inspectionTone[row.status]}>{inspectionStatusLabels[row.status]}</Chip>{row.reinspection_of ? <span className="ml-1 text-[11px] font-bold text-fg-muted">re-inspection</span> : null}</td>
              <td className="px-3 py-2 tabular-nums">{row.score === null ? "-" : `${row.score}%`}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-fg-muted">{day(row.requested_at)} • {ws.nameOf(row.requested_by)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-fg-muted">{row.inspector_id ? ws.nameOf(row.inspector_id) : "-"}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Defects (NCR register)
export function DefectsPanel({ ws, mode, onOpen, onNew }: { ws: QaWorkspace; mode: QaMode; onOpen: (id: string) => void; onNew: (() => void) | null }) {
  const { profile } = useAuth()
  const [status, setStatus] = useState<"all" | "open_all" | "late" | DefectStatus>(mode === "foreman" ? "open_all" : "all")
  const [severity, setSeverity] = useState<"all" | "critical" | "major" | "minor">("all")
  const [trade, setTrade] = useState<"all" | Trade>("all")
  const [mine, setMine] = useState(mode === "foreman")
  const [query, setQuery] = useState("")
  const list = useMemo(() => {
    const text = query.trim().toLowerCase()
    return ws.defects.filter((row) => {
      if (status === "open_all" ? row.status === "closed" : status === "late" ? dueState(row, ws.today).state !== "overdue" : status !== "all" && row.status !== status) return false
      if (severity !== "all" && row.severity !== severity) return false
      if (trade !== "all" && row.trade !== trade) return false
      if (mine && row.assigned_to !== profile?.id) return false
      return !text || `${refNumber("ncr", row.number)} ${row.title} ${row.description ?? ""} ${row.reference ?? ""}`.toLowerCase().includes(text)
    })
  }, [ws.defects, ws.today, status, severity, trade, mine, query, profile?.id])

  const exportCsv = () =>
    downloadCsv(`ncr-register-${ws.project?.code ?? "project"}-${ws.today}.csv`, toCsv(["NCR", "Title", "Class", "Category", "Trade", "Standard", "Status", "Responsible", "Raised", "Due", "Closed", "Root cause", "Corrective action", "Preventive action", "Closing note"], list.map((row) => [refNumber("ncr", row.number), row.title, qaSeverityLabels[row.severity], row.category, tradeLabels[row.trade], row.reference ?? "", defectStatusLabels[row.status], ws.nameOf(row.assigned_to), row.raised_at.slice(0, 10), row.due_date ?? "", row.closed_at?.slice(0, 10) ?? "", row.root_cause ?? "", row.corrective_action ?? "", row.closing_note ?? ""])))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search defects..." aria-label="Search defects" className={`${inputClass} !w-52`} />
        <select aria-label="Filter by status" className={`${inputClass} !w-auto`} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">All statuses</option><option value="open_all">Not closed</option><option value="late">Overdue</option>
          {(["open", "in_progress", "for_verification", "closed"] as const).map((value) => <option key={value} value={value}>{defectStatusLabels[value]}</option>)}
        </select>
        <select aria-label="Filter by class" className={`${inputClass} !w-auto`} value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)}><option value="all">All classes</option>{severities.map((value) => <option key={value} value={value}>{qaSeverityLabels[value]}</option>)}</select>
        <select aria-label="Filter by trade" className={`${inputClass} !w-auto`} value={trade} onChange={(event) => setTrade(event.target.value as typeof trade)}><option value="all">All trades</option>{trades.map((value) => <option key={value} value={value}>{tradeLabels[value]}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm font-semibold"><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} /> Assigned to me</label>
        <span className="ml-auto flex gap-2">
          <button type="button" className={buttonSecondary} onClick={exportCsv} disabled={!list.length}>Export CSV</button>
          {onNew ? <button type="button" className={buttonPrimary} onClick={onNew}>Raise NCR</button> : null}
        </span>
      </div>
      {ws.loading ? <SkeletonList rows={5} label="Loading defects" /> : ws.defects.length === 0 ? (
        <EmptyState title="No non-conformances">When an inspection item fails, an NCR is raised automatically and assigned to the foreman. You can also raise one by hand.</EmptyState>
      ) : list.length === 0 ? <EmptyState title="Nothing matches">Change the filters or the search.</EmptyState> : (
        <Table label="Non-conformance register" head={["NCR", "Defect", "Class", "Status", "Responsible", "Deadline"]}>
          {list.map((row: Defect) => {
            const due = dueState(row, ws.today)
            return (
              <tr key={row.id} className="hover:bg-surface-muted/60">
                <td className="whitespace-nowrap px-3 py-2"><button type="button" className={rowButton} onClick={() => onOpen(row.id)}>{refNumber("ncr", row.number)}</button></td>
                <td className="px-3 py-2"><span className="block font-semibold">{row.title}</span><span className="block text-xs text-fg-muted">{tradeLabels[row.trade]}{row.reference ? ` • ${row.reference}` : ""}</span></td>
                <td className="px-3 py-2"><Chip tone={severityTone[row.severity]}>{qaSeverityLabels[row.severity]}</Chip></td>
                <td className="px-3 py-2"><Chip tone={defectTone[row.status]}>{defectStatusLabels[row.status]}</Chip></td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-fg-muted">{ws.nameOf(row.assigned_to)}</td>
                <td className={`whitespace-nowrap px-3 py-2 text-xs font-bold ${dueTone[due.state]}`}>{dueText(row, ws.today)}</td>
              </tr>
            )
          })}
        </Table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Checklists
function Viewer({ template, canRequest, canEdit, onClose, onRequest, onDuplicate }: { template: Template; canRequest: boolean; canEdit: boolean; onClose: () => void; onRequest: () => void; onDuplicate: () => void }) {
  return (
    <Modal
      title={template.name}
      description={`${tradeLabels[template.trade]}${template.standards.length ? ` • ${template.standards.join(", ")}` : ""}`}
      size="xl"
      onClose={onClose}
      footer={<>{canEdit ? <button type="button" className={buttonSecondary} onClick={onDuplicate}>Copy to my project</button> : null}{canRequest && !template.archived ? <button type="button" className={buttonPrimary} onClick={onRequest}>Request an inspection</button> : null}<button type="button" className={buttonSecondary} onClick={onClose}>Close</button></>}
    >
      {template.description ? <p className="mb-3 text-sm text-fg-muted">{template.description}</p> : null}
      <ol className="space-y-2">
        {template.qa_template_items.map((item, index) => (
          <li key={item.id} className="rounded-lg border border-line bg-surface p-3">
            <p className="text-sm font-semibold"><span className="mr-2 text-fg-muted">{index + 1}.</span>{item.text}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <SeverityChip severity={item.severity} />{item.hold_point ? <HoldChip /> : null}
              {item.requires_photo ? <Chip tone="bg-surface-muted text-fg-muted">Photo required</Chip> : null}
              {item.kind === "measure" ? <span className="text-xs text-fg-muted">Measure: {toleranceText(item)}</span> : null}
              {item.reference ? <span className="text-xs text-fg-muted">{item.reference}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  )
}

export function ChecklistsPanel({ ws, mode, canEdit, canEditLibrary, onEdit, onRequest }: { ws: QaWorkspace; mode: QaMode; canEdit: boolean; canEditLibrary: boolean; onEdit: (template: Template | null, scope: "project" | "library") => void; onRequest: (templateId: string) => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [viewing, setViewing] = useState<Template | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const groups = [
    { name: "Company library", note: "Built in. Read-only; copy one to adapt it to your project.", list: ws.templates.filter((t) => t.project_id === null && (showArchived || !t.archived)) },
    { name: "This project", note: "Edited by the project's engineers.", list: ws.templates.filter((t) => t.project_id !== null && (showArchived || !t.archived)) },
  ]

  const duplicate = async (template: Template) => {
    if (!ws.projectId) return
    setBusy(true)
    const result = await qaActions.duplicateTemplate(template.id, ws.projectId)
    setBusy(false)
    if (!result.ok) return toast.error("Not copied", result.message)
    toast.success("Copied to this project", "Open it under This project to adapt it")
    setViewing(null)
    await ws.reloadTemplates()
  }
  const archive = async (template: Template) => {
    if (!template.archived && !(await confirm({ title: `Archive "${template.name}"?`, message: "It disappears from new requests. Inspections already created keep their list.", confirmLabel: "Archive" }))) return
    const result = await qaActions.archiveTemplate(template.id, !template.archived)
    if (!result.ok) return toast.error("Not changed", result.message)
    toast.success(template.archived ? "Checklist restored" : "Checklist archived")
    await ws.reloadTemplates()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-sm font-semibold"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label>
        <span className="flex gap-2">
          {canEdit ? <button type="button" className={buttonPrimary} onClick={() => onEdit(null, "project")}>New checklist</button> : null}
          {canEditLibrary ? <button type="button" className={buttonPrimary} onClick={() => onEdit(null, "library")}>New library checklist</button> : null}
        </span>
      </div>
      {ws.loading ? <SkeletonList rows={4} label="Loading checklists" /> : groups.map((group) => group.name === "This project" && !ws.projectId ? null : (
        <section key={group.name} aria-label={group.name}>
          <h2 className="text-sm font-extrabold">{group.name}</h2>
          <p className="mb-2 text-xs text-fg-muted">{group.note}</p>
          {group.list.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted">{group.name === "This project" ? "No project checklist yet. Copy one from the library or create your own." : "No checklist."}</p> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.list.map((template) => {
                const holds = template.qa_template_items.filter((i) => i.hold_point).length
                const editable = template.project_id ? canEdit : canEditLibrary && !template.is_system
                return (
                  <li key={template.id} className={`flex flex-col rounded-xl border border-line bg-surface p-4 ${template.archived ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-extrabold">{template.name}</h3>{template.archived ? <Chip tone="bg-gray-200 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200">Archived</Chip> : template.is_system ? <Chip tone="bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">Built in</Chip> : null}</div>
                    <p className="mt-1 text-xs text-fg-muted">{tradeLabels[template.trade]} • {template.qa_template_items.length} items{holds ? ` • ${holds} hold point${holds === 1 ? "" : "s"}` : ""}</p>
                    {template.standards.length ? <p className="mt-1 text-xs font-semibold text-fg-muted">{template.standards.join(" • ")}</p> : null}
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <button type="button" className={buttonSecondary + " !py-1 !text-xs"} onClick={() => setViewing(template)}>View</button>
                      {ws.projectId ? <button type="button" className={buttonSecondary + " !py-1 !text-xs"} disabled={template.archived} onClick={() => onRequest(template.id)}>Request inspection</button> : null}
                      {editable ? <button type="button" className={buttonSecondary + " !py-1 !text-xs"} onClick={() => onEdit(template, template.project_id ? "project" : "library")}>Edit</button> : null}
                      {canEdit && template.project_id === null && ws.projectId ? <button type="button" className={buttonSecondary + " !py-1 !text-xs"} disabled={busy} onClick={() => void duplicate(template)}>Copy to project</button> : null}
                      {(template.project_id ? canEdit : canEditLibrary) ? <button type="button" className={buttonSecondary + " !py-1 !text-xs"} onClick={() => void archive(template)}>{template.archived ? "Restore" : "Archive"}</button> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}
      {viewing ? <Viewer template={viewing} canRequest={Boolean(ws.projectId)} onClose={() => setViewing(null)} canEdit={canEdit && viewing.project_id === null && Boolean(ws.projectId)} onDuplicate={() => void duplicate(viewing)} onRequest={() => { onRequest(viewing.id); setViewing(null) }} /> : null}
    </div>
  )
}

import { lazy, Suspense, useState, type ReactNode } from "react"
import Modal from "../Modal"
import { Chip } from "../qa/QaBits"
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import { SkeletonList } from "../ui/Skeleton"
import ProjectQuestions from "../ProjectQuestions"
import PinDailyReports from "../client/PinDailyReports"
import { severityLabels, useBlueprints, useChecklist, useProjectPins, type Pin, type PinSeverity } from "../../lib/blueprints"
import { clientActionPath, openClientPath } from "../../lib/clientPortalModel"
import { followLink } from "../../lib/notifications"
import { reportFieldProblem, usePinRecords } from "../../lib/pinRecords"
import { checklistText, defectChecklist, inspectionChecklist, pinNextActions, pinSectionCounts, type NextAction, type PanelRole, type SubmissionLink } from "../../lib/pinRecordsModel"
import { manilaToday } from "../../lib/progress"
import { useProject, type TeamMember } from "../../lib/projects"
import { defectStatusLabels, defectTone, dueText, fixStageText, inspectionStatusLabels, inspectionTone, refNumber, snagStatusLabels, snagTone } from "../../lib/qaModel"
import { useWorkQaHistory } from "../../lib/qaAttempts"
import { useSettings } from "../../lib/settings"
import { useToast } from "../../lib/toast"

const DefectDetail = lazy(() => import("../qa/DefectDetail"))
const InspectionDetail = lazy(() => import("../qa/InspectionDetail"))
const IssueDetails = lazy(() => import("../issues/IssueDetails"))
const LogIssueModal = lazy(() => import("../issues/LogIssueModal"))
const NewDefectModal = lazy(() => import("../qa/NewDefectModal"))
const SnagDetail = lazy(() => import("../qa/SnagPanel").then((module) => ({ default: module.SnagDetail })))
const ClientSnagModal = lazy(() => import("../qa/SnagParts").then((module) => ({ default: module.ClientSnagModal })))

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", year: "numeric" })
const heading = "text-xs font-extrabold uppercase tracking-wider text-fg-muted"

// Everything connected to one pin, loaded once for the panel (tab counts) and shared by its sections.
export function usePinPanelData(pin: Pin, role: PanelRole) {
  const records = usePinRecords(pin, role)
  const history = useWorkQaHistory(role === "client" ? null : pin.id)
  const checklist = useChecklist(pin.id)
  const set = { defects: records.records.defects, inspections: history.inspections, snags: records.records.snags, issues: records.records.issues.length, questions: records.records.questions, reports: records.records.reports.length }
  const reload = async () => { await Promise.all([records.reload(), history.reload()]) }
  return { ...records, reload, history, checklist, set, counts: pinSectionCounts(role, set) }
}
export type PinPanelData = ReturnType<typeof usePinPanelData>
export type PinPanelProps = { pin: Pin; role: PanelRole; meId: string; team: TeamMember[]; canEdit: boolean; canWork: boolean; data: PinPanelData; wide?: boolean }

type Row = { key: string; cells: ReactNode[]; onOpen?: () => void; openLabel: string; mine?: boolean }

// One list of records: a detailed table with columns in the full pin view, compact cards beside the sheet (and on phones).
function RecordList({ title, columns, rows, wide, empty }: { title: string; columns: string[]; rows: Row[]; wide?: boolean; empty: string }) {
  return (
    <section aria-label={title} className="min-w-0 space-y-2">
      <h4 className={`${heading} flex items-center gap-2`}>{title}<span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-bold text-fg">{rows.length}</span></h4>
      {!rows.length ? <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">{empty}</p> : wide ? (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-surface-muted/60 text-[11px] uppercase tracking-wider text-fg-muted"><tr>{columns.map((column) => <th key={column} scope="col" className="px-3 py-2 font-bold">{column}</th>)}<th scope="col" className="px-3 py-2"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={`border-t border-line align-top ${row.mine ? "bg-brand-soft/40" : ""}`}>
                  {row.cells.map((cell, index) => <td key={index} className={`px-3 py-2 ${index === 0 ? "whitespace-nowrap font-bold" : "break-words"}`}>{cell}</td>)}
                  <td className="px-3 py-2 text-right">{row.onOpen ? <button type="button" className={`${buttonSecondary} !min-h-8 !px-3 !py-1 !text-xs`} aria-label={row.openLabel} onClick={row.onOpen}>Open</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className={`min-w-0 rounded-xl border bg-surface p-3 ${row.mine ? "border-brand" : "border-line"}`}>
              <p className="break-words text-sm font-bold"><span className="mr-1 text-brand-text">{row.cells[0]}</span>{row.cells[1]}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                {columns.slice(2).map((column, index) => <div key={column} className="min-w-0"><dt className="text-[11px] font-semibold text-fg-muted">{column}</dt><dd className="break-words">{row.cells[index + 2]}</dd></div>)}
              </dl>
              {row.onOpen ? <div className="mt-2 flex justify-end"><button type="button" className={`${buttonSecondary} !min-h-8 !px-3 !py-1 !text-xs`} aria-label={row.openLabel} onClick={row.onOpen}>Open</button></div> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NextActions({ actions, onOpen }: { actions: NextAction[]; onOpen: (action: NextAction) => void }) {
  if (!actions.length) return null
  return (
    <section aria-label="Next actions on this pin" className="rounded-xl border border-brand/40 bg-brand-soft/40 p-3">
      <h4 className={`${heading} text-brand-text`}>Next actions</h4>
      <ul className="mt-2 space-y-1.5">
        {actions.map((action) => (
          <li key={action.key}><button type="button" onClick={() => onOpen(action)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface">
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 flex-none rounded-full ${action.tone === "act" ? "bg-brand" : action.tone === "wait" ? "bg-amber-500" : "bg-sky-500"}`} />
            <span className="min-w-0 break-words font-semibold">{action.text}</span>
          </button></li>
        ))}
      </ul>
    </section>
  )
}

type Opened = { kind: "defect" | "inspection" | "snag" | "issue"; id: string } | null

// Issues & NCRs: NCRs, inspection requests, site issues and client reports of this pin with status, responsible person, dates
// and checklist item; the role's next actions; and the create actions that start already on this project, sheet and pin.
export function PinIssuesSection({ pin, role, meId, team, canEdit, canWork, data, wide }: PinPanelProps) {
  const [opened, setOpened] = useState<Opened>(null)
  const [creating, setCreating] = useState<"issue" | "ncr" | "problem" | null>(null)
  const { project } = useProject(role === "client" ? null : pin.project_id)
  const { settings } = useSettings()
  const today = manilaToday()
  const nameOf = (id: string | null) => (id ? (id === meId ? "You" : team.find((member) => member.user_id === id)?.full_name ?? "Someone on the team") : "Not assigned")
  const items = data.checklist.items
  const submissions = data.history.submissions as unknown as SubmissionLink[]
  const { defects, snags, issues } = data.records
  const inspections = data.history.inspections
  const engineer = role === "engineer"
  const client = role === "client"
  const foremen = team.filter((member) => member.role === "foreman")
  const open = (kind: NonNullable<Opened>["kind"], id: string) => setOpened({ kind, id })
  const loading = data.loading || data.history.loading
  const error = data.error || data.history.error

  const defectRows: Row[] = defects.map((row) => {
    const ir = row.inspection_id ? inspections.find((item) => item.id === row.inspection_id) : null
    const snag = snags.find((item) => item.defect_id === row.id)
    return {
      key: row.id, mine: role === "foreman" && row.assigned_to === meId && row.status !== "closed", openLabel: `Open ${refNumber("ncr", row.number)}`, onOpen: () => open("defect", row.id),
      cells: [refNumber("ncr", row.number), row.title, checklistText(defectChecklist(row, submissions, items)), <Chip key="s" tone={defectTone[row.status]}>{defectStatusLabels[row.status]}</Chip>,
        nameOf(row.assigned_to), dueText(row, today), ir ? `Inspection ${refNumber("ir", ir.number)}` : row.inspection_id ? "Inspection" : snag ? `Client report ${refNumber("snag", snag.number)}` : "Raised directly"],
    }
  })
  const inspectionRows: Row[] = [...inspections].sort((a, b) => b.number - a.number).map((row) => ({
    key: row.id, openLabel: `Open ${refNumber("ir", row.number)}`, onOpen: () => open("inspection", row.id),
    cells: [refNumber("ir", row.number), row.title, checklistText(inspectionChecklist(row, submissions, items)), <Chip key="s" tone={inspectionTone[row.status]}>{inspectionStatusLabels[row.status]}</Chip>,
      `${day(row.requested_at)} by ${nameOf(row.requested_by)}`, row.inspector_id ? nameOf(row.inspector_id) : "Engineer not started"],
  }))
  const issueRows: Row[] = issues.map((row) => ({
    key: row.id, openLabel: "Open issue record", onOpen: () => open("issue", row.id),
    cells: [day(row.created_at), <span key="d" className="line-clamp-3 whitespace-pre-wrap">{row.description}</span>, row.checklist_item_id ? (items.find((item) => item.id === row.checklist_item_id)?.text ?? row.checklist_name ?? "Checklist item") : row.checklist_name ? `${row.checklist_name} (historical)` : "Whole work pin",
      severityLabels[row.severity as PinSeverity] ?? row.severity, nameOf(row.raised_by)],
  }))
  const snagRows: Row[] = snags.map((row) => {
    const ncr = row.defect_id ? defects.find((item) => item.id === row.defect_id) : null
    return client
      ? { key: row.id, openLabel: `Open ${refNumber("snag", row.number)}`, onOpen: () => open("snag", row.id), cells: [refNumber("snag", row.number), row.title, <Chip key="s" tone={snagTone[row.status]}>{snagStatusLabels[row.status]}</Chip>, fixStageText(row.status, row.fix_stage), day(row.created_at)] }
      : { key: row.id, openLabel: `Open ${refNumber("snag", row.number)}`, onOpen: engineer ? () => open("snag", row.id) : undefined, cells: [refNumber("snag", row.number), row.title, <Chip key="s" tone={snagTone[row.status]}>{snagStatusLabels[row.status]}</Chip>, ncr ? refNumber("ncr", ncr.number) : row.defect_id ? "NCR raised" : "None yet", day(row.created_at)] }
  })

  const actions = pinNextActions(role, meId, data.set, today)
  const openAction = (action: NextAction) => open(action.open.kind, action.open.id)
  const reload = async () => { await data.reload() }
  const defect = opened?.kind === "defect" ? defects.find((row) => row.id === opened.id) : undefined
  const inspection = opened?.kind === "inspection" ? inspections.find((row) => row.id === opened.id) : undefined
  const snag = opened?.kind === "snag" ? snags.find((row) => row.id === opened.id) : undefined
  const blocked = pin.status === "verified" || pin.status === "for_review"

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2">
        {engineer && canEdit ? <>
          <button type="button" className={`${buttonPrimary} !min-h-9 !py-1.5 !text-xs`} disabled={blocked} title={blocked ? (pin.status === "verified" ? "Reopen completed work before logging an issue" : "Finish the current review before logging an issue") : undefined} onClick={() => setCreating("issue")}>Log an issue</button>
          <button type="button" className={`${buttonSecondary} !min-h-9 !py-1.5 !text-xs`} onClick={() => setCreating("ncr")}>Raise NCR</button>
        </> : null}
        {role === "foreman" && canWork ? <button type="button" className={`${buttonPrimary} !min-h-9 !py-1.5 !text-xs`} onClick={() => setCreating("problem")}>Report a field problem</button> : null}
        {client ? <button type="button" className={`${buttonPrimary} !min-h-9 !py-1.5 !text-xs`} onClick={() => openClientPath(clientActionPath("ticket", pin.project_id, pin.id))}>Report a problem here</button> : null}
      </div>
      {role === "foreman" && !canWork ? <p className="text-xs text-fg-muted">Only the Foreman assigned to this pin reports field problems and corrections on it.</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{error} <button type="button" className="font-bold underline" onClick={() => void reload()}>Retry</button></p> : null}
      {loading ? <SkeletonList rows={3} label="Loading this pin's records" /> : (
        <>
          <NextActions actions={actions} onOpen={openAction} />
          {client ? (
            <RecordList title="My problem reports on this pin" wide={wide} columns={["Report", "Problem", "Status", "Progress", "Reported"]} rows={snagRows} empty="You have not reported a problem on this pin." />
          ) : (
            <>
              <RecordList title="NCRs (non-conformances)" wide={wide} columns={["NCR", "Problem", "Checklist item", "Status", "Responsible", "Due", "Source"]} rows={defectRows} empty="No NCR is linked to this pin." />
              <RecordList title="Inspections and QA requests" wide={wide} columns={["Inspection", "Title", "Checklist item", "Status", "Requested", "Inspector"]} rows={inspectionRows} empty="No inspection has been requested for this pin." />
              <RecordList title="Site issues" wide={wide} columns={["Logged", "Description", "Checklist item", "Severity", "Logged by"]} rows={issueRows} empty="No site issue is logged on this pin." />
              {role !== "foreman" ? <RecordList title="Client problem reports" wide={wide} columns={["Report", "Problem", "Status", "NCR", "Reported"]} rows={snagRows} empty="No client report is linked to this pin." /> : null}
            </>
          )}
        </>
      )}

      <Suspense fallback={null}>
        {defect && project ? <DefectDetail key={defect.id} defect={defect} project={project} foremen={foremen} today={today} canWork={role === "foreman"} canVerify={engineer} nameOf={nameOf} onPlan
          onClose={() => setOpened(null)} onChanged={reload} onOpenInspection={(id) => open("inspection", id)} /> : null}
        {inspection && project ? <InspectionDetail key={inspection.id} inspection={inspection} project={project} weights={settings.weights} threshold={settings.threshold} defects={defects} canInspect={engineer} canRequest={engineer || canWork} nameOf={nameOf} onPlan
          onClose={() => setOpened(null)} onChanged={reload} onOpenDefect={(row) => open("defect", row.id)} onOpenInspection={(id) => open("inspection", id)} /> : null}
        {opened?.kind === "issue" ? <IssueDetails pin={pin} canEdit={engineer && canEdit} nameOf={nameOf} onClose={() => setOpened(null)} /> : null}
        {snag && engineer ? <SnagDetail key={snag.id} snag={snag} today={today} foremen={foremen} nameOf={nameOf} onPlan onClose={() => setOpened(null)} onDecided={async () => { setOpened(null); await reload() }} /> : null}
        {snag && client ? <ClientSnagModal key={snag.id} snag={snag} onPlan onClose={() => setOpened(null)} /> : null}
        {creating === "issue" ? <LogIssueFromPin pin={pin} onClose={() => setCreating(null)} onDone={async () => { setCreating(null); await reload() }} /> : null}
        {creating === "ncr" ? <RaiseNcrFromPin pin={pin} foremen={foremen} today={today} onClose={() => setCreating(null)} onCreated={async (id) => { setCreating(null); await reload(); open("defect", id) }} /> : null}
      </Suspense>
      {creating === "problem" ? <FieldProblemDialog pin={pin} items={items} onClose={() => setCreating(null)} onSent={() => setCreating(null)} /> : null}
    </div>
  )
}

// The create forms start on this project, sheet and pin; they wait for the project's pins so the picker opens on the pin.
function LogIssueFromPin({ pin, onClose, onDone }: { pin: Pin; onClose: () => void; onDone: () => Promise<void> }) {
  const { pins, loading } = useProjectPins(pin.project_id)
  const { blueprints } = useBlueprints(pin.project_id)
  if (loading) return null
  return <LogIssueModal pins={pins.length ? pins : [pin]} sheets={blueprints} sheetOf={(id) => blueprints.find((sheet) => sheet.id === id)?.title ?? "Sheet"} initialPinId={pin.id} onClose={onClose} onDone={onDone} />
}
function RaiseNcrFromPin({ pin, foremen, today, onClose, onCreated }: { pin: Pin; foremen: Array<{ user_id: string; full_name: string }>; today: string; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const { pins, loading } = useProjectPins(pin.project_id)
  if (loading) return null
  const assigned = foremen.filter((row) => row.user_id === pin.assigned_to)
  return <NewDefectModal projectId={pin.project_id} pins={pins.length ? pins : [pin]} foremen={assigned.length ? [...assigned, ...foremen.filter((row) => row.user_id !== pin.assigned_to)] : foremen} today={today} initialPinId={pin.id} onClose={onClose} onCreated={onCreated} />
}

// The assigned Foreman's report of a problem in the field: kept on the pin timeline and sent to the project Engineers, who decide
// whether it becomes a site issue or an NCR. It does not create an NCR or change the work status itself.
function FieldProblemDialog({ pin, items, onClose, onSent }: { pin: Pin; items: Array<{ id: string; text: string }>; onClose: () => void; onSent: () => void }) {
  const toast = useToast()
  const [itemId, setItemId] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (busy || note.trim().length < 5) return
    setBusy(true)
    const result = await reportFieldProblem(pin.id, itemId || null, note)
    setBusy(false)
    if (!result.ok) return toast.error("Not sent", result.message)
    toast.success("Field problem sent", "The project Engineers are notified. It is kept in this pin's Activity.")
    onSent()
  }
  return (
    <Modal title="Report a field problem" description={`On ${pin.title}. The Engineer decides whether to log a site issue or raise an NCR.`} onClose={onClose}
      footer={<><button type="button" className={buttonSecondary} disabled={busy} onClick={onClose}>Cancel</button><button type="button" className={buttonPrimary} disabled={busy || note.trim().length < 5} onClick={() => void send()}>{busy ? "Sending…" : "Send to the Engineer"}</button></>}>
      <div className="space-y-4">
        <label className="block text-sm font-bold" htmlFor="field-problem-item">Checklist item
          <select id="field-problem-item" className={`${inputClass} mt-1`} value={itemId} disabled={busy} onChange={(event) => setItemId(event.target.value)}>
            <option value="">Whole work pin (no specific item)</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.text}</option>)}
          </select>
        </label>
        <label className="block text-sm font-bold" htmlFor="field-problem-note">What is the problem? *
          <textarea id="field-problem-note" className={`${inputClass} mt-1`} rows={4} maxLength={1000} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder="What you found, where exactly, and what it stops" />
        </label>
        <p className="text-xs text-fg-muted">At least 5 characters. Corrections to an existing NCR or issue are sent from that NCR or the work item, not here.</p>
      </div>
    </Modal>
  )
}

// Daily progress reports that link this pin (linked_work). Clients see submitted reports only; the assigned Foreman can add the pin
// to today's report from here.
export function PinReportsSection({ pin, role, canWork, data }: PinPanelProps) {
  return (
    <div className="min-w-0 space-y-3">
      {role === "foreman" && canWork ? <button type="button" className={`${buttonSecondary} !min-h-9 !py-1.5 !text-xs`} onClick={() => followLink(`/foreman/daily-report?project=${encodeURIComponent(pin.project_id)}&linkpin=${encodeURIComponent(pin.id)}`, pin.project_id)}>Add this pin to today's daily report</button> : null}
      <PinDailyReports key={pin.id} pin={pin} reports={data.records.reports} loading={data.loading} error={data.error} onRetry={data.reload} staff={role !== "client"} />
    </div>
  )
}

// Questions about this pin: the Engineer answers here; a client sees only their own questions and asks on Communication.
export function PinCommunicationSection({ pin, role, meId, team, data }: PinPanelProps) {
  const nameOf = (id: string | null) => (id ? (id === meId ? "You" : team.find((member) => member.user_id === id)?.full_name ?? "Project team") : "Project team")
  if (role === "engineer") return <ProjectQuestions questions={data.records.questions} loading={data.loading} error={data.error} nameOf={nameOf} pinOf={() => null} onAnswered={data.reload} emptyText="No client question is linked to this pin yet." />
  const questions = data.records.questions
  return (
    <div className="min-w-0 space-y-3">
      <button type="button" className={`${buttonPrimary} !min-h-9 !py-1.5 !text-xs`} onClick={() => openClientPath(clientActionPath("communication", pin.project_id, pin.id))}>Ask about this pin</button>
      {data.loading ? <SkeletonList rows={2} label="Loading your questions" /> : !questions.length ? <p className="rounded-lg border border-dashed border-line px-3 py-2 text-xs text-fg-muted">You have not asked about this pin yet. Only you and the project team see your questions.</p> : (
        <ul className="space-y-2">
          {questions.map((question) => (
            <li key={question.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
              <p className="text-[11px] text-fg-muted">{day(question.created_at)}</p>
              <p className="mt-1 whitespace-pre-wrap break-words font-semibold">{question.question}</p>
              {question.answer ? <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-2"><strong className="block text-[11px] text-brand-text">Answered by {nameOf(question.answered_by)}</strong>{question.answer}</p> : <p className="mt-2 text-xs font-semibold text-fg-muted">Waiting for an answer</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

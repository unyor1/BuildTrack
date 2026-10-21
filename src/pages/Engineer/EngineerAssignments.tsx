import { useEffect, useMemo, useRef, useState } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import { dbMessage } from "../../components/editor/PinParts"
import { EmptyState, PageHead, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { severityChip, severityLabels, statusChip, statusLabels, type Pin } from "../../lib/blueprints"
import { followLink } from "../../lib/notifications"
import { isOverdue } from "../../lib/progress"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { EngineerPageProps } from "./types"

const UNASSIGNED = "unassigned"
type AssignmentFilter = "all" | "assigned" | "unassigned"
const filterLabels: Record<AssignmentFilter, string> = { all: "All open work", assigned: "Assigned", unassigned: "Unassigned" }

// A detailed work list, including assignees no longer in the team. Filtering never changes assignments.
export default function EngineerAssignments(_: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const toast = useToast()
  const [sheet, setSheet] = useState("all")
  const [assignment, setAssignment] = useState<AssignmentFilter>("all")
  const [saving, setSaving] = useState<string | null>(null)
  const pending = useRef(false)
  useEffect(() => { setSheet("all"); setAssignment("all") }, [projectId])

  const foremen = work.team.filter(member => member.role === "foreman")
  const open = useMemo(() => work.pins.filter(pin => pin.status !== "verified" && pin.category !== "note" && (sheet === "all" || pin.blueprint_id === sheet)), [work.pins, sheet])
  const assigned = open.filter(pin => Boolean(pin.assigned_to)).length
  const counts = { all: open.length, assigned, unassigned: open.length - assigned }
  const shown = open.filter(pin => assignment === "all" || (assignment === "assigned" ? Boolean(pin.assigned_to) : !pin.assigned_to))

  const assign = async (pinId: string, target: string) => {
    const pin = work.pins.find(item => item.id === pinId)
    if (pending.current || !pin || pin.locked || pin.status === "for_review" || (pin.assigned_to ?? UNASSIGNED) === target) return
    const assignedTo = target === UNASSIGNED ? null : target
    if (assignedTo && !foremen.some(member => member.user_id === assignedTo)) return
    const before = pin.assigned_to
    pending.current = true
    setSaving(pinId)
    work.setPins(current => current.map(item => item.id === pinId ? { ...item, assigned_to: assignedTo } : item))
    try {
      const { data, error } = await supabase.from("pins").update({ assigned_to: assignedTo }).eq("id", pinId).select("id")
      if (error || !data?.length) throw new Error(error ? dbMessage(error) : "This pin may be locked or you may not be allowed to edit it.")
      toast.success(assignedTo ? `Assigned to ${work.nameOf(assignedTo)}` : "Unassigned", pin.title)
    } catch (error) {
      work.setPins(current => current.map(item => item.id === pinId ? { ...item, assigned_to: before } : item))
      toast.error("Not assigned", (error as Error).message)
    } finally { pending.current = false; setSaving(null) }
  }

  return (
    <div className="engineer-page" style={{ width: "min(100%, 1280px)" }}>
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead eyebrow="Planning" title="Assignment board"
        description="Review open work and assign a Foreman. Assignments are saved to the project and the Foreman is notified."
        actions={<label className="text-xs font-semibold">Sheet
          <select value={sheet} onChange={event => setSheet(event.target.value)} aria-label="Filter by sheet" className={inputClass + " mt-1"}>
            <option value="all">All sheets</option>
            {work.blueprints.map(bp => <option key={bp.id} value={bp.id}>{bp.title}</option>)}
          </select>
        </label>} />
      {!projectId ? null : work.loading ? <SkeletonList rows={4} label="Loading assignments" />
        : work.error ? <p role="alert" className="rounded-lg bg-danger-soft p-4 text-sm text-danger-fg">{work.error} <button type="button" className="underline" onClick={() => void work.reload()}>Retry</button></p>
        : <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
            <div role="group" aria-label="Filter by assignment" className="flex flex-wrap gap-2">
              {(Object.keys(filterLabels) as AssignmentFilter[]).map(key => <button key={key} type="button" aria-pressed={assignment === key} onClick={() => setAssignment(key)}
                className={`rounded-full border px-3 py-2 text-xs font-bold transition ${assignment === key ? "border-brand bg-brand text-white" : "border-line text-fg-muted hover:border-brand/50 hover:text-brand-text"}`}>
                {filterLabels[key]} <span className="ml-1 tabular-nums">({counts[key]})</span>
              </button>)}
            </div>
            <p role="status" className="text-xs text-fg-muted">{shown.length} of {open.length} open work pin{open.length === 1 ? "" : "s"} shown</p>
          </div>
          {!foremen.length ? <p role="status" className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">No Foreman is on this project yet. Ask an administrator to add one to the team before assigning work.</p> : null}
          {!shown.length ? <EmptyState title={open.length ? `No ${assignment === "assigned" ? "assigned" : "unassigned"} work in this selection` : "No open work in this selection"}>
            {open.length ? "Choose another assignment filter or sheet to see more work." : "Completed work and notes are not shown here."}
          </EmptyState> : <section aria-label="Assignment details" className="overflow-hidden rounded-xl border border-line bg-surface">
            <div aria-hidden="true" className="hidden gap-4 border-b border-line bg-surface-muted px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-fg-muted lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem_7rem_minmax(12rem,1.4fr)]">
              <span>Work / sheet</span><span>Status</span><span>Priority</span><span>Due date</span><span>Assigned Foreman</span>
            </div>
            <ul className="divide-y divide-line">
              {shown.map(pin => <AssignmentRow key={pin.id} pin={pin} sheet={work.sheetOf(pin.blueprint_id)} assignee={work.nameOf(pin.assigned_to)}
                foremen={foremen.map(member => ({ id: member.user_id, name: member.full_name }))} late={isOverdue(pin, work.today)}
                saving={saving === pin.id} busy={saving !== null} onAssign={target => void assign(pin.id, target)}
                onOpen={() => followLink(`/engineer/annotation?project=${pin.project_id}&sheet=${pin.blueprint_id}&pin=${pin.id}`, pin.project_id)} />)}
            </ul>
          </section>}
        </div>}
    </div>
  )
}

function AssignmentRow({ pin, sheet, assignee, foremen, late, saving, busy, onAssign, onOpen }: {
  pin: Pin; sheet: string; assignee: string; foremen: Array<{ id: string; name: string }>; late: boolean; saving: boolean; busy: boolean; onAssign: (target: string) => void; onOpen: () => void
}) {
  const blocked = pin.locked || pin.status === "for_review"
  const missingAssignee = Boolean(pin.assigned_to && !foremen.some(member => member.id === pin.assigned_to))
  return <li className="grid gap-4 px-4 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem_7rem_minmax(12rem,1.4fr)] lg:items-start">
    <div className="min-w-0 sm:col-span-2 lg:col-span-1">
      <button type="button" onClick={onOpen} className="break-words text-left text-sm font-extrabold text-brand-text hover:underline">{pin.title}</button>
      <p className="mt-1 break-words text-xs text-fg-muted">{sheet}</p>
      {pin.description ? <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-fg-muted">{pin.description}</p> : null}
    </div>
    <div><p className="mb-1 text-xs font-semibold text-fg-muted lg:hidden">Status</p><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
      {pin.locked ? <p className="mt-1 text-xs text-fg-muted">Locked</p> : null}</div>
    <div><p className="mb-1 text-xs font-semibold text-fg-muted lg:hidden">Priority</p><span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase ${severityChip[pin.severity]}`}>{severityLabels[pin.severity]}</span></div>
    <div><p className="mb-1 text-xs font-semibold text-fg-muted lg:hidden">Due date</p><p className={`text-xs font-semibold ${late ? "text-red-700 dark:text-red-300" : "text-fg-muted"}`}>
      {pin.due_date ? <time dateTime={pin.due_date}>{new Date(pin.due_date + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}</time> : "Not set"}
      {late ? <span className="mt-1 block">Overdue</span> : null}</p></div>
    <div className="min-w-0">
      <p className={`mb-1 text-xs font-bold ${pin.assigned_to ? "text-fg" : "text-amber-800 dark:text-amber-300"}`}>{pin.assigned_to ? assignee : "Unassigned"}</p>
      <label className="block"><span className="sr-only">Assign {pin.title} to Foreman</span>
        <select aria-label={`Assign ${pin.title} to Foreman`} value={pin.assigned_to ?? UNASSIGNED} disabled={blocked || busy || !foremen.length} onChange={event => onAssign(event.target.value)} className={inputClass + " !px-2 !py-1.5 !text-xs disabled:opacity-60"}>
          <option value={UNASSIGNED}>Unassigned</option>
          {missingAssignee ? <option value={pin.assigned_to!} disabled>{assignee} (not in current team)</option> : null}
          {foremen.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
      {saving ? <p role="status" className="mt-1 text-xs text-fg-muted">Saving assignment…</p>
        : blocked ? <p className="mt-1 text-xs text-fg-muted">{pin.status === "for_review" ? "Awaiting Engineer review; assignment cannot change." : "Unlock the pin on the plan to change its assignment."}</p> : null}
    </div>
  </li>
}

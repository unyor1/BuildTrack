import { useMemo, useState, type DragEvent } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import { dbMessage } from "../../components/editor/PinParts"
import { EmptyState, PageHead } from "../../components/ui/PageParts"
import { SkeletonCardGrid } from "../../components/ui/Skeleton"
import { severityChip, severityLabels, statusChip, statusLabels, type Pin } from "../../lib/blueprints"
import { isOverdue } from "../../lib/progress"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { EngineerPageProps } from "./types"

const UNASSIGNED = "unassigned"

// Who does what: one column per foreman plus "Unassigned". Drag a card to another column, or use the menu on the card.
export default function EngineerAssignments(_: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const toast = useToast()
  const [sheet, setSheet] = useState("all")
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  const foremen = work.team.filter((member) => member.role === "foreman")
  const open = useMemo(() => work.pins.filter((pin) => pin.status !== "verified" && pin.category !== "note" && (sheet === "all" || pin.blueprint_id === sheet)), [work.pins, sheet])

  const columns = useMemo(() => {
    const base = [{ id: UNASSIGNED, name: "Unassigned" }, ...foremen.map((member) => ({ id: member.user_id, name: member.full_name }))]
    return base.map((column) => ({ ...column, pins: open.filter((pin) => (pin.assigned_to ?? UNASSIGNED) === column.id) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, work.team])

  const assign = async (pinId: string, target: string) => {
    const pin = work.pins.find((item) => item.id === pinId)
    if (!pin || (pin.assigned_to ?? UNASSIGNED) === target) return
    const assignedTo = target === UNASSIGNED ? null : target
    const before = pin.assigned_to
    work.setPins((current) => current.map((item) => (item.id === pinId ? { ...item, assigned_to: assignedTo } : item)))
    setSaving(pinId)
    const { data, error } = await supabase.from("pins").update({ assigned_to: assignedTo }).eq("id", pinId).select("id")
    setSaving(null)
    if (error || !data?.length) {
      work.setPins((current) => current.map((item) => (item.id === pinId ? { ...item, assigned_to: before } : item)))
      return toast.error("Not assigned", error ? dbMessage(error) : "This pin may be locked or you may not be allowed to edit it.")
    }
    toast.success(assignedTo ? `Assigned to ${work.nameOf(assignedTo)}` : "Unassigned", pin.title)
  }

  const onDrop = (event: DragEvent, columnId: string) => {
    event.preventDefault()
    const id = event.dataTransfer.getData("text/plain") || dragging
    setOver(null)
    setDragging(null)
    if (id) void assign(id, columnId)
  }

  return (
    <div className="engineer-page" style={{ width: "min(100%, 1280px)" }}>
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Planning"
        title="Assignment board"
        description="Give each open pin to a foreman. They are notified, and the pin shows in their list."
        actions={
          <select value={sheet} onChange={(event) => setSheet(event.target.value)} aria-label="Filter by sheet" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg">
            <option value="all">All sheets</option>
            {work.blueprints.map((bp) => <option key={bp.id} value={bp.id}>{bp.title}</option>)}
          </select>
        }
      />
      {!projectId ? null : work.loading ? (
        <SkeletonCardGrid count={3} />
      ) : foremen.length === 0 ? (
        <EmptyState title="No foreman on this project yet">Ask an administrator to add foremen to the project team, then assign work here.</EmptyState>
      ) : open.length === 0 ? (
        <EmptyState title="Nothing to assign">All pins on this selection are verified, or there are no pins yet.</EmptyState>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3">
          {columns.map((column) => (
            <section
              key={column.id}
              aria-label={`${column.name}, ${column.pins.length} ${column.pins.length === 1 ? "pin" : "pins"}`}
              onDragOver={(event) => { event.preventDefault(); setOver(column.id) }}
              onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
              onDrop={(event) => onDrop(event, column.id)}
              className={`w-72 flex-none rounded-2xl border p-3 transition ${over === column.id ? "border-brand bg-brand-soft" : "border-line bg-surface-muted/60"}`}
            >
              <header className="mb-3 flex items-center justify-between gap-2">
                <h2 className="truncate text-sm font-extrabold">{column.name}</h2>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-fg-muted">{column.pins.length}</span>
              </header>
              <ul className="min-h-[4rem] space-y-2">
                {column.pins.map((pin) => (
                  <Card key={pin.id} pin={pin} sheet={work.sheetOf(pin.blueprint_id)} late={isOverdue(pin, work.today)} saving={saving === pin.id} dragging={dragging === pin.id} columns={columns} onDragStart={(event) => { event.dataTransfer.setData("text/plain", pin.id); event.dataTransfer.effectAllowed = "move"; setDragging(pin.id) }} onDragEnd={() => { setDragging(null); setOver(null) }} onAssign={(target) => void assign(pin.id, target)} />
                ))}
                {column.pins.length === 0 ? <li className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-muted">Drop a pin here</li> : null}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Card({ pin, sheet, late, saving, dragging, columns, onDragStart, onDragEnd, onAssign }: { pin: Pin; sheet: string; late: boolean; saving: boolean; dragging: boolean; columns: Array<{ id: string; name: string }>; onDragStart: (event: DragEvent) => void; onDragEnd: () => void; onAssign: (target: string) => void }) {
  return (
    <li draggable={!pin.locked} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`rounded-xl border border-line bg-surface p-3 shadow-sm transition ${pin.locked ? "" : "cursor-grab active:cursor-grabbing"} ${dragging ? "opacity-40" : ""} ${saving ? "animate-pulse" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold leading-snug">{pin.title}</p>
        <span className={`flex-none rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase ${severityChip[pin.severity]}`}>{severityLabels[pin.severity]}</span>
      </div>
      <p className="mt-0.5 text-xs text-fg-muted">{sheet}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
        {pin.due_date ? <span className={`font-semibold ${late ? "text-red-700 dark:text-red-300" : "text-fg-muted"}`}>{late ? "Overdue " : "Due "}{new Date(pin.due_date + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short" })}</span> : null}
        {pin.locked ? <span className="text-fg-muted">Locked</span> : null}
      </div>
      <label className="mt-2 block">
        <span className="sr-only">Move {pin.title} to</span>
        <select value={pin.assigned_to ?? UNASSIGNED} disabled={pin.locked} onChange={(event) => onAssign(event.target.value)} className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg disabled:opacity-60">
          {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
      </label>
    </li>
  )
}

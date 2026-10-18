import { useMemo, useState } from "react"
import WorkFilters from "../WorkFilters"
import { EmptyState, buttonSecondary, inputClass } from "../ui/PageParts"
import { SkeletonList } from "../ui/Skeleton"
import { StageChip } from "./WorkItemParts"
import type { WorkItemRow } from "../../lib/workItem"
import { changePhotoScope, emptyPhotoScope, type PhotoScope } from "../../lib/photoGalleryModel"
import type { ItemStage } from "../../lib/workItemModel"

// `short` is the filter chip label; `title` / `hint` head the section when all groups are shown.
export type BoardGroup = { key: string; title: string; short: string; hint?: string; rows: WorkItemRow[] }

const edge: Record<ItemStage, string> = {
  preparing: "border-l-slate-400", ready: "border-l-sky-500", requested: "border-l-fuchsia-600", inspecting: "border-l-fuchsia-600",
  passed: "border-l-amber-500", correction: "border-l-red-600", accepted: "border-l-green-600",
}
const chip = (active: boolean) => `rounded-full border px-3 py-1 text-xs font-bold transition ${active ? "border-brand bg-brand text-white" : "border-line bg-surface text-fg hover:bg-surface-muted"}`

// Work items as a detailed, filterable list: who acts next, what blocks them, and the next action. Names only help to find an
// item; opening a row shows the work item record (by its permanent id).
export default function WorkItemBoard({ groups, loading, error, nameOf, sheetOf, onOpen, emptyTitle, emptyText }: {
  groups: BoardGroup[]; loading: boolean; error: string; nameOf: (id: string | null) => string; sheetOf: (id: string) => string
  onOpen: (itemId: string) => void; emptyTitle: string; emptyText: string
}) {
  const [filter, setFilter] = useState("all")
  const [scope, setScope] = useState<PhotoScope>(emptyPhotoScope)
  const [query, setQuery] = useState("")
  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups])
  // Filter choices come from the work items on this board, so every option has something behind it.
  const pins = useMemo(() => [...new Map(rows.map((row) => [row.pin.id, row.pin])).values()], [rows])
  const sheets = useMemo(() => [...new Set(pins.map((pin) => pin.blueprint_id))].map((id) => ({ id, title: sheetOf(id) })).sort((a, b) => a.title.localeCompare(b.title)), [pins, sheetOf])
  const items = useMemo(() => [...new Map(rows.map((row) => [row.item.id, row.item])).values()], [rows])
  const sheetOfPin = useMemo(() => new Map(pins.map((pin) => [pin.id, pin.blueprint_id])), [pins])

  const text = query.trim().toLowerCase()
  const matches = (row: WorkItemRow) => (!scope.sheet || row.pin.blueprint_id === scope.sheet) && (!scope.pin || row.pin.id === scope.pin) && (!scope.item || row.item.id === scope.item)
    && (!text || `${row.pin.title} ${row.item.text} ${sheetOf(row.pin.blueprint_id)}`.toLowerCase().includes(text))
  const filtered = groups.map((group) => ({ ...group, rows: group.rows.filter(matches) }))
  const present = filtered.filter((group) => groups.find((source) => source.key === group.key)?.rows.length)
  const shown = filter === "all" ? present.filter((group) => group.rows.length) : present.filter((group) => group.key === filter)
  const shownCount = shown.reduce((sum, group) => sum + group.rows.length, 0)
  const responsible = (row: WorkItemRow) => row.view.owner === "Foreman" ? `Foreman: ${nameOf(row.pin.assigned_to)}`
    : row.view.owner === "Engineer" ? `Engineer: ${row.current?.inspector_id ? nameOf(row.current.inspector_id) : "Project Engineer"}`
    : row.view.stage === "accepted" ? "Done: accepted" : "Blocked"

  if (loading) return <SkeletonList rows={4} label="Loading work items" />
  if (!rows.length) return <>{error ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p> : null}<EmptyState title={emptyTitle}>{emptyText}</EmptyState></>

  const list = (groupRows: WorkItemRow[]) => (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {groupRows.map((row) => {
        const openNcrs = row.ncrs.filter((ncr) => ncr.status !== "closed").length
        return (
          <li key={row.item.id} className={`grid gap-x-4 gap-y-2 border-l-4 px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-center ${edge[row.view.stage]}`}>
            <div className="min-w-0">
              <button type="button" aria-haspopup="dialog" onClick={() => onOpen(row.item.id)} className="text-left text-sm font-extrabold hover:text-brand-text hover:underline">{row.pin.title} <span aria-hidden="true">→</span><span className="sr-only">,</span> {row.item.text}</button>
              <p className="mt-0.5 text-xs text-fg-muted">{[sheetOf(row.pin.blueprint_id), row.attempts > 1 ? `${row.attempts} requests` : row.attempts === 1 ? "1 request" : "", openNcrs ? `${openNcrs} open NCR${openNcrs === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="min-w-0">
              <StageChip stage={row.view.stage} />
              <p className="mt-1 text-xs">{row.view.status}</p>
            </div>
            <div className="min-w-0 text-xs">
              <p className={`font-bold ${row.view.owner || row.view.stage === "accepted" ? "text-fg-muted" : "text-amber-800 dark:text-amber-300"}`}>{responsible(row)}</p>
              <p className="mt-0.5"><span className="font-bold">Next:</span> {row.view.next}</p>
              {row.view.blocker ? <p className="mt-0.5 font-semibold text-amber-800 dark:text-amber-300">Blocker: {row.view.blocker}</p> : null}
            </div>
            <div className="md:text-right"><button type="button" aria-haspopup="dialog" className={buttonSecondary + " !px-3 !py-1.5 !text-xs"} onClick={() => onOpen(row.item.id)}>Open</button></div>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="space-y-4">
      {error ? <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p> : null}
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show work items">
            <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>All <span className={filter === "all" ? "text-white/85" : "text-fg-muted"}>{filtered.reduce((sum, group) => sum + group.rows.length, 0)}</span></button>
            {present.map((group) => <button key={group.key} type="button" aria-pressed={filter === group.key} title={group.title} onClick={() => setFilter(group.key)} className={chip(filter === group.key)}>{group.short} <span className={filter === group.key ? "text-white/85" : "text-fg-muted"}>{group.rows.length}</span></button>)}
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search work items" aria-label="Search work items" className={`${inputClass} !w-full !py-1.5 sm:!w-60`} />
        </div>
        <div className="border-t border-line pt-3">
          <WorkFilters label="Filter work items" sheets={sheets} pins={pins} items={items} scope={scope}
            onChange={(key, value) => setScope((current) => changePhotoScope(current, key, value, (id) => sheetOfPin.get(id)))} onClear={() => setScope(emptyPhotoScope)} />
        </div>
      </div>
      <p className="text-xs text-fg-muted">Showing {shownCount} of {rows.length} work item{rows.length === 1 ? "" : "s"}. Open one to see its inspection, NCRs, photos and history.</p>
      {!shownCount ? <EmptyState title="Nothing matches" action={<button type="button" className={buttonSecondary} onClick={() => { setFilter("all"); setScope(emptyPhotoScope); setQuery("") }}>Show all work items</button>}>No work item matches these filters.</EmptyState>
        : shown.map((group) => (
          <section key={group.key} aria-label={group.title} className="space-y-2">
            <div>
              <h2 className="border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">{group.title} <span className="text-sm font-semibold text-fg-muted">({group.rows.length})</span></h2>
              {group.hint ? <p className="pl-4 text-xs text-fg-muted">{group.hint}</p> : null}
            </div>
            {list(group.rows)}
          </section>
        ))}
    </div>
  )
}

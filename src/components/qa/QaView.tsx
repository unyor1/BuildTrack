import { useEffect, useRef, useState } from "react"
import DefectDetail from "./DefectDetail"
import InspectionDetail from "./InspectionDetail"
import NewDefectModal from "./NewDefectModal"
import NewInspectionModal from "./NewInspectionModal"
import { ChecklistsPanel, DefectsPanel, InspectionsPanel, OverviewPanel, type InspectionKind, type QaMode } from "./QaPanels"
import TemplateEditor from "./TemplateEditor"
import { SnagDetail, SnagsPanel } from "./SnagPanel"
import { useSnags, type Snag } from "../../lib/snags"
import type { Defect, Template } from "../../lib/qa"
import type { QaWorkspace } from "../../lib/qaWorkspace"

export type QaTab = "overview" | "inspections" | "defects" | "snags" | "checklists"
const tabNames: Record<QaTab, string> = { overview: "Overview", inspections: "Inspections", defects: "NCR register", snags: "Client reports", checklists: "Inspection criteria" }

// The shared QA workspace. The Engineer page shows all four tabs; the Foreman's pages show one tab each (inspection requests,
// the defects assigned to them, the checklists they will be inspected against). The database decides who may do what.
export default function QaView({ ws, mode, tabs, canEditLibrary = false, inspectionKind, defectScope }: { ws: QaWorkspace; mode: QaMode; tabs: QaTab[]; canEditLibrary?: boolean; inspectionKind?: InspectionKind; defectScope?: (defect: Defect) => boolean }) {
  const [search, setSearch] = useState(window.location.search)
  useEffect(() => { const changed = () => setSearch(window.location.search); window.addEventListener("popstate", changed); return () => window.removeEventListener("popstate", changed) }, [])
  const params = new URLSearchParams(search)
  const wanted = params.get("tab") as QaTab | null
  const [tab, setTab] = useState<QaTab>(wanted && tabs.includes(wanted) ? wanted : tabs[0])
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [defectId, setDefectId] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [raising, setRaising] = useState(false)
  const [editing, setEditing] = useState<{ template: Template | null; scope: "project" | "library" } | null>(null)
  const deepLinked = useRef("")
  const [linkError, setLinkError] = useState("")
  const snagData = useSnags(tabs.includes("snags") ? ws.projectId : null)
  const [snagOpen, setSnagOpen] = useState<Snag | null>(null)

  // Links from notifications: ?inspection=<id> or ?defect=<id> opens it once the lists are loaded.
  useEffect(() => {
    const key = `${ws.projectId}:${search}`
    if (deepLinked.current === key || ws.loading || snagData.loading) return
    if (ws.error) return
    setInspectionId(null); setDefectId(null); setSnagOpen(null); setLinkError("")
    const wanted = params.get("tab") as QaTab | null
    if (wanted && tabs.includes(wanted)) setTab(wanted)
    const inspection = params.get("inspection")
    const defect = params.get("defect")
    const snagParam = params.get("snag")
    const snagHit = snagParam ? snagData.snags.find((row) => row.id === snagParam) : null
    if (snagHit) { setSnagOpen(snagHit); deepLinked.current = key }
    else if (inspection && ws.inspections.some((row) => row.id === inspection)) { setInspectionId(inspection); if (tabs.includes("inspections")) setTab("inspections"); deepLinked.current = key }
    else if (defect && ws.defects.some((row) => row.id === defect)) { setDefectId(defect); if (tabs.includes("defects")) setTab("defects"); deepLinked.current = key }
    else if (inspection || defect || snagParam) setLinkError("This linked record is unavailable in the selected project, or your access has changed.")
    else deepLinked.current = key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.loading, ws.error, ws.projectId, ws.inspections, ws.defects, snagData.loading, snagData.snags, search])

  const inspection = ws.inspections.find((row) => row.id === inspectionId) ?? null
  const defect = ws.defects.find((row) => row.id === defectId) ?? null
  const engineer = mode === "engineer"
  const waiting = ws.inspections.filter((row) => row.status === "requested" || row.status === "in_progress").length
  const open = ws.defects.filter((row) => row.status !== "closed").length
  const count: Partial<Record<QaTab, number>> = { inspections: waiting, defects: open, snags: snagData.snags.filter((row) => row.status === "submitted").length }
  const project = ws.project ? { id: ws.project.id, name: ws.project.name, code: ws.project.code, location: ws.project.location } : null

  return (
    <>
      {tabs.length > 1 ? (
        <div className="mb-4 inline-flex max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm" role="tablist" aria-label="Quality assurance">
          {tabs.map((key) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${tab === key ? "bg-brand text-white shadow-[0_6px_14px_-8px_rgba(158,31,147,0.9)]" : "text-fg-muted hover:bg-surface-muted hover:text-fg"}`}>
              {tabNames[key]}{count[key] ? <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${tab === key ? "bg-white/25" : "bg-surface-muted"}`}>{count[key]}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {ws.error ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{ws.error}</p> : null}
      {linkError ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft p-3 text-sm text-danger-fg">{linkError}</p> : null}

      {tab === "overview" ? <OverviewPanel ws={ws} mode={mode} onOpenInspection={setInspectionId} onOpenDefect={setDefectId} onGo={(next) => (tabs.includes(next) ? setTab(next) : undefined)} /> : null}
      {tab === "inspections" ? <InspectionsPanel ws={ws} canRequest kind={inspectionKind} onOpen={setInspectionId} onNew={() => setRequesting(true)} /> : null}
      {tab === "defects" ? <DefectsPanel ws={ws} mode={mode} scope={defectScope} onOpen={setDefectId} onNew={engineer ? () => setRaising(true) : null} /> : null}
      {tab === "snags" ? <SnagsPanel snags={snagData.snags} loading={snagData.loading} error={snagData.error} nameOf={ws.nameOf} onOpen={setSnagOpen} /> : null}
      {tab === "checklists" ? <ChecklistsPanel ws={ws} canEdit={engineer && Boolean(ws.projectId)} canEditLibrary={canEditLibrary} onEdit={(template, scope) => setEditing({ template, scope })} /> : null}

      {inspection && project ? (
        <InspectionDetail
          key={inspection.id}
          inspection={inspection}
          project={project}
          weights={ws.weights}
          threshold={ws.threshold}
          defects={ws.defects}
          canInspect={engineer}
          canRequest
          nameOf={ws.nameOf}
          onClose={() => setInspectionId(null)}
          onChanged={ws.reloadAll}
          onOpenDefect={(row) => { setInspectionId(null); setDefectId(row.id) }}
          onOpenInspection={(id) => setInspectionId(id)}
        />
      ) : null}
      {defect && project ? (
        <DefectDetail
          key={defect.id}
          defect={defect}
          project={project}
          foremen={ws.foremen}
          today={ws.today}
          canWork={!engineer}
          canVerify={engineer}
          nameOf={ws.nameOf}
          onClose={() => setDefectId(null)}
          onChanged={ws.reloadAll}
          onOpenInspection={(id) => { setDefectId(null); setInspectionId(id) }}
        />
      ) : null}
      {snagOpen ? (
        <SnagDetail
          snag={snagData.snags.find((row) => row.id === snagOpen.id) ?? snagOpen}
          today={ws.today}
          foremen={ws.foremen}
          nameOf={ws.nameOf}
          onClose={() => setSnagOpen(null)}
          onDecided={async (defectId) => {
            setSnagOpen(null)
            await Promise.all([ws.reloadAll(), snagData.reload()])
            if (defectId) {
              setTab("defects")
              setDefectId(defectId)
            }
          }}
        />
      ) : null}
      {requesting && ws.projectId ? (
        <NewInspectionModal
          pendingPinIds={ws.inspections.filter(i => i.status === "requested" || i.status === "in_progress").flatMap(i => i.pin_id ? [i.pin_id] : [])}
          projectId={ws.projectId}
          templates={ws.templates}
          pins={ws.work.pins}
          onClose={() => setRequesting(false)}
          onCreated={async (id) => {
            setRequesting(false)
            await ws.reloadAll()
            if (tabs.includes("inspections")) setTab("inspections")
            setInspectionId(id)
          }}
        />
      ) : null}
      {raising && ws.projectId ? (
        <NewDefectModal
          projectId={ws.projectId}
          pins={ws.work.pins}
          foremen={ws.foremen}
          today={ws.today}
          onClose={() => setRaising(false)}
          onCreated={async (id) => {
            setRaising(false)
            await ws.reloadAll()
            setDefectId(id)
          }}
        />
      ) : null}
      {editing ? (
        <TemplateEditor
          template={editing.template}
          projectId={editing.scope === "library" ? null : ws.projectId}
          standards={ws.standards}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await ws.reloadTemplates()
          }}
        />
      ) : null}
    </>
  )
}

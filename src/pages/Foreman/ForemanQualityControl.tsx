import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import WorkItemBoard from "../../components/qa/WorkItemBoard"
import WorkItemWorkspace from "../../components/qa/WorkItemWorkspace"
import { PageHead, buttonSecondary } from "../../components/ui/PageParts"
import { useAuth } from "../../lib/auth"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import { useItemParam, useWorkItems } from "../../lib/workItem"
import type { ForemanPageProps } from "./types"

// QA requests, one tile per work item (LAUNDRY → FLOOR): ready to submit, waiting for the Engineer, accepted. Corrections have their
// own page. Stage and hold-point inspections are a different kind of request and are listed separately below.
export default function ForemanQualityControl({ onNavigate }: ForemanPageProps) {
  const { profile } = useAuth()
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  const work = useWorkItems(projectId, ws.work.pins, ws.inspections, ws.defects)
  const [itemId, setItemId] = useItemParam()
  const mine = work.rows.filter((row) => row.pin.assigned_to === profile?.id)
  const corrections = mine.filter((row) => row.view.stage === "correction" || row.view.action === "open_ncr").length
  const groups = [
    { key: "submit", short: "Submit QA", title: "Open an item and submit for QA", hint: "Add the item's photos and submit directly. No Ready tick is needed.", rows: mine.filter((row) => row.view.action === "submit") },
    { key: "engineer", short: "Waiting", title: "Waiting for the Engineer", hint: "Requested, being inspected, or passed and waiting for the Engineer's decision.", rows: mine.filter((row) => row.view.owner === "Engineer" && row.view.stage !== "correction") },
    { key: "preparing", short: "Add evidence", title: "Photos needed", hint: "Open the item to add its photos, then submit for QA.", rows: mine.filter((row) => row.view.action === "add_evidence") },
    { key: "accepted", short: "Accepted", title: "Accepted", rows: mine.filter((row) => row.view.stage === "accepted") },
  ]
  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/projects" listLabel="My projects" />
      <PageHead eyebrow="Quality assurance" title="QA requests"
        description="Open each item, add photos and submit for QA. The Engineer defines its criteria when creating the item, records the inspection and accepts passed work. Earlier requests and corrections stay on record."
        actions={corrections ? <button type="button" className={buttonSecondary} onClick={() => onNavigate("issues")}>{corrections} correction{corrections === 1 ? "" : "s"} to do</button> : undefined} />
      {projectId ? <>
        <WorkItemBoard groups={groups} loading={work.loading || ws.loading} error={work.error} nameOf={ws.nameOf} sheetOf={ws.work.sheetOf} onOpen={setItemId}
          emptyTitle="No work items assigned to you" emptyText="When the Engineer assigns work with work items (e.g. FLOOR, WALL), each item appears here with its next action." />
        <section className="mt-8 space-y-2" aria-labelledby="stage-requests">
          <h2 id="stage-requests" className="border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Stage and hold-point inspections</h2>
          <p className="pl-4 text-xs text-fg-muted">A separate kind of request: a stage of the work (e.g. before pouring) inspected against its own criteria. Hold points must pass before the next stage starts. Work items are never submitted from here.</p>
          <QaView ws={ws} mode="foreman" tabs={["inspections"]} inspectionKind="stage" />
        </section>
      </> : null}
      {itemId ? <WorkItemWorkspace itemId={itemId} onClose={() => setItemId(null)} onChanged={async () => { await Promise.all([ws.reloadAll(), work.reload()]) }} /> : null}
    </div>
  )
}

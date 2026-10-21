import { useMemo, useState } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import WorkItemBoard from "../../components/qa/WorkItemBoard"
import WorkItemWorkspace from "../../components/qa/WorkItemWorkspace"
import { PageHead, buttonPrimary } from "../../components/ui/PageParts"
import { useAuth } from "../../lib/auth"
import { severityChip, severityLabels, statusChip, statusLabels, type Pin } from "../../lib/blueprints"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import { useItemParam, useWorkItems } from "../../lib/workItem"
import ReportModal from "./ReportModal"
import type { ForemanPageProps } from "./types"
import IssueDetails from "../../components/issues/IssueDetails"
import { useIssueRegister } from "../../lib/siteIssues"

// Corrections: one place for everything the Foreman must fix. Work items that failed inspection or were returned are corrected with
// ONE correction package (remarks + new photos once, the NCRs it answers, re-inspection). NCRs that belong to no work item (site
// findings, stage / hold-point inspections) keep their own form; site issues on a pin keep the progress report.
export default function ForemanIssueTracking(_: ForemanPageProps) {
  const { profile } = useAuth()
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  const work = useWorkItems(projectId, ws.work.pins, ws.inspections, ws.defects)
  const [itemId, setItemId] = useItemParam()
  const [reporting, setReporting] = useState<Pin | null>(null)
  const [issueId,setIssueId]=useState<string|null>(new URLSearchParams(window.location.search).get("issue"))
  const issueRegister=useIssueRegister(projectId)
  const mine = work.rows.filter((row) => row.pin.assigned_to === profile?.id)
  const linked = useMemo(() => new Set(work.rows.flatMap((row) => row.ncrs.map((ncr) => ncr.id))), [work.rows])
  const scope = useMemo(() => (defect: { id: string }) => !linked.has(defect.id), [linked])
  const issues = ws.work.pins.filter((pin) => (pin.status === "issue" || (issueRegister.everRaised.has(pin.id) && pin.status!=="verified")) && pin.assigned_to === profile?.id)
  const groups = [
    { key: "fix", short: "To fix", title: "Corrections to submit", hint: "Open the item, describe the fix once, add new photos, tick the NCRs it answers and submit one correction package.", rows: mine.filter((row) => row.view.owner === "Foreman" && (row.view.stage === "correction" || row.view.action === "open_ncr")) },
    { key: "review", short: "In review", title: "Corrections the Engineer is reviewing", rows: mine.filter((row) => row.view.stage !== "correction" && row.ncrs.some((ncr) => ncr.status === "for_verification")) },
  ]
  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/projects" listLabel="My projects" />
      <PageHead eyebrow="Quality assurance" title="Corrections"
        description="Work items sent back and the NCRs raised against them, in one place. You record each correction once: it re-submits the item for inspection and sends the NCRs you choose for verification. Only the Engineer closes an NCR." />
      {projectId ? <>
        <WorkItemBoard groups={groups} loading={work.loading || ws.loading} error={work.error} nameOf={ws.nameOf} sheetOf={ws.work.sheetOf} onOpen={setItemId}
          emptyTitle="Nothing to correct" emptyText="When an inspection fails or the Engineer returns a work item, it appears here with its NCRs." />
        <section className="mt-8 space-y-2" aria-labelledby="other-ncrs">
          <h2 id="other-ncrs" className="border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Other NCRs</h2>
          <p className="pl-4 text-xs text-fg-muted">Raised on site or by a stage / hold-point inspection, not by a work item. Record the corrective action and a photo in the NCR itself.</p>
          <QaView ws={ws} mode="foreman" tabs={["defects"]} defectScope={scope} />
        </section>
        {issues.length ? <section className="mt-8 space-y-2" aria-labelledby="site-issues">
          <h2 id="site-issues" className="border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Site issues on your work</h2>
          <ul className="space-y-3">
            {issues.map((pin) => (
              <li key={pin.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line border-l-4 border-l-red-600 bg-surface p-4">
                <span className="min-w-0"><span className="block text-sm font-extrabold">{pin.title}</span><span className="text-xs text-fg-muted">{ws.work.sheetOf(pin.blueprint_id)}</span></span>
                <span className="flex items-center gap-2 text-[11px]">
                  <span className={`rounded px-1.5 py-0.5 font-extrabold uppercase ${severityChip[pin.severity]}`}>{severityLabels[pin.severity]}</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
                  <button type="button" className={buttonPrimary + " !px-3 !py-1.5 !text-xs"} onClick={()=>setIssueId(pin.id)}>Details / photos</button>
                  <button type="button" className={buttonPrimary + " !px-3 !py-1.5 !text-xs"} onClick={() => setReporting(pin)}>Fix and report</button>
                </span>
              </li>
            ))}
          </ul>
        </section> : null}
      </> : null}
      {itemId ? <WorkItemWorkspace itemId={itemId} onClose={() => setItemId(null)} onChanged={async () => { await Promise.all([ws.reloadAll(), work.reload()]) }} /> : null}
      {reporting ? <ReportModal pin={reporting} onClose={() => setReporting(null)} onSaved={async () => { setReporting(null); await ws.reloadAll() }} /> : null}
      {issueId && issues.find(pin=>pin.id===issueId) ? <IssueDetails key={issueId} pin={issues.find(pin=>pin.id===issueId)!} nameOf={ws.nameOf} onClose={()=>setIssueId(null)} /> : null}
    </div>
  )
}

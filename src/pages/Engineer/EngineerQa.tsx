import { useEffect } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import { PageHead, buttonSecondary } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import type { EngineerPageProps } from "./types"

// The QA register: search, filter, export and history of every inspection and NCR. Actions happen in the Review inbox.
export default function EngineerQa({ onNavigate }: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  // Checklists moved to their own page; keep old ?tab=checklists links working.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("tab") === "checklists") onNavigate("checklists") }, [onNavigate])
  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Quality assurance"
        title="QA register"
        description="Every inspection and NCR of the project for searching, exporting and history. Work item QA and stage / hold-point inspections are labelled separately. To act on something waiting for you, use the Review inbox."
        actions={<button type="button" className={buttonSecondary} onClick={() => onNavigate("verification")}>Open the review inbox</button>}
      />
      {projectId ? <QaView ws={ws} mode="engineer" tabs={["overview", "inspections", "defects", "snags"]} dateFilter /> : null}
    </div>
  )
}

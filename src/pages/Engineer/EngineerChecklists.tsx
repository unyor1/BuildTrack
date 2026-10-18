import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import { PageHead } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import type { EngineerPageProps } from "./types"

// Checklist configuration: the inspection criteria (measurements, material checks, workmanship) that work items and stage /
// hold-point inspections are inspected against. Configuration only: requests and reviews happen elsewhere.
export default function EngineerChecklists(_: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead eyebrow="Quality assurance" title="Checklist configuration"
        description="Inspection criteria for this project: copy from the company library and adapt, or create your own. You approve which criteria apply to each work on the plan; the Foreman's work items (FLOOR, WALL…) are inspected against them." />
      {projectId ? <QaView ws={ws} mode="engineer" tabs={["checklists"]} /> : null}
    </div>
  )
}

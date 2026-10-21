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
        description="Reusable inspection criteria: copy from the company library and adapt, or create your own. On the plan, add each work checklist item with its applicable criteria in one save. The Foreman adds evidence and submits directly for QA." />
      {projectId ? <QaView ws={ws} mode="engineer" tabs={["checklists"]} /> : null}
    </div>
  )
}

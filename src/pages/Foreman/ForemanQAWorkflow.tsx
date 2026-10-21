import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import { PageHead } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import type { ForemanPageProps } from "./types"

// Reference only: the inspection criteria the Engineer inspects against, so the crew can self-check. Nothing is requested from here.
export default function ForemanQAWorkflow(_: ForemanPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/projects" listLabel="My projects" />
      <PageHead eyebrow="Quality assurance" title="Checklist reference" description="Inspection criteria (measurements, material checks, workmanship requirements) the Engineer inspects your work items against. Use them to self-check. Checklist items (FLOOR, WALL…) are submitted from the work itself or opened through QA requests." />
      {projectId ? <QaView ws={ws} mode="foreman" tabs={["checklists"]} /> : null}
    </div>
  )
}

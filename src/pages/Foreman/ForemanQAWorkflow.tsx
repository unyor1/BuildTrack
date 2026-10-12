import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import { PageHead } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import type { ForemanPageProps } from "./types"

// The checklists the engineer will inspect against, so the crew can self-check before asking.
export default function ForemanQAWorkflow(_: ForemanPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/dashboard" listLabel="My projects" />
      <PageHead eyebrow="Quality assurance" title="Inspection checklists" description="What the engineer checks for each kind of work. Go through the list yourself first: items marked as hold points stop the next stage until they pass." />
      {projectId ? <QaView ws={ws} mode="foreman" tabs={["checklists"]} /> : null}
    </div>
  )
}

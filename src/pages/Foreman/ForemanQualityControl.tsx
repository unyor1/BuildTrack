import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import { PageHead } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import type { ForemanPageProps } from "./types"

// The foreman asks for an inspection when work is ready and follows the engineer's result. The engineer owns the pass / fail decision.
export default function ForemanQualityControl(_: ForemanPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/dashboard" listLabel="My projects" />
      <PageHead eyebrow="Quality assurance" title="Inspection requests" description="Tell the engineer when work is ready to be inspected, and see the result. Hold points must pass before the next stage starts." />
      {projectId ? <QaView ws={ws} mode="foreman" tabs={["overview", "inspections"]} /> : null}
    </div>
  )
}

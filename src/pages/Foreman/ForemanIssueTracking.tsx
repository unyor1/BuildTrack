import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import { PageHead } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import type { ForemanPageProps } from "./types"

// Non-conformances (NCR) raised against the foreman's work: record the cause, the fix and how it will not happen again, add a photo,
// and send it to the engineer to verify.
export default function ForemanIssueTracking(_: ForemanPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/dashboard" listLabel="My projects" />
      <PageHead eyebrow="Quality assurance" title="Defects (NCR)" description="Items that failed inspection or were found on site. Fix them before the deadline, record what you did, add a photo and send them for verification." />
      {projectId ? <QaView ws={ws} mode="foreman" tabs={["defects"]} /> : null}
    </div>
  )
}

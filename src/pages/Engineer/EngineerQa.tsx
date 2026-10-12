import ProjectContextBar from "../../components/ProjectContextBar"
import QaView from "../../components/qa/QaView"
import { PageHead } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useQaWorkspace } from "../../lib/qaWorkspace"
import type { EngineerPageProps } from "./types"

// Quality assurance for the engineer: inspections against checklists, the non-conformance register, and the checklists themselves.
export default function EngineerQa(_: EngineerPageProps) {
  const projectId = getSelectedProjectId()
  const ws = useQaWorkspace(projectId)
  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <PageHead
        eyebrow="Quality assurance"
        title="QA / QC"
        description="Inspect work against checklists, record measurements and photos, and follow every non-conformance until it is fixed and verified."
      />
      {projectId ? <QaView ws={ws} mode="engineer" tabs={["overview", "inspections", "defects", "snags", "checklists"]} /> : null}
    </div>
  )
}

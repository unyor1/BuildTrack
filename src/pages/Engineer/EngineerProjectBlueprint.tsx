import ProjectContextBar from "../../components/ProjectContextBar"
import SelectedProjectWorkspace from "../../components/SelectedProjectWorkspace"
import { AdminButton } from "../Admin/AdminShell"
import type { EngineerPageProps } from "./types"

export default function EngineerProjectBlueprint({ onNavigate }: EngineerPageProps) {
  return (
    <div className="engineer-page">
      <ProjectContextBar listPath="/engineer/projects" listLabel="My projects" />
      <div className="engineer-intro engineer-intro--blueprint">
        <div>
          <span className="engineer-eyebrow">Plans and pins</span>
          <h1>Project Blueprint</h1>
          <p>
            Upload each sheet (export your CAD drawing as PDF or PNG), then open the editor to drop pins, add notes,
            highlight areas and measure. Foremen report progress on the pins, and you verify it.
          </p>
        </div>
        <div className="engineer-action-row">
          <AdminButton icon="pin" onClick={() => onNavigate("annotation")}>
            Open the editor
          </AdminButton>
          <AdminButton variant="outline" icon="history" onClick={() => onNavigate("verification")}>
            Inspection queue
          </AdminButton>
        </div>
      </div>
      <SelectedProjectWorkspace role="engineer" canEdit />
    </div>
  )
}

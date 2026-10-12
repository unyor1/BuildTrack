import AssignedProjects from "../../components/AssignedProjects"
import { AdminButton } from "../Admin/AdminShell"
import type { EngineerPageProps } from "./types"

export default function EngineerProjects({ onNavigate }: EngineerPageProps) {
  return (
    <div className="engineer-page">
      <div className="engineer-intro">
        <div>
          <span className="engineer-eyebrow">Assigned by Admin • No project creation permissions</span>
          <h1>Assigned Projects</h1>
          <p>
            Only projects an administrator assigned to you are shown. Open a project to review its blueprints,
            inspections, verified progress, and issues.
          </p>
        </div>
        <AdminButton icon="history" onClick={() => onNavigate("verification")}>
          Inspection queue
        </AdminButton>
      </div>
      <AssignedProjects title="Projects" />
    </div>
  )
}

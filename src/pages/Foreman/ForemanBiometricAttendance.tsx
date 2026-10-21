import ForemanWorkerAttendance from "../../components/attendance/ForemanWorkerAttendance"
import { getSelectedProjectId, useProject } from "../../lib/projects"
import type { ForemanPageProps } from "./types"

export default function ForemanBiometricAttendance(_: ForemanPageProps) {
  const projectId = getSelectedProjectId()
  const { project, loading } = useProject(projectId)
  if (loading) return <p role="status">Loading workforce management…</p>
  if (!project || !projectId || project.id !== projectId)
    return <p>Select an assigned project to view attendance.</p>
  return (
    <div className="foreman-page">
      <ForemanWorkerAttendance
        key={projectId}
        projectId={projectId}
        projectName={`${project.code} · ${project.name}`}
      />
    </div>
  )
}

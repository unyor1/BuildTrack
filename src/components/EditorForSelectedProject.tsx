import BlueprintEditor from "./editor/BlueprintEditor"
import type { EditorRole } from "./editor/Inspector"
import { Skeleton } from "./ui/Skeleton"
import { getSelectedProjectId, useProject } from "../lib/projects"

// A page that IS the editor (Engineer annotation, Client blueprint): opens the full-window editor for the selected project.
export default function EditorForSelectedProject({ role, canEdit, onExit, listLabel }: { role: EditorRole; canEdit: boolean; onExit: () => void; listLabel: string }) {
  const projectId = getSelectedProjectId()
  const { project, loading, notFound } = useProject(projectId)

  if (loading) return <Skeleton className="m-6 h-[70vh] rounded-xl" />
  if (!projectId || notFound || !project) {
    return (
      <div className="m-6 rounded-2xl border border-dashed border-line bg-surface p-10 text-center text-fg">
        <p className="mb-3">{notFound ? "This project does not exist or is not assigned to you." : "No project selected. Pick one of your projects to open its plans."}</p>
        <button type="button" onClick={onExit} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover">{listLabel}</button>
      </div>
    )
  }
  return <BlueprintEditor projectId={project.id} role={role} canEdit={canEdit} onExit={onExit} />
}

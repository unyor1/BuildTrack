import { AdminButton, PageIntro } from "./AdminShell"
import type { AdminPageProps } from "./types"
import SelectedProjectWorkspace from "../../components/SelectedProjectWorkspace"
import ProjectCard from "../../components/ProjectCard"
import { useAuth } from "../../lib/auth"
import { getSelectedProjectId, useProject, useProjects } from "../../lib/projects"
import { Skeleton, SkeletonCardGrid } from "../../components/ui/Skeleton"

export default function BlueprintUpload({ onNavigate }: AdminPageProps) {
  const { can } = useAuth()
  const projectId = getSelectedProjectId()
  const { project, loading, notFound } = useProject(projectId)
  const { projects, loading: listLoading } = useProjects()

  const showPicker = !projectId || notFound
  // Remember the choice for this tab and keep the user on this page.
  const go = (id: string | null) => {
    try {
      if (id) sessionStorage.setItem("buildtrack.project", id)
      else sessionStorage.removeItem("buildtrack.project")
    } catch {
      // storage unavailable: the URL parameter still carries the selection
    }
    window.history.replaceState({}, "", id ? `/admin/blueprint-upload?project=${id}` : "/admin/blueprint-upload")
    window.dispatchEvent(new PopStateEvent("popstate"))
  }

  return (
    <div className="admin-page">
      <PageIntro
        eyebrow="Blueprints • Admin"
        title="Blueprint Management"
        description="Upload plans and revisions for a project, and place or review pins. Engineers assigned to the project can do the same from their panel."
        action={
          project ? (
            <AdminButton variant="outline" icon="building" onClick={() => go(null)}>
              Change project
            </AdminButton>
          ) : undefined
        }
      />
      {showPicker ? (
        <>
          <p className="mb-3 text-sm text-fg-muted">{notFound ? "That project no longer exists. " : ""}Choose a project to work on its plans.</p>
          {listLoading ? <SkeletonCardGrid count={3} /> : null}
          {!listLoading && projects.length === 0 ? <p className="text-sm text-fg-muted">There are no projects yet. Create one in Project Management first.</p> : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((item) => (
              <ProjectCard key={item.id} project={item} onOpen={() => go(item.id)} />
            ))}
          </div>
        </>
      ) : loading || !project ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : (
        <>
          <p className="mb-3 text-sm text-fg">
            <strong>{project.code}</strong> • {project.name}
            <button className="ml-3 text-brand-text hover:underline" onClick={() => onNavigate("project-overview")}>Project overview</button>
          </p>
          <SelectedProjectWorkspace key={project.id} role="admin" canEdit={can("blueprints.manage")} />
        </>
      )}
    </div>
  )
}

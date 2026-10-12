import { disciplineLabels, getSelectedProjectId, phaseLabels, statusColor, statusLabels, useProject, useProjectTeam } from "../lib/projects"
import { Skeleton } from "./ui/Skeleton"

// Shown at the top of project workspaces (blueprint, daily work, ...). Tells the user which project
// they are in, and handles "no project picked" and "not assigned to you" cleanly.
export default function ProjectContextBar({ listPath, listLabel }: { listPath: string; listLabel: string }) {
  const projectId = getSelectedProjectId()
  const { project, loading, notFound } = useProject(projectId)
  const { team } = useProjectTeam(project ? project.id : null)

  const goToList = () => {
    window.history.pushState({}, "", listPath)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }

  if (!projectId) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-surface p-4 text-sm text-fg">
        <span>No project selected. Pick one of your assigned projects to work in it.</span>
        <button onClick={goToList} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-hover">
          {listLabel}
        </button>
      </div>
    )
  }
  if (loading) return <Skeleton className="mb-4 h-24 w-full rounded-xl" />
  if (notFound || !project) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-danger-soft p-4 text-sm text-danger-fg">
        <span>This project does not exist or is not assigned to you.</span>
        <button onClick={goToList} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-hover">
          {listLabel}
        </button>
      </div>
    )
  }
  const roleName = { engineer: "Engineer", foreman: "Foreman", client: "Client" } as const
  return (
    <div className="mb-4 space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-text">{project.code}</p>
          <h2 className="text-lg font-extrabold text-fg">{project.name}</h2>
          <p className="text-sm text-fg-muted">
            {project.location ?? "Location not set"} • Phase: {phaseLabels[project.phase]}
          </p>
          {project.manager_name ? (
            <p className="text-sm text-fg-muted">
              Person in charge: <strong className="text-fg">{project.manager_name}</strong>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[project.status]}`}>
            {statusLabels[project.status]}
          </span>
          <button onClick={goToList} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-fg hover:bg-surface-muted">
            {listLabel}
          </button>
        </div>
      </div>
      {(project.disciplines ?? []).length || team.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
          {(project.disciplines ?? []).map((d) => (
            <span key={d} className="rounded bg-brand-soft px-1.5 py-0.5 font-semibold text-brand-text">
              {disciplineLabels[d]}
            </span>
          ))}
          {team.map((member) => (
            <span key={member.user_id} className="rounded-full border border-line px-2 py-0.5 text-fg">
              {member.full_name} <span className="text-fg-muted">• {roleName[member.role]}{member.is_lead ? " in charge" : ""}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

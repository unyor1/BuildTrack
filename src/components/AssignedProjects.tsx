import { useMemo, useState, type ReactNode } from "react"
import { useAuth } from "../lib/auth"
import { openProject, statusLabels, useProjects, type ProjectRole, type ProjectStatus } from "../lib/projects"
import ProjectCard from "./ProjectCard"
import { SkeletonCardGrid } from "./ui/Skeleton"

// Drive-style grid of the projects the signed-in Engineer / Foreman / Client is assigned to.
// The database (RLS) only returns those; clicking a card opens that project's workspace for the user's role.
export default function AssignedProjects({ title = "My assigned projects", cardExtra }: { title?: string; cardExtra?: (projectId: string) => ReactNode }) {
  const { profile } = useAuth()
  const { projects, loading, error, reload } = useProjects()
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<ProjectStatus | "all">("all")
  const role = profile?.role as ProjectRole | undefined

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    return projects.filter(
      (project) =>
        (status === "all" || project.status === status) &&
        (!text || `${project.code} ${project.name} ${project.location ?? ""}`.toLowerCase().includes(text)),
    )
  }, [projects, query, status])

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="border-l-4 border-accent pl-3 text-lg font-extrabold text-brand-strong">
          {title} <span className="text-sm font-semibold text-fg-muted">({projects.length})</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects..."
            aria-label="Search projects"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus | "all")}
            aria-label="Filter by status"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg"
          >
            <option value="all">All statuses</option>
            {(Object.keys(statusLabels) as ProjectStatus[]).map((key) => (
              <option key={key} value={key}>{statusLabels[key]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <SkeletonCardGrid count={3} /> : null}
      {error ? (
        <div className="flex items-center gap-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">
          {error}
          <button className="font-bold underline" onClick={() => void reload()}>Retry</button>
        </div>
      ) : null}
      {!loading && !error && projects.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fg-muted">
          No projects are assigned to you yet. Ask an administrator to add you to a project.
        </p>
      ) : null}
      {!loading && projects.length > 0 && visible.length === 0 ? (
        <p className="text-sm text-fg-muted">No projects match your search.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onOpen={role ? () => openProject(role, project.id) : undefined}
            actions={cardExtra?.(project.id)}
          />
        ))}
      </div>
    </section>
  )
}

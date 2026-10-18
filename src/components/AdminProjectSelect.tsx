import { useCallback, useEffect, useState } from "react"
import { getSelectedProjectId, useProjects, type Project } from "../lib/projects"
import { readProjectRoute } from "../lib/projectRoutes"

const SELECTED_KEY = "buildtrack.project"

// Admin screens work on one project at a time. The choice follows the same ?project= / session value as the other panels.
export function useAdminProject() {
  const { projects, loading, error } = useProjects()
  const [chosen, setChosen] = useState<string | null>(() => getSelectedProjectId())
  const scoped = readProjectRoute(window.location.pathname) ?? (new URLSearchParams(window.location.search).get("project") ? { projectId: getSelectedProjectId() } : null)
  const project: Project | null = projects.find((item) => item.id === (scoped?.projectId ?? chosen)) ?? null

  useEffect(() => {
    if (!scoped && !chosen && !loading && projects.length) setChosen(projects[0].id)
  }, [loading, projects, chosen])

  const choose = useCallback((id: string) => {
    setChosen(id)
    try {
      sessionStorage.setItem(SELECTED_KEY, id)
    } catch {
      // The ?project= parameter below still carries the choice.
    }
    const url = new URL(window.location.href)
    url.searchParams.set("project", id)
    window.history.replaceState({}, "", url)
  }, [])

  return { projects, project, projectId: project?.id ?? null, loading, error, choose }
}

export default function AdminProjectSelect({ projects, value, onChange }: { projects: Project[]; value: string | null; onChange: (id: string) => void }) {
  if (readProjectRoute(window.location.pathname) || new URLSearchParams(window.location.search).has("project")) return null
  return (
    <label className="text-xs font-bold uppercase tracking-wider text-fg-muted">Project
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={!projects.length} className="mt-1 block min-w-[16rem] rounded-lg border border-line bg-surface px-3 py-2 text-sm normal-case text-fg">
        {projects.length === 0 ? <option value="">No projects</option> : null}
        {projects.map((project) => <option key={project.id} value={project.id}>{project.code} • {project.name}</option>)}
      </select>
    </label>
  )
}

import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"

export type Discipline = "civil_structural" | "architectural" | "mep"
export type ProjectPhase = "plan_review" | "team_briefing" | "mobilization" | "execution"
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled"

export type Project = {
  id: string
  code: string
  name: string
  location: string | null
  client_name: string | null
  description: string | null
  phase: ProjectPhase
  status: ProjectStatus
  start_date: string | null
  end_date: string | null
  manager_name: string | null
  lead_engineer_id: string | null
  lead_foreman_id: string | null
  disciplines: Discipline[]
  created_at: string
}

export type ProjectMember = {
  project_id: string
  user_id: string
  member_role: "engineer" | "foreman" | "client"
}

export const phaseLabels: Record<ProjectPhase, string> = {
  plan_review: "Plan review",
  team_briefing: "Team briefing",
  mobilization: "Mobilization",
  execution: "Execution",
}

export const statusLabels: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
}

export const disciplineLabels: Record<Discipline, string> = {
  civil_structural: "Civil & Structural",
  architectural: "Architectural",
  mep: "MEP",
}

export const statusColor: Record<ProjectStatus, string> = {
  planning: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  completed: "bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/40 dark:text-fuchsia-200",
  cancelled: "bg-gray-200 text-gray-700 dark:bg-gray-700/50 dark:text-gray-200",
}

// Row Level Security decides what comes back: Admins see all, everyone else only assigned projects.
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const reload = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })
    setError(loadError ? "Could not load projects. Check your connection and try again." : "")
    setProjects((data as Project[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { projects, loading, error, reload }
}

// ---- Selected project (which project's workspace the user is looking at) ----
// Kept in the URL (?project=<id>, shareable) and mirrored in sessionStorage so sidebar links keep the context.
const SELECTED_KEY = "buildtrack.project"

export function getSelectedProjectId(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("project")
  if (fromUrl) return fromUrl
  try {
    return sessionStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

export type ProjectRole = "engineer" | "foreman" | "client" | "admin"

// Where each role lands after picking a project card.
const workspacePath: Record<ProjectRole, string> = {
  admin: "/admin/project-overview",
  engineer: "/engineer/project-blueprint",
  foreman: "/foreman/daily-work",
  client: "/client/blueprint",
}

export function openProject(role: ProjectRole, projectId: string) {
  try {
    sessionStorage.setItem(SELECTED_KEY, projectId)
  } catch {
    // sessionStorage unavailable: the URL parameter still carries the selection.
  }
  window.history.pushState({}, "", `${workspacePath[role]}?project=${projectId}`)
  window.scrollTo({ top: 0 })
  window.dispatchEvent(new PopStateEvent("popstate")) // makes App re-read the path
}

export function useProject(projectId: string | null) {
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(Boolean(projectId))
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      setLoading(false)
      setNotFound(false)
      return
    }
    let active = true
    setLoading(true)
    supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setProject((data as Project | null) ?? null)
        setNotFound(!data) // RLS hides projects the user is not assigned to
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [projectId])

  return { project, loading, notFound }
}

export type TeamMember = { user_id: string; full_name: string; role: "engineer" | "foreman" | "client"; is_lead: boolean }

// Who is on a project (names and roles only). The database decides if the caller may see it.
export function useProjectTeam(projectId: string | null) {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(Boolean(projectId))

  useEffect(() => {
    if (!projectId) {
      setTeam([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    supabase.rpc("get_project_team", { pid: projectId }).then(({ data }) => {
      if (!active) return
      setTeam((data as TeamMember[] | null) ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [projectId])

  return { team, loading }
}

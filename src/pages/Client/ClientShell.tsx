import { useEffect, type ReactNode } from "react"
import AppShell from "../../components/shell/AppShell"
import { getSelectedProjectId, phaseLabels, rememberProject, useProjects } from "../../lib/projects"
import { EmptyState, inputClass } from "../../components/ui/PageParts"
import { Skeleton } from "../../components/ui/Skeleton"
import type { AdminIconName } from "../Admin/AdminIcon"
import type { ClientNavigate, ClientPageKey } from "./types"

const labels: Record<ClientPageKey, { label: string; icon: AdminIconName }> = {
  overview: { label: "Overview & progress", icon: "grid" },
  calendar: { label: "Project Calendar", icon: "calendar" },
  blueprint: { label: "Blueprint & issues", icon: "blueprint" },
  ticket: { label: "Report a Problem", icon: "pin" },
  "site-logs": { label: "Site logs & media", icon: "history" },
  communication: { label: "Communication", icon: "users" },
}

export default function ClientShell({
  activePage,
  onNavigate,
  children,
}: {
  activePage: ClientPageKey
  onNavigate: ClientNavigate
  children: ReactNode
}) {
  const { projects, loading, error, reload } = useProjects()
  const selected = getSelectedProjectId()
  const project = projects.find(row => row.id === selected) ?? projects[0] ?? null
  const select = (id: string, replace = false) => {
    if (!projects.some(row => row.id === id)) return
    rememberProject(id)
    const path = `${window.location.pathname}?project=${encodeURIComponent(id)}`
    if (replace) window.history.replaceState({}, "", path)
    else window.history.pushState({}, "", path)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  useEffect(() => {
    if (!loading && !error && project && selected !== project.id) select(project.id, true)
  }, [loading, error, project?.id, selected])
  const item = (key: ClientPageKey) => ({ key, ...labels[key] })
  return (
    <AppShell
      persona="client"
      workspace="Client portal"
      groups={[
        { label: "Your project", items: [item("overview"), item("calendar"), item("blueprint"), item("site-logs")] },
        { label: "Talk to the team", items: [item("ticket"), item("communication")] },
      ]}
      active={activePage}
      onNavigate={(key) => onNavigate(key as ClientPageKey)}
      project={project ? { code: project.code, name: project.name, sub: phaseLabels[project.phase] } : null}
      projectEmpty="No assigned project"
      mobileTabs={["overview", "blueprint", "ticket", "communication"]}
    >
      {loading ? <Skeleton className="m-6 h-64 rounded-xl" /> : error ? <div role="alert" className="m-6 rounded-xl border border-line p-5">{error} <button type="button" onClick={() => void reload()} className="underline">Retry</button></div> : !project ? <div className="m-6"><EmptyState title="No project assigned">Ask your administrator to assign you to a project.</EmptyState></div> : selected !== project.id ? <Skeleton className="m-6 h-64 rounded-xl" /> : <div key={project.id}>
        {activePage !== "blueprint" ? <div className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:mx-8">
          <div><p className="text-xs font-bold text-brand-text">{project.code}</p><h2 className="font-extrabold">{project.name}</h2></div>
          {projects.length > 1 ? <label className="text-xs font-semibold">Your project<select aria-label="Switch assigned project" className={`${inputClass} mt-1`} value={project.id} onChange={event => select(event.target.value)}>{projects.map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label> : null}
        </div> : null}
        {children}
      </div>}
    </AppShell>
  )
}

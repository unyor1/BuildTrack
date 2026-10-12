import type { ReactNode } from "react"
import AppShell from "../../components/shell/AppShell"
import { getSelectedProjectId, phaseLabels, useProject } from "../../lib/projects"
import type { AdminIconName } from "../Admin/AdminIcon"
import type { ClientNavigate, ClientPageKey } from "./types"

const labels: Record<ClientPageKey, { label: string; icon: AdminIconName }> = {
  overview: { label: "Overview & progress", icon: "grid" },
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
  const { project } = useProject(getSelectedProjectId())
  const item = (key: ClientPageKey) => ({ key, ...labels[key] })
  return (
    <AppShell
      persona="client"
      workspace="Client portal"
      groups={[
        { label: "Your project", items: [item("overview"), item("blueprint"), item("site-logs")] },
        { label: "Talk to the team", items: [item("ticket"), item("communication")] },
      ]}
      active={activePage}
      onNavigate={(key) => onNavigate(key as ClientPageKey)}
      project={project ? { code: project.code, name: project.name, sub: phaseLabels[project.phase] } : null}
      projectEmpty="Pick a project from the overview"
      mobileTabs={["overview", "blueprint", "ticket", "communication"]}
    >
      {children}
    </AppShell>
  )
}

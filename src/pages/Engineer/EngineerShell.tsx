import type { ReactNode } from "react"
import AppShell from "../../components/shell/AppShell"
import { useAuth } from "../../lib/auth"
import { usePinCounts } from "../../lib/pinCounts"
import { useQaBadge } from "../../lib/qaLite"
import { getSelectedProjectId, phaseLabels, useProject } from "../../lib/projects"
import type { AdminIconName } from "../Admin/AdminIcon"
import type { EngineerNavigate, EngineerPageKey } from "./types"

const labels: Record<EngineerPageKey, { label: string; icon: AdminIconName }> = {
  dashboard: { label: "Dashboard", icon: "grid" },
  projects: { label: "Assigned Projects", icon: "building" },
  "project-blueprint": { label: "Blueprints", icon: "blueprint" },
  annotation: { label: "Plan Editor", icon: "pin" },
  verification: { label: "Verification Queue", icon: "check" },
  "report-issue": { label: "Issue Register", icon: "close" },
  progress: { label: "Progress by Zone", icon: "chart" },
  assignments: { label: "Assignment Board", icon: "users" },
  reports: { label: "Site Logs & Reports", icon: "file" },
  qa: { label: "QA / QC", icon: "clipboard" },
}

export default function EngineerShell({
  activePage,
  onNavigate,
  children,
}: {
  activePage: EngineerPageKey
  onNavigate: EngineerNavigate
  children: ReactNode
}) {
  const { profile } = useAuth()
  const { project } = useProject(getSelectedProjectId())
  const counts = usePinCounts(activePage)
  const qaCount = useQaBadge("engineer", profile?.id ?? null, activePage)
  const badge = (key: EngineerPageKey) => (key === "verification" ? counts.review : key === "report-issue" ? counts.issue : key === "qa" ? qaCount : 0) || undefined
  const item = (key: EngineerPageKey) => ({ key, ...labels[key], badge: badge(key) })

  return (
    <AppShell
      persona="engineer"
      workspace="Engineering office"
      groups={[
        { label: "Workspace", items: [item("dashboard"), item("projects")] },
        { label: "Plans", items: [item("project-blueprint"), item("annotation")] },
        { label: "Field & quality", items: [item("verification"), item("qa"), item("report-issue"), item("progress")] },
        { label: "Team & reports", items: [item("assignments"), item("reports")] },
      ]}
      active={activePage}
      onNavigate={(key) => onNavigate(key as EngineerPageKey)}
      project={project ? { code: project.code, name: project.name, sub: phaseLabels[project.phase] } : null}
      projectEmpty="Pick one under Assigned Projects"
      mobileTabs={["dashboard", "verification", "qa", "annotation"]}
    >
      {children}
    </AppShell>
  )
}

import { useEffect, useState, type ReactNode } from "react"
import SampleNotice from "../../components/SampleNotice"
import AppShell from "../../components/shell/AppShell"
import { useAuth } from "../../lib/auth"
import { useQaBadge } from "../../lib/qaLite"
import { getSelectedProjectId, phaseLabels, useProject } from "../../lib/projects"
import type { AdminIconName } from "../Admin/AdminIcon"
import type { ForemanNavigate, ForemanPageKey } from "./types"

const labels: Record<ForemanPageKey, { label: string; icon: AdminIconName }> = {
  dashboard: { label: "Dashboard", icon: "grid" },
  "daily-work": { label: "Site Plan & Daily Work", icon: "blueprint" },
  "daily-report": { label: "Daily Progress Report", icon: "file" },
  "photo-documentation": { label: "Photo Documentation", icon: "camera" },
  "quality-control": { label: "Inspection Requests", icon: "clipboard" },
  "qa-workflow": { label: "Inspection Checklists", icon: "check" },
  issues: { label: "Defects (NCR)", icon: "close" },
  "corrective-action": { label: "Corrective Action", icon: "edit" },
  attendance: { label: "Biometric Attendance", icon: "fingerprint" },
}

const samplePages: ForemanPageKey[] = ["attendance"]

export default function ForemanShell({
  activePage,
  onNavigate,
  children,
}: {
  activePage: ForemanPageKey
  onNavigate: ForemanNavigate
  children: ReactNode
}) {
  const { profile } = useAuth()
  const { project } = useProject(getSelectedProjectId())
  const qaCount = useQaBadge("foreman", profile?.id ?? null, activePage)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  const clock = `${now.toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" })} PHT`
  const item = (key: ForemanPageKey) => ({ key, ...labels[key], badge: key === "issues" ? qaCount || undefined : undefined })

  return (
    <AppShell
      persona="foreman"
      workspace="Field operations"
      groups={[
        { label: "Today", items: [item("dashboard"), item("daily-work"), item("daily-report"), item("photo-documentation")] },
        { label: "Quality", items: [item("quality-control"), item("qa-workflow"), item("issues"), item("corrective-action")] },
        { label: "Crew", items: [item("attendance")] },
      ]}
      active={activePage}
      onNavigate={(key) => onNavigate(key as ForemanPageKey)}
      project={project ? { code: project.code, name: project.name, sub: phaseLabels[project.phase] } : null}
      projectEmpty="Choose one from the dashboard"
      mobileTabs={["dashboard", "daily-report", "photo-documentation", "corrective-action"]}
      topExtra={<time className="hidden whitespace-nowrap text-xs font-semibold text-fg-muted xl:block">{clock}</time>}
      banner={samplePages.includes(activePage) ? <SampleNotice /> : null}
    >
      {children}
    </AppShell>
  )
}

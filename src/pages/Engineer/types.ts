export type EngineerPageKey = "dashboard" | "projects" | "project-blueprint" | "annotation" | "verification" | "report-issue" | "progress" | "assignments" | "reports" | "qa" | "checklists"

export type EngineerNavigate = (page: EngineerPageKey) => void

export type EngineerPageProps = {
  onNavigate: EngineerNavigate
}

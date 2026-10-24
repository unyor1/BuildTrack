export type ForemanPageKey = "projects" | "dashboard" | "attendance" | "daily-work" | "daily-report" | "photo-documentation" | "quality-control" | "qa-workflow" | "issues" | "calendar"

export type ForemanNavigate = (page: ForemanPageKey) => void
export type ForemanPageProps = { onNavigate: ForemanNavigate }

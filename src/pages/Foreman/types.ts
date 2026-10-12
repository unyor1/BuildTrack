export type ForemanPageKey = "dashboard" | "attendance" | "daily-work" | "daily-report" | "photo-documentation" | "quality-control" | "qa-workflow" | "issues" | "corrective-action"

export type ForemanNavigate = (page: ForemanPageKey) => void
export type ForemanPageProps = { onNavigate: ForemanNavigate }

export type ClientPageKey = "overview" | "blueprint" | "ticket" | "site-logs" | "communication"
export type ClientNavigate = (page: ClientPageKey) => void
export type ClientPageProps = { onNavigate: ClientNavigate }

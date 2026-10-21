import type { DailyReport } from "./reportFormat"
import type { PinStatus } from "./blueprints"

export const clientPinStatus = (status: PinStatus): PinStatus => status === "for_review" ? "in_progress" : status
export function reportsForPin(reports: DailyReport[], projectId: string, pinId: string) {
  return reports.filter(report => report.project_id === projectId && report.status === "submitted" && report.linked_work?.some(link => link.pin_id === pinId))
}
export const clientPinPath = (projectId: string, sheetId: string, pinId: string) => `/client/blueprint?project=${encodeURIComponent(projectId)}&sheet=${encodeURIComponent(sheetId)}&pin=${encodeURIComponent(pinId)}`
export const clientActionPath = (page: "ticket" | "communication", projectId: string, pinId: string) => `/client/${page}?project=${encodeURIComponent(projectId)}&pin=${encodeURIComponent(pinId)}`
export function openClientPath(path: string) {
  window.history.pushState({}, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

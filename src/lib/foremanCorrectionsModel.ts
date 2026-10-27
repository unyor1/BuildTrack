import type { BoardFilter } from "../components/qa/WorkItemBoard"
import type { WorkItemRow } from "./workItem"

export function correctionGroup(row: Pick<WorkItemRow, "view" | "current" | "ncrs" | "attempts">): "fix" | "review" | "completed" | null {
  if (row.view.stage === "completed") return "completed"
  if (row.view.owner === "Foreman" && (row.view.stage === "correction" || row.view.action === "open_ncr")) return "fix"
  const resubmitted = row.attempts > 1 || Boolean(row.current?.reinspection_of)
  if (row.ncrs.some(ncr => ncr.status === "for_verification") || (resubmitted && ["requested", "in_progress", "passed"].includes(row.current?.status ?? ""))) return "review"
  return null
}

// Use permanent location ids. Whole-pin/project-wide records do not match a selected checklist item.
export function correctionRecordMatches(record: { pinId: string | null; sheetId?: string; itemIds: string[]; text: string }, filters: BoardFilter): boolean {
  const { scope, query } = filters
  return (!scope.sheet || record.sheetId === scope.sheet) && (!scope.pin || record.pinId === scope.pin)
    && (!scope.item || record.itemIds.includes(scope.item)) && (!query.trim() || record.text.toLowerCase().includes(query.trim().toLowerCase()))
}

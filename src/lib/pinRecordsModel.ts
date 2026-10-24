// Records connected to one blueprint pin: which panel section shows them for each role, where "Open on blueprint" goes,
// which checklist item an NCR concerns, the section counts and the next actions. Pure, tested in `pnpm test:lib`.
// Links are permanent ids: a renamed pin or checklist item keeps its records; a removed item falls back to the saved name.
import { submittedChecklistItems, type ChecklistRecord } from "./qaChecklistModel.ts"
import { dueText, refNumber, type DefectStatus, type InspectionStatus, type SnagStatus } from "./qaModel.ts"

export type PanelRole = "engineer" | "foreman" | "client" | "admin"
export type PinSection = "details" | "checklist" | "issues" | "reports" | "photos" | "activity" | "communication"

export const pinSectionLabels: Record<PinSection, string> = {
  details: "Details", checklist: "Checklist & QA", issues: "Issues & NCRs", reports: "Daily reports", photos: "Photos", activity: "Activity", communication: "Communication",
}
// Clients never see QA records, staff photos or the timeline; Admins read but never act (no inspection or NCR rights).
const sections: Record<PanelRole, PinSection[]> = {
  engineer: ["details", "checklist", "issues", "reports", "photos", "activity", "communication"],
  foreman: ["details", "checklist", "issues", "reports", "photos", "activity"],
  client: ["details", "checklist", "issues", "reports", "communication"],
  admin: ["details", "checklist", "issues", "reports", "photos", "activity"],
}
export const pinSectionsFor = (role: PanelRole): PinSection[] => sections[role]
export const clientSectionLabel = (section: PinSection) => section === "issues" ? "My reports" : pinSectionLabels[section]
export const sectionLabel = (role: PanelRole, section: PinSection) => role === "client" ? clientSectionLabel(section) : pinSectionLabels[section]

// ?pintab=<section> opens that section; the older ?worktab=checklist still works. Unknown or forbidden sections open Details.
export function readPinSection(search: string, role: PanelRole): PinSection {
  const params = new URLSearchParams(search)
  const wanted = params.get("pintab") ?? (params.get("worktab") === "checklist" ? "checklist" : "")
  return (sections[role] as string[]).includes(wanted) ? (wanted as PinSection) : "details"
}

// The page that holds the blueprint for each role, with project, sheet, pin and panel section.
export function pinPlanPath(role: PanelRole, link: { projectId: string; pinId: string; sheetId?: string | null; section?: PinSection }): string {
  const params = new URLSearchParams()
  params.set("project", link.projectId)
  if (link.sheetId) params.set("sheet", link.sheetId)
  params.set("pin", link.pinId)
  if (link.section && link.section !== "details") params.set("pintab", link.section)
  const base = role === "engineer" ? "/engineer/annotation" : role === "foreman" ? "/foreman/daily-work" : role === "client" ? "/client/blueprint" : `/admin/projects/${encodeURIComponent(link.projectId)}/blueprints`
  return `${base}?${params.toString()}`
}
export const panelRole = (role: string | null | undefined): PanelRole | null =>
  role === "engineer" || role === "foreman" || role === "client" ? role : role === "admin" || role === "super_admin" ? "admin" : null

export type DefectLink = { id: string; number: number; status: DefectStatus; title: string; pin_id: string | null; inspection_id: string | null; checklist_item_id?: string | null; checklist_name?: string | null; assigned_to: string | null; due_date: string | null }
export type InspectionLink = { id: string; number: number; status: InspectionStatus; title: string; pin_id: string | null; requested_at: string; requested_by: string | null; inspector_id: string | null; work_item_ids?: string[] | null }
export type SubmissionLink = ChecklistRecord & { inspection_id: string; pin_id: string }
export type SnagLink = { id: string; number: number; status: SnagStatus; title: string; fix_stage: string | null; defect_id: string | null; created_at: string }
export type QuestionLink = { id: string; answer: string | null; created_at: string }
export type ItemName = { id: string; text: string }

// The checklist item(s) an NCR concerns: its own saved link, else the items of the request its inspection checked.
// Current names win (renames show), saved names remain when the item is gone. Empty = the whole work pin.
export function defectChecklist(defect: DefectLink, submissions: SubmissionLink[], items: ItemName[]): ItemName[] {
  const current = new Map(items.map((item) => [item.id, item.text]))
  if (defect.checklist_item_id || defect.checklist_name) {
    const id = defect.checklist_item_id ?? ""
    return [{ id, text: (id && current.get(id)) || defect.checklist_name || "Checklist item" }]
  }
  if (!defect.inspection_id) return []
  const submission = submissions.find((row) => row.inspection_id === defect.inspection_id && row.pin_id === defect.pin_id)
  return submission ? submittedChecklistItems(submission).map((item) => ({ id: item.id, text: current.get(item.id) ?? item.text })) : []
}
// Inspections list the checklist items they were requested for (stage / hold-point inspections cover the whole pin).
export function inspectionChecklist(inspection: InspectionLink, submissions: SubmissionLink[], items: ItemName[]): ItemName[] {
  const current = new Map(items.map((item) => [item.id, item.text]))
  const submission = submissions.find((row) => row.inspection_id === inspection.id)
  if (submission) return submittedChecklistItems(submission).map((item) => ({ id: item.id, text: current.get(item.id) ?? item.text }))
  return (inspection.work_item_ids ?? []).flatMap((id) => current.has(id) ? [{ id, text: current.get(id) as string }] : [])
}
export const checklistText = (rows: ItemName[]) => rows.length ? rows.map((row) => row.text).join(", ") : "Whole work pin"

const openInspection = (status: InspectionStatus) => status === "requested" || status === "in_progress"
export type PinRecordSet = { defects: DefectLink[]; inspections: InspectionLink[]; snags: SnagLink[]; issues: number; questions: QuestionLink[]; reports: number }

// Badge numbers: what still needs attention in Issues & NCRs and Communication; Daily reports shows how many are linked.
export function pinSectionCounts(role: PanelRole, records: PinRecordSet): Partial<Record<PinSection, number>> {
  if (role === "client") return {
    issues: records.snags.filter((row) => row.status === "submitted" || row.status === "accepted").length,
    reports: records.reports,
    communication: records.questions.filter((row) => !row.answer).length,
  }
  const counts: Partial<Record<PinSection, number>> = {
    issues: records.defects.filter((row) => row.status !== "closed").length + records.inspections.filter((row) => openInspection(row.status)).length
      + (role === "engineer" ? records.snags.filter((row) => row.status === "submitted").length : 0),
    reports: records.reports,
  }
  if (role === "engineer") counts.communication = records.questions.filter((row) => !row.answer).length
  return counts
}

export type NextAction = { key: string; text: string; tone: "act" | "wait" | "info"; open: { kind: "defect" | "inspection" | "snag"; id: string } }

// The few things to do next on this pin, most urgent first: one line each, with what it opens.
export function pinNextActions(role: PanelRole, meId: string, records: PinRecordSet, today: string): NextAction[] {
  const out: NextAction[] = []
  const ncr = (row: DefectLink) => `${refNumber("ncr", row.number)} ${row.title}`
  if (role === "engineer") {
    for (const row of records.inspections.filter((item) => openInspection(item.status)))
      out.push({ key: `ir-${row.id}`, text: `${row.status === "requested" ? "Inspect" : "Finish inspecting"} ${refNumber("ir", row.number)} ${row.title}`, tone: "act", open: { kind: "inspection", id: row.id } })
    for (const row of records.defects.filter((item) => item.status === "for_verification"))
      out.push({ key: `verify-${row.id}`, text: `Verify the correction of ${ncr(row)}`, tone: "act", open: { kind: "defect", id: row.id } })
    for (const row of records.defects.filter((item) => (item.status === "open" || item.status === "in_progress") && !item.assigned_to))
      out.push({ key: `assign-${row.id}`, text: `Assign ${ncr(row)} to a Foreman`, tone: "act", open: { kind: "defect", id: row.id } })
    for (const row of records.snags.filter((item) => item.status === "submitted"))
      out.push({ key: `snag-${row.id}`, text: `Decide on client report ${refNumber("snag", row.number)} ${row.title}`, tone: "act", open: { kind: "snag", id: row.id } })
  } else if (role === "foreman") {
    for (const row of records.defects.filter((item) => (item.status === "open" || item.status === "in_progress") && item.assigned_to === meId))
      out.push({ key: `fix-${row.id}`, text: `Correct ${ncr(row)} (${dueText(row, today).toLowerCase()})`, tone: "act", open: { kind: "defect", id: row.id } })
    for (const row of records.defects.filter((item) => item.status === "for_verification" && item.assigned_to === meId))
      out.push({ key: `wait-${row.id}`, text: `${ncr(row)}: correction waiting for Engineer verification`, tone: "wait", open: { kind: "defect", id: row.id } })
    for (const row of records.inspections.filter((item) => openInspection(item.status)))
      out.push({ key: `ir-${row.id}`, text: `${refNumber("ir", row.number)} ${row.title}: waiting for the Engineer's inspection`, tone: "wait", open: { kind: "inspection", id: row.id } })
  } else if (role === "client") {
    for (const row of records.snags.filter((item) => item.status === "submitted" || item.status === "accepted"))
      out.push({ key: `snag-${row.id}`, text: `${refNumber("snag", row.number)} ${row.title}: ${row.status === "submitted" ? "waiting for the engineer" : row.fix_stage === "for_verification" ? "repair being checked" : "being fixed"}`, tone: "info", open: { kind: "snag", id: row.id } })
  }
  return out
}

// Search inside the selected project from the Ctrl+K palette: work items, defect reports, inspections and site logs.
// Row Level Security decides what a person may find (a client never gets defect reports or inspections), so the same code is safe
// for every role. Each hit opens the screen that role actually has for it (rules in projectSearchModel.ts).

import { supabase } from "./supabase"
import { canSearch, hitPath, searchPattern, type HitKind, type SearchHit, type SearchRole } from "./projectSearchModel"

export type { SearchHit, SearchRole } from "./projectSearchModel"

const refNumber = (prefix: string, number: number) => `${prefix}-${String(number).padStart(4, "0")}`
const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })

export async function searchProject(projectId: string, text: string, role: SearchRole): Promise<SearchHit[]> {
  if (!canSearch(text)) return []
  const pattern = searchPattern(text)
  const [pins, defects, inspections, logs] = await Promise.all([
    supabase.from("pins").select("id,title,status,category").eq("project_id", projectId).ilike("title", pattern).order("updated_at", { ascending: false }).limit(6),
    role === "client" ? Promise.resolve({ data: [] }) : supabase.from("qa_defects").select("id,number,title,status,severity").eq("project_id", projectId).ilike("title", pattern).order("number", { ascending: false }).limit(5),
    role === "engineer" ? supabase.from("qa_inspections").select("id,number,title,status").eq("project_id", projectId).ilike("title", pattern).order("number", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
    supabase.from("daily_reports").select("id,report_date,work_done,status").eq("project_id", projectId).eq("status", "submitted").ilike("work_done", pattern).order("report_date", { ascending: false }).limit(4),
  ])
  const hits: SearchHit[] = []
  const add = (kind: HitKind, id: string, title: string, sub: string) => {
    const path = hitPath(role, kind, id, projectId)
    if (path) hits.push({ key: `${kind}:${id}`, kind, id, title, sub, path })
  }
  for (const pin of (pins.data as Array<{ id: string; title: string; status: string; category: string }> | null) ?? []) add("pin", pin.id, pin.title, `${pin.category === "note" ? "Note" : pin.status.replace("_", " ")}`)
  for (const row of (defects.data as Array<{ id: string; number: number; title: string; status: string; severity: string }> | null) ?? []) add("defect", row.id, `${refNumber("NCR", row.number)} ${row.title}`, `${row.severity}, ${row.status.replace("_", " ")}`)
  for (const row of (inspections.data as Array<{ id: string; number: number; title: string; status: string }> | null) ?? []) add("inspection", row.id, `${refNumber("IR", row.number)} ${row.title}`, row.status.replace("_", " "))
  for (const row of (logs.data as Array<{ id: string; report_date: string; work_done: string }> | null) ?? []) add("log", row.id, row.work_done.length > 70 ? row.work_done.slice(0, 69).trimEnd() + "…" : row.work_done, `Daily report, ${day(row.report_date)}`)
  return hits
}

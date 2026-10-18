import { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabase"
import { fetchAll } from "./paging"
import { useLiveReload } from "./realtime"
import { qaBadge } from "./qaModel"
import type { Defect, Inspection } from "./qa"

// A light, cross-project view of QA work for badges and dashboards. Row Level Security limits it to the person's own projects, and
// clients get nothing (QA tables are staff-only). Refreshed on page change, on focus and every minute, like the pin counts.
export type QaLiteDefect = Pick<Defect, "id" | "project_id" | "number" | "title" | "severity" | "status" | "due_date" | "assigned_to">
export type QaLiteInspection = Pick<Inspection, "id" | "project_id" | "number" | "title" | "status" | "pin_id" | "score" | "completed_at">

export function useQaLite(refreshKey = "") {
  const [inspections, setInspections] = useState<QaLiteInspection[]>([])
  const [defects, setDefects] = useState<QaLiteDefect[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useLiveReload([{ table: "qa_inspections" }, { table: "qa_defects" }], () => setTick((value) => value + 1))
  useEffect(() => {
    let active = true
    const load = async () => {
      const [ir, ncr] = await Promise.all([
        fetchAll<QaLiteInspection>((from, to) => supabase.from("qa_inspections").select("id,project_id,number,title,status,pin_id,score,completed_at").in("status", ["requested", "in_progress"]).order("id").range(from, to)),
        fetchAll<QaLiteDefect>((from, to) => supabase.from("qa_defects").select("id,project_id,number,title,severity,status,due_date,assigned_to").neq("status", "closed").order("id").range(from, to)),
      ])
      if (!active) return
      setInspections(ir.data)
      setDefects(ncr.data)
      setLoading(false)
    }
    void load()
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), 60_000)
    window.addEventListener("focus", load)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener("focus", load)
    }
  }, [refreshKey, tick])
  return { inspections, defects, loading }
}

// Sidebar badge (see qaBadge for what it counts). With a project, only that project's inspections and NCRs count.
export function useQaBadge(role: "engineer" | "foreman", userId: string | null, refreshKey: string, projectId: string | null = null) {
  const { inspections, defects } = useQaLite(refreshKey)
  return useMemo(() => {
    const mine = <T extends { project_id: string }>(rows: T[]) => (projectId ? rows.filter((row) => row.project_id === projectId) : rows)
    return qaBadge(role, userId, mine(inspections), mine(defects))
  }, [role, userId, inspections, defects, projectId])
}

// Quality record of one pin (inspections and defects linked to it), for the verification queue.
export type PinQuality = { inspections: Array<Pick<Inspection, "id" | "number" | "title" | "status" | "score" | "completed_at" | "requested_at">>; defects: Array<Pick<Defect, "id" | "number" | "title" | "severity" | "status">> }

export function usePinQuality(pinId: string) {
  const [data, setData] = useState<PinQuality | null>(null)
  const [tick, setTick] = useState(0)
  useLiveReload([{ table: "qa_inspections", filter: `pin_id=eq.${pinId}` }, { table: "qa_defects", filter: `pin_id=eq.${pinId}` }], () => setTick(value => value + 1))
  useEffect(() => {
    let active = true
    setData(null)
    Promise.all([
      supabase.from("qa_inspections").select("id,number,title,status,score,completed_at,requested_at").eq("pin_id", pinId).neq("status", "cancelled").order("number", { ascending: false }),
      supabase.from("qa_defects").select("id,number,title,severity,status").eq("pin_id", pinId).order("number", { ascending: false }),
    ]).then(([ir, ncr]) => {
      if (active) setData(ir.error || ncr.error ? null : { inspections: (ir.data as PinQuality["inspections"] | null) ?? [], defects: (ncr.data as PinQuality["defects"] | null) ?? [] })
    })
    return () => {
      active = false
    }
  }, [pinId, tick])
  return data
}

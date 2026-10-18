import { useCallback, useEffect, useRef, useState } from "react"
import type { Pin } from "./blueprints"
import type { QaLiteDefect, QaLiteInspection } from "./qaLite"
import { fetchAll } from "./paging"
import { manilaDayRange } from "./foremanDashboardModel"
import { useLiveReload, type LiveTable } from "./realtime"
import { supabase } from "./supabase"

type Data = { pins: Pin[]; sentBack: Set<string>; reports: string[]; checklistLeft: number; photosToday: number; inspections: QaLiteInspection[]; defects: QaLiteDefect[] }
const empty = (): Data => ({ pins: [], sentBack: new Set(), reports: [], checklistLeft: 0, photosToday: 0, inspections: [], defects: [] })
const tables: LiveTable[] = ["pins", "pin_events", "pin_checklist_items", "qa_defects", "qa_inspections", "daily_reports", "pin_photos", "daily_report_photos"]

export function useForemanDashboard(me: string | null, projectId: string | null, today: string) {
  const [data, setData] = useState<Data>(empty)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const generation = useRef(0)
  const load = useCallback(async () => {
    const run = ++generation.current
    if (!me) { setData(empty()); setLoading(false); return }
    try {
      const pins = await fetchAll<Pin>((from, to) => {
        let q = supabase.from("pins").select("*").eq("assigned_to", me).neq("category", "note")
        if (projectId) q = q.eq("project_id", projectId)
        return q.order("id").range(from, to)
      })
      if (pins.error) throw new Error("pins")
      const { start, end } = manilaDayRange(today)
      const countPhotos = async (table: "pin_photos" | "daily_report_photos") => {
        let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("uploaded_by", me).gte("created_at", start).lt("created_at", end)
        if (projectId) q = q.eq("project_id", projectId)
        const r = await q
        if (r.error || r.count === null) throw new Error("photos")
        return r.count
      }
      const [reports, defects, requested, pinPhotos, dailyPhotos] = await Promise.all([
        fetchAll<{ status: string }>((from, to) => {
          let q = supabase.from("daily_reports").select("id,status").eq("author_id", me).eq("report_date", today)
          if (projectId) q = q.eq("project_id", projectId)
          return q.order("id").range(from, to)
        }),
        fetchAll<QaLiteDefect>((from, to) => {
          let q = supabase.from("qa_defects").select("*").eq("assigned_to", me).neq("status", "closed")
          if (projectId) q = q.eq("project_id", projectId)
          return q.order("id").range(from, to)
        }),
        fetchAll<QaLiteInspection>((from, to) => {
          let q = supabase.from("qa_inspections").select("*").eq("requested_by", me).in("status", ["requested", "in_progress"])
          if (projectId) q = q.eq("project_id", projectId)
          return q.order("id").range(from, to)
        }), countPhotos("pin_photos"), countPhotos("daily_report_photos"),
      ])
      if (reports.error || defects.error || requested.error) throw new Error("summary")
      const sentBack = new Set<string>()
      const inspections = new Map(requested.data.map((row) => [row.id, row]))
      let checklistLeft = 0
      // Bound IN lists so a large project cannot overflow the REST URL limit.
      for (let offset = 0; offset < pins.data.length; offset += 100) {
        const ids = pins.data.slice(offset, offset + 100).map((pin) => pin.id)
        const [events, checklist, ir] = await Promise.all([
          fetchAll<{ pin_id: string }>((from, to) => supabase.from("pin_events").select("pin_id").in("pin_id", ids).eq("kind", "comment").or("note.ilike.Sent back:%,note.ilike.%: returned.%").order("id").range(from, to)),
          supabase.from("pin_checklist_items").select("id", { count: "exact", head: true }).in("pin_id", ids).eq("done", false),
          fetchAll<QaLiteInspection>((from, to) => supabase.from("qa_inspections").select("*").in("pin_id", ids).in("status", ["requested", "in_progress"]).order("id").range(from, to)),
        ])
        if (events.error || checklist.error || checklist.count === null || ir.error) throw new Error("pin details")
        events.data.forEach((row) => sentBack.add(row.pin_id))
        ir.data.forEach((row) => inspections.set(row.id, row))
        checklistLeft += checklist.count
      }
      if (run !== generation.current) return
      setData({ pins: pins.data.map((pin) => ({ ...pin, x: Number(pin.x), y: Number(pin.y) })), sentBack,
        reports: reports.data.map((row) => row.status), checklistLeft, photosToday: pinPhotos + dailyPhotos,
        inspections: [...inspections.values()], defects: defects.data })
      setFailed(false)
    } catch {
      if (run !== generation.current) return
      // Keep the last loaded work so offline queued updates can still display "Waiting to send".
      // A scope change clears data in the effect below; never keep another user's/project's snapshot.
      setFailed(true)
    }
    if (run === generation.current) setLoading(false)
  }, [me, projectId, today])
  useEffect(() => {
    setData(empty()); setLoading(true); void load()
    return () => { generation.current++ }
  }, [load])
  useLiveReload(me ? tables.map((table) => ({ table, ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}) })) : [], () => void load())
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load() }
    window.addEventListener("focus", refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer) }
  }, [load])
  return { ...data, loading, failed, load }
}

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import { manilaDayRange } from "./foremanDashboardModel"
import {
  emptyAttendanceSummary,
  type AttendanceEvent,
  type AttendanceSummary,
} from "./attendanceModel"

let sequence = 0
export function useAttendance(project: string | null, day: string) {
  const key = `${project}:${day}`
  const [state, setState] = useState({
    key: "",
    events: [] as AttendanceEvent[],
    summary: emptyAttendanceSummary,
    error: "",
    loading: true,
    updated: null as Date | null,
  })
  const [connection, setConnection] = useState("Connecting to live updates")
  const request = useRef(0)
  const reload = useCallback(async () => {
    const id = ++request.current
    if (!project) return
    try {
      const { start, end } = manilaDayRange(day)
      const [events, summary] = await Promise.all([
        supabase
          .from("biometric_attendance_events")
          .select("*,worker:attendance_workers(*)")
          .eq("project_id", project)
          .gte("occurred_at", start)
          .lt("occurred_at", end)
          .order("occurred_at", { ascending: false })
          .order("received_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(50),
        supabase.rpc("attendance_day_summary", {
          p_project: project,
          p_day: day,
        }),
      ])
      if (id !== request.current) return
      if (events.error || summary.error)
        throw new Error(
          "Attendance could not be loaded. Check your connection or project access, then retry.",
        )
      setState({
        key,
        events: (events.data ?? []) as AttendanceEvent[],
        summary: summary.data as AttendanceSummary,
        error: "",
        loading: false,
        updated: new Date(),
      })
    } catch (error) {
      if (id !== request.current) return
      setState({
        key,
        events: [],
        summary: emptyAttendanceSummary,
        error:
          error instanceof Error ? error.message : "Attendance is unavailable.",
        loading: false,
        updated: null,
      })
    }
  }, [project, day, key])
  useEffect(() => {
    void reload()
    if (!project) return
    setConnection("Connecting to live updates")
    let listening = true
    let timeout: number | undefined
    const refresh = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => void reload(), 200)
    }
    const channel = supabase
      .channel(`attendance-${++sequence}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "biometric_attendance_events",
          filter: `project_id=eq.${project}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_workers",
          filter: `project_id=eq.${project}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (!listening) return
        setConnection(
          status === "SUBSCRIBED"
            ? "Live database updates"
            : "Live updates reconnecting · refreshes every 15s",
        )
        if (status === "SUBSCRIBED") refresh()
      })
    const interval = window.setInterval(() => void reload(), 15000)
    const onVisible = () => {
      if (!document.hidden) void reload()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", refresh)
    return () => {
      listening = false
      request.current++
      window.clearTimeout(timeout)
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", refresh)
      void supabase.removeChannel(channel)
    }
  }, [project, reload])
  const current = state.key === key
  return {
    events: current ? state.events : [],
    summary: current ? state.summary : emptyAttendanceSummary,
    loading: Boolean(project) && (!current || state.loading),
    error: current ? state.error : "",
    updated: current ? state.updated : null,
    connection,
    reload,
  }
}

export function useWorkerPhoto(path: string | null) {
  const [photo, setPhoto] = useState({ path: "", url: "" })
  useEffect(() => {
    if (!path) return
    let active = true
    const sign = async () => {
      try {
        const { data } = await supabase.storage
          .from("worker-photos")
          .createSignedUrl(path, 600)
        if (active) setPhoto({ path, url: data?.signedUrl ?? "" })
      } catch {
        if (active) setPhoto({ path, url: "" })
      }
    }
    void sign()
    const timer = window.setInterval(() => void sign(), 480000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [path])
  return photo.path === path ? photo.url : ""
}

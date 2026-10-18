import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import { useLiveReload } from "./realtime"

// Live counts for sidebar badges (what the database says, never fixed numbers). Row Level Security limits them to the
// signed-in person's projects. Refreshed live when a pin changes, when the page changes, on focus and every minute.
// With a project, only that project is counted (Engineer project workspaces).
export function usePinCounts(refreshKey: string, projectId: string | null = null) {
  const [counts, setCounts] = useState({ review: 0, issue: 0 })
  const [tick, setTick] = useState(0)
  useLiveReload([{ table: "pins" }], () => setTick((value) => value + 1))
  useEffect(() => {
    let active = true
    const load = async () => {
      const count = (status: "for_review" | "issue") => {
        const query = supabase.from("pins").select("id", { count: "exact", head: true }).eq("status", status).neq("category", "note")
        return projectId ? query.eq("project_id", projectId) : query
      }
      const [review, issue] = await Promise.all([count("for_review"), count("issue")])
      if (active) setCounts({ review: review.count ?? 0, issue: issue.count ?? 0 })
    }
    void load()
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), 60_000)
    window.addEventListener("focus", load)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener("focus", load)
    }
  }, [refreshKey, tick, projectId])
  return counts
}

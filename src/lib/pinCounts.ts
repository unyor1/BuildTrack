import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import { useLiveReload } from "./realtime"

// Live counts for sidebar badges (what the database says, never fixed numbers). Row Level Security limits them to the
// signed-in person's projects. Refreshed live when a pin changes, when the page changes, on focus and every minute.
export function usePinCounts(refreshKey: string) {
  const [counts, setCounts] = useState({ review: 0, issue: 0 })
  const [tick, setTick] = useState(0)
  useLiveReload([{ table: "pins" }], () => setTick((value) => value + 1))
  useEffect(() => {
    let active = true
    const load = async () => {
      const [review, issue] = await Promise.all([
        supabase.from("pins").select("id", { count: "exact", head: true }).eq("status", "for_review").neq("category", "note"),
        supabase.from("pins").select("id", { count: "exact", head: true }).eq("status", "issue").neq("category", "note"),
      ])
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
  }, [refreshKey, tick])
  return counts
}

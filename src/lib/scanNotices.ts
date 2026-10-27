import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"
import { pendingNotices, type IgnoredScanRow, type RecordedScanRow, type ScanNotice, type UnregisteredScanRow } from "./scanNoticeModel"

let sequence = 0
const worker = "worker:attendance_workers(full_name,worker_code,photo_path)"

// Live scan messages for one project: only scans received after the screen opened (a few seconds of slack), each
// shown once. Queue every message; a new scan must not replace the one a worker is still reading.
// Realtime prompts a read, with polling and paginated catch-up when updates drop.
export function useScanNotices(projectId: string | null) {
  const [state, setState] = useState<{ projectId: string | null; queue: ScanNotice[] }>({ projectId: null, queue: [] })

  useEffect(() => {
    setState({ projectId, queue: [] })
    if (!projectId) return
    let active = true, inFlight = false
    const since = Date.now() - 5000
    const seen = new Set<string>() // Includes queued notices, not just the visible one.
    const cursors = new Map<string, string>()

    async function read(table: string, columns: string) {
      const after = cursors.get(table) ?? new Date(since).toISOString()
      const rows: Array<{ id: string; received_at: string }> = []
      try {
        for (let offset = 0; active; offset += 100) {
          const { data, error } = await supabase.from(table).select(columns)
            .eq("project_id", projectId).gte("received_at", after)
            .order("received_at", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 99)
          if (!active || error) return [] // Do not advance a failed table's cursor; retry next time.
          const page = (data ?? []) as unknown as typeof rows
          rows.push(...page)
          if (page.length < 100) break
        }
        // Keep an overlap for rows committing near the last read; queued IDs prevent repeats.
        if (rows.length && active) cursors.set(table, new Date(Math.max(since, Date.parse(rows[rows.length - 1].received_at) - 5000)).toISOString())
        return rows
      } catch {
        return [] // One unavailable table must not hide the other scan types.
      }
    }

    async function check() {
      if (!active || inFlight) return
      inFlight = true
      try {
        const [recorded, ignored, unregistered] = await Promise.all([
          read("biometric_attendance_events", `id,direction,occurred_at,received_at,schedule_flag,minutes_off,${worker}`),
          read("attendance_ignored_scans", `id,reason,occurred_at,received_at,${worker},kept:biometric_attendance_events(direction,occurred_at)`),
          read("attendance_unregistered_scans", `id,reason,sensor_slot,occurred_at,received_at,${worker}`),
        ])
        if (!active) return
        const fresh = pendingNotices({
          recorded: recorded as RecordedScanRow[], ignored: ignored as IgnoredScanRow[], unregistered: unregistered as UnregisteredScanRow[],
        }, since, seen)
        if (!fresh.length) return
        fresh.forEach((notice) => seen.add(notice.key))
        setState((old) => old.projectId === projectId ? { projectId, queue: [...old.queue, ...fresh] } : old)
      } finally {
        inFlight = false
      }
    }

    let timeout: number | undefined
    const soon = () => {
      window.clearTimeout(timeout)
      timeout = window.setTimeout(() => void check(), 150)
    }
    const filter = `project_id=eq.${projectId}`
    const channel = supabase.channel(`scan-notices-${++sequence}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "biometric_attendance_events", filter }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_ignored_scans", filter }, soon)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance_unregistered_scans", filter }, soon)
      .subscribe()
    const interval = window.setInterval(() => void check(), 3000)
    void check()
    return () => {
      active = false
      window.clearTimeout(timeout)
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [projectId])

  // Hide another project's messages immediately, even before its effect cleanup runs.
  const current = state.projectId === projectId ? state.queue[0] ?? null : null
  const dismiss = useCallback(() => {
    setState((old) => old.projectId === projectId && old.queue[0]?.key === current?.key
      ? { projectId, queue: old.queue.slice(1) } : old)
  }, [projectId, current?.key])
  return { current, dismiss }
}

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import { fetchAll, ROW_CAP } from "./paging"
import { byProject, useLiveReload, usePeriodicReload } from "./realtime"
import type { OverviewItemResult } from "./qaOverviewModel"

// Only loaded while a filtered Overview is open. Never infer failed checks from NCR counts: one is not the other.
export function useQaOverviewItems(projectId: string | null) {
  const [state, setState] = useState<{ projectId: string | null; items: OverviewItemResult[]; error: string; loading: boolean }>({ projectId: null, items: [], error: "", loading: false })
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const request = ++sequence.current
    if (!projectId) return
    try {
      const result = await fetchAll<OverviewItemResult>((from, to) => supabase.from("qa_inspection_items").select("inspection_id,result").eq("project_id", projectId).order("id").range(from, to))
      if (request !== sequence.current) return
      const error = result.error ? "Could not load the filtered quality summary. Check your connection and retry." : result.data.length >= ROW_CAP ? "This project exceeds the filtered summary's record limit. No partial totals are shown." : ""
      setState({ projectId, items: error ? [] : result.data, error, loading: false })
    } catch {
      if (request === sequence.current) setState({ projectId, items: [], error: "Could not load the filtered quality summary. Check your connection and retry.", loading: false })
    }
  }, [projectId])
  useEffect(() => {
    setState({ projectId, items: [], error: "", loading: Boolean(projectId) })
    void reload()
    return () => { sequence.current++ }
  }, [projectId, reload])
  useLiveReload([...byProject("qa_inspection_items", projectId), ...byProject("qa_inspections", projectId)], reload)
  usePeriodicReload(projectId, reload)
  // Mask the previous project's data immediately, including the render before effect cleanup.
  return { items: state.projectId === projectId ? state.items : [], error: state.projectId === projectId ? state.error : "", loading: Boolean(projectId) && (state.projectId !== projectId || state.loading), reload }
}

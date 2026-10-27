import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import { byColumn, useLiveReload } from "./realtime"
import type { InspectionItem } from "./qa"

export type PriorQaCheck = InspectionItem & { source_number: number }

// The server returns frozen prior criteria only to authorized project staff. Mask old answers while switching inspections.
export function useReinspectionContext(inspectionId: string | null) {
  const [state, setState] = useState<{ id: string | null; rows: PriorQaCheck[]; loading: boolean; error: string }>({ id: null, rows: [], loading: Boolean(inspectionId), error: "" })
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const run = ++sequence.current
    if (!inspectionId) { setState({ id: null, rows: [], loading: false, error: "" }); return }
    try {
      const { data, error } = await supabase.rpc("qa_reinspection_context", { p_inspection: inspectionId })
      if (run !== sequence.current) return
      setState({ id: inspectionId, rows: error ? [] : (data as PriorQaCheck[] ?? []), loading: false, error: error ? "Could not load reinspection scope. Retry before inspecting." : "" })
    } catch {
      if (run === sequence.current) setState({ id: inspectionId, rows: [], loading: false, error: "Could not load reinspection scope. Retry before inspecting." })
    }
  }, [inspectionId])
  useEffect(() => { setState({ id: inspectionId, rows: [], loading: Boolean(inspectionId), error: "" }); void reload(); return () => { sequence.current++ } }, [inspectionId, reload])
  useLiveReload(byColumn("qa_inspection_items", "inspection_id", inspectionId), () => void reload())
  return { ...(state.id === inspectionId ? state : { id: inspectionId, rows: [], loading: Boolean(inspectionId), error: "" }), reload }
}

export function useCorrectionInspection(defectId: string, attemptId: string | null) {
  type State = { key: string | null; id: string | null; status: string | null; number: number | null; ready: boolean; loading: boolean; error: string }
  const key = attemptId ? `${defectId}:${attemptId}` : null
  const [state, setState] = useState<State>({ key: null, id: null, status: null, number: null, ready: false, loading: Boolean(key), error: "" })
  const sequence = useRef(0)
  const reload = useCallback(async () => {
    const run = ++sequence.current
    const empty = { key, id: null, status: null, number: null, ready: false, loading: false, error: "" }
    if (!key) { setState(empty); return }
    try {
      const result = await supabase.rpc("qa_ncr_reinspection_state", { p_defect: defectId })
      if (result.error || !result.data) throw new Error("Could not load the linked reinspection.")
      if (run === sequence.current) setState({ ...empty, ...(result.data as Pick<State, "id" | "status" | "number" | "ready">) })
    } catch { if (run === sequence.current) setState({ ...empty, error: "Could not load the linked reinspection." }) }
  }, [key, defectId])
  useEffect(() => { setState({ key, id: null, status: null, number: null, ready: false, loading: Boolean(key), error: "" }); void reload(); return () => { sequence.current++ } }, [key, reload])
  useLiveReload([...byColumn("qa_work_attempts", "id", attemptId), ...byColumn("qa_inspections", "id", state.key === key ? state.id : null)], () => void reload())
  return { ...(state.key === key ? state : { key, id: null, status: null, number: null, ready: false, loading: Boolean(key), error: "" }), reload }
}

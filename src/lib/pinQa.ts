import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import { byColumn, useLiveReload } from "./realtime"
import type { PinStatus } from "./blueprints"

export function usePinQa(pinId: string) {
  const [state, setState] = useState<{ status: PinStatus; templateId: string | null; approved: boolean; open: boolean; awaitingVerification: boolean; problem: string | null; submissionProblem: string | null } | null>(null)
  const [error, setError] = useState("")
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const request = ++generation.current
    if (!pinId) { setState(null); setError(""); return }
    const [pin, open, gate, items, approval, submission] = await Promise.all([
      supabase.from("pins").select("status,qa_template_id,qa_approved_by").eq("id", pinId).single(),
      supabase.from("qa_inspections").select("id").eq("pin_id", pinId).in("status", ["requested", "in_progress"]).limit(1),
      supabase.rpc("pin_qa_verification_problem", { p_pin: pinId }),
      supabase.from("pin_checklist_items").select("id").eq("pin_id", pinId).eq("review_status", "for_review").limit(1),
      supabase.rpc("pin_qa_template_approved", { p_pin: pinId }),
      supabase.rpc("pin_qa_submission_problem", { p_pin: pinId }),
    ])
    if (request !== generation.current) return
    const problem = pin.error || open.error || gate.error || items.error || approval.error || submission.error
    setError(problem?.message ?? "")
    if (!problem && pin.data) setState({ status: pin.data.status, templateId: pin.data.qa_template_id, approved: Boolean(approval.data), open: Boolean(open.data?.length), awaitingVerification: Boolean(items.data?.length), problem: gate.data, submissionProblem: submission.data })
    else setState(null)
  }, [pinId])
  useEffect(() => { setState(null); void reload(); return () => { generation.current++ } }, [reload])
  useLiveReload([
    ...byColumn("pins", "id", pinId), ...byColumn("qa_inspections", "pin_id", pinId),
    ...byColumn("qa_defects", "pin_id", pinId), ...byColumn("pin_checklist_items", "pin_id", pinId),
    ...byColumn("pin_photos", "pin_id", pinId),
  ], () => void reload())
  const preflight = useCallback(async (itemId?: string) => {
    const { data, error } = itemId
      ? await supabase.rpc("checklist_qa_submission_problem", { p_item: itemId })
      : await supabase.rpc("pin_qa_submission_problem", { p_pin: pinId })
    if (error) throw new Error(error.message)
    await reload()
    return data as string | null
  }, [pinId,reload])
  return { state, error, reload, preflight }
}

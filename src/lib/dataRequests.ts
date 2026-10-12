import { useCallback, useEffect, useState } from "react"
import { supabase } from "./supabase"

export type DataRequest = {
  id: string
  user_id: string
  kind: "erase"
  status: "open" | "done" | "declined" | "withdrawn"
  reason: string | null
  created_at: string
  decided_at: string | null
  decision_note: string | null
}

// The signed-in person's own requests (RLS also lets reviewing admins read everyone's; the filter keeps this to "mine").
export function useMyDataRequests(userId: string | undefined) {
  const [rows, setRows] = useState<DataRequest[] | null>(null)
  const reload = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase.from("data_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(5)
    setRows((data as DataRequest[] | null) ?? [])
  }, [userId])
  useEffect(() => {
    void reload()
  }, [reload])
  return { rows, reload }
}

export async function requestErasure(reason: string): Promise<string | null> {
  const { error } = await supabase.rpc("request_data_erasure", { p_reason: reason.trim() || null })
  return error?.message ?? null
}

export async function withdrawErasure(id: string): Promise<string | null> {
  const { error } = await supabase.rpc("withdraw_data_request", { p_id: id })
  return error?.message ?? null
}

export async function declineErasure(id: string, note: string): Promise<string | null> {
  const { error } = await supabase.rpc("decline_data_request", { p_id: id, p_note: note })
  return error?.message ?? null
}

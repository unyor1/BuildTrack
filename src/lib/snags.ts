import { useCallback, useEffect, useState } from "react"
import { prepareImage } from "./sheetImages"
import { supabase } from "./supabase"
import { fetchAll } from "./paging"
import { byProject, useLiveReload } from "./realtime"
import type { DefectCategory, QaSeverity, SnagStatus, Trade, Urgency } from "./qaModel"

// Client reports ("snags"): the database decides who sees what (a client sees only their own, staff of the project see all).
export type Snag = {
  id: string
  project_id: string
  number: number
  author_id: string
  title: string
  description: string | null
  location: string | null
  urgency: Urgency
  status: SnagStatus
  response: string | null
  decided_by: string | null
  decided_at: string | null
  defect_id: string | null
  fix_stage: "open" | "in_progress" | "for_verification" | "closed" | null
  resolved_at: string | null
  created_at: string
}
export type SnagPhoto = { id: string; snag_id: string; project_id: string; path: string; created_at: string }

export function useSnags(projectId: string | null) {
  const [snags, setSnags] = useState<Snag[]>([])
  const [loading, setLoading] = useState(Boolean(projectId))
  const [error, setError] = useState("")
  const reload = useCallback(async () => {
    if (!projectId) {
      setSnags([])
      setLoading(false)
      return
    }
    const { data, error: loadError } = await fetchAll<Snag>((from, to) => supabase.from("client_snags").select("*").eq("project_id", projectId).order("number", { ascending: false }).range(from, to))
    setError(loadError ? "Could not load the reports. Check your connection and try again." : "")
    if (!loadError) setSnags(data)
    setLoading(false)
  }, [projectId])
  useEffect(() => {
    setLoading(Boolean(projectId))
    void reload()
  }, [reload, projectId])
  useLiveReload(byProject("client_snags", projectId), reload)
  return { snags, loading, error, reload }
}

export function useSnagPhotos(snagId: string | null) {
  const [photos, setPhotos] = useState<SnagPhoto[]>([])
  const reload = useCallback(async () => {
    if (!snagId) return setPhotos([])
    const { data } = await supabase.from("snag_photos").select("*").eq("snag_id", snagId).order("created_at")
    setPhotos((data as SnagPhoto[] | null) ?? [])
  }, [snagId])
  useEffect(() => {
    void reload()
  }, [reload])
  return { photos, reload }
}

// Shrinks the picture in the browser, stores it under <project>/<report>/ in the private `snag-photos` bucket and records it.
// The database refuses it unless the report is the caller's own and still waiting; the stored file is then removed again.
export async function uploadSnagPhoto(projectId: string, snagId: string, file: File): Promise<void> {
  const image = await prepareImage(file)
  const path = `${projectId}/${snagId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${image.ext}`
  const stored = await supabase.storage.from("snag-photos").upload(path, image.blob, { contentType: image.blob.type, upsert: false })
  if (stored.error) throw new Error(/row-level security|not allowed|403/i.test(stored.error.message) ? "This photo could not be added to the report." : stored.error.message)
  const { error } = await supabase.from("snag_photos").insert({ snag_id: snagId, project_id: projectId, path })
  if (error) {
    await supabase.storage.from("snag-photos").remove([path])
    throw new Error(error.message)
  }
}

type Result<T = void> = { ok: true; data: T } | { ok: false; message: string }
async function call<T = void>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.rpc(name, args)
  return error ? { ok: false, message: error.message } : { ok: true, data: data as T }
}

export const snagActions = {
  submit: (input: { projectId: string; title: string; description: string; location: string; urgency: Urgency }) =>
    call<string>("submit_snag", { p_project: input.projectId, p_title: input.title, p_description: input.description || null, p_location: input.location || null, p_urgency: input.urgency }),
  withdraw: (id: string) => call("withdraw_snag", { p_id: id }),
  accept: (input: { id: string; note: string; severity: QaSeverity; category: DefectCategory; trade: Trade; assignedTo: string | null; due: string | null; reference: string }) =>
    call<string>("decide_snag", { p_id: input.id, p_accept: true, p_note: input.note || null, p_severity: input.severity, p_category: input.category, p_trade: input.trade, p_assigned_to: input.assignedTo, p_due: input.due, p_reference: input.reference || null }),
  decline: (id: string, note: string) => call<string | null>("decide_snag", { p_id: id, p_accept: false, p_note: note }),
}

import { useCallback, useEffect, useRef, useState } from "react"
import { issuePhotoProblem, markupProblem, type IssueMarkup } from "./issueMarkup"
import { supabase } from "./supabase"
import { fetchAll } from "./paging"
import { byColumn, byProject, useLiveReload, usePeriodicReload } from "./realtime"
import type { DefectCategory, QaSeverity, SnagStatus, Trade, Urgency } from "./qaModel"

// Client reports ("snags"): the database decides who sees what (a client sees only their own, staff of the project see all).
export type Snag = {
  id: string
  project_id: string
  pin_id?: string | null
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
export type SnagPhoto = { id: string; snag_id: string; project_id: string; path: string; created_at: string; caption?: string; annotations?: IssueMarkup[] }

export function useSnags(projectId: string | null) {
  const sequence = useRef(0)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [snags, setSnags] = useState<Snag[]>([])
  const [loading, setLoading] = useState(Boolean(projectId))
  const [error, setError] = useState("")
  const reload = useCallback(async () => {
    const run = ++sequence.current
    if (!projectId) {
      setSnags([])
      setLoading(false)
      setLoadedFor(null); setError("")
      return
    }
    const { data, error: loadError } = await fetchAll<Snag>((from, to) => supabase.from("client_snags").select("*").eq("project_id", projectId).order("number", { ascending: false }).range(from, to)).catch(() => ({ data: [] as Snag[], error: true }))
    if (run !== sequence.current) return
    setError(loadError ? "Could not load the reports. Check your connection and try again." : "")
    setSnags(loadError ? [] : data)
    setLoadedFor(projectId)
    setLoading(false)
  }, [projectId])
  useEffect(() => {
    setLoading(Boolean(projectId))
    void reload()
    return () => { sequence.current++ }
  }, [reload, projectId])
  useLiveReload(byProject("client_snags", projectId), reload)
  usePeriodicReload(projectId ? `snags:${projectId}` : null, () => void reload())
  return { snags: loadedFor === projectId ? snags : [], loading: loading || loadedFor !== projectId, error: loadedFor === projectId ? error : "", reload }
}

export function useSnagPhotos(snagId: string | null) {
  const sequence = useRef(0)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [photos, setPhotos] = useState<SnagPhoto[]>([])
  const reload = useCallback(async () => {
    const run = ++sequence.current
    if (!snagId) { setPhotos([]); setError(""); setLoadedFor(null); return }
    const { data, error } = await supabase.from("snag_photos").select("*").eq("snag_id", snagId).order("created_at").then(result => result, () => ({ data: null, error: true }))
    if (run !== sequence.current) return
    setError(error ? "Could not load report photos." : "")
    setLoadedFor(snagId)
    setPhotos((data as SnagPhoto[] | null) ?? [])
  }, [snagId])
  useEffect(() => {
    setPhotos([]); setError("")
    void reload()
    return () => { sequence.current++ }
  }, [reload])
  useLiveReload(byColumn("snag_photos", "snag_id", snagId), reload)
  usePeriodicReload(snagId ? `snag-photos:${snagId}` : null, () => void reload())
  return { photos: loadedFor === snagId ? photos : [], error: loadedFor === snagId ? error : "", reload }
}

// Stores original photo bytes under <project>/<report>/ in the private `snag-photos` bucket, with a separate markup overlay.
// The database refuses it unless the report is the caller's own and still waiting; the stored file is then removed again.
export async function uploadSnagPhoto(projectId: string, snagId: string, file: File, annotations: IssueMarkup[] = [], caption = ""): Promise<void> {
  const problem = issuePhotoProblem(file) || markupProblem(annotations)
  if (problem) throw new Error(problem)
  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp"
  const path = `${projectId}/${snagId}/${crypto.randomUUID()}.${ext}`
  const stored = await supabase.storage.from("snag-photos").upload(path, file, { contentType: file.type, upsert: false })
  if (stored.error) throw new Error(/row-level security|not allowed|403/i.test(stored.error.message) ? "This photo could not be added to the report." : stored.error.message)
  const { error } = await supabase.from("snag_photos").insert({ snag_id: snagId, project_id: projectId, path, caption, annotations })
  if (error) {
    await supabase.storage.from("snag-photos").remove([path])
    throw new Error(error.message)
  }
}

type Result<T = void> = { ok: true; data: T } | { ok: false; message: string }
async function call<T = void>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.rpc(name, args)
    return error ? { ok: false, message: error.message } : { ok: true, data: data as T }
  } catch { return { ok: false, message: "Connection interrupted. Check your reports before trying again." } }
}

export const snagActions = {
  submit: (input: { projectId: string; title: string; description: string; location: string; urgency: Urgency; pinId?: string | null }) =>
    call<string>("submit_linked_snag", { p_project: input.projectId, p_title: input.title, p_description: input.description || null, p_location: input.location || null, p_urgency: input.urgency, p_pin: input.pinId || null }),
  withdraw: (id: string) => call("withdraw_snag", { p_id: id }),
  accept: (input: { id: string; note: string; severity: QaSeverity; category: DefectCategory; trade: Trade; assignedTo: string | null; due: string | null; reference: string }) =>
    call<string>("decide_snag", { p_id: input.id, p_accept: true, p_note: input.note || null, p_severity: input.severity, p_category: input.category, p_trade: input.trade, p_assigned_to: input.assignedTo, p_due: input.due, p_reference: input.reference || null }),
  decline: (id: string, note: string) => call<string | null>("decide_snag", { p_id: id, p_accept: false, p_note: note }),
}

import { useCallback, useEffect, useState } from "react"
import { prepareImage } from "./sheetImages"
import { supabase } from "./supabase"
import type { IdType } from "./identityModel"

export * from "./identityModel"

export type Verification = {
  id: string
  user_id: string
  status: "submitted" | "approved" | "rejected" | "withdrawn"
  legal_name: string
  birth_date: string
  address: string
  phone: string
  id_type: IdType
  id_last4: string
  id_expiry: string | null
  front_path: string
  back_path: string | null
  selfie_path: string
  consent_version: string
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  decision_note: string | null
  docs_deleted_at: string | null
}

// The signed-in person's own submissions, newest first.
export function useMyVerifications(userId: string | null) {
  const [items, setItems] = useState<Verification[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const reload = useCallback(async () => {
    if (!userId) return setLoading(false)
    const { data } = await supabase.from("identity_verifications").select("*").eq("user_id", userId).order("submitted_at", { ascending: false })
    setItems((data as Verification[] | null) ?? [])
    setLoading(false)
  }, [userId])
  useEffect(() => {
    void reload()
  }, [reload])
  return { items, loading, reload }
}

// Shrinks the picture in the browser (an ID photo from a phone can be 12 MB) and stores it in the person's own folder of the private
// `identity-docs` bucket. Returns the storage path. Nothing is public: only the owner and reviewing admins can read it.
export async function uploadIdentityPhoto(userId: string, kind: "front" | "back" | "selfie", file: File): Promise<string> {
  const image = await prepareImage(file)
  const path = `${userId}/pending/${kind}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${image.ext}`
  const { error } = await supabase.storage.from("identity-docs").upload(path, image.blob, { contentType: image.blob.type, upsert: false })
  if (error) throw new Error(/row-level security|not allowed|403/i.test(error.message) ? "The photo could not be saved. Please try again." : error.message)
  return path
}

export async function removeIdentityPhotos(paths: Array<string | null>): Promise<void> {
  const list = paths.filter((path): path is string => Boolean(path))
  if (list.length) await supabase.storage.from("identity-docs").remove(list)
}

type Result<T = void> = { ok: true; data: T } | { ok: false; message: string }
async function call<T = void>(name: string, args: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.rpc(name, args)
  return error ? { ok: false, message: error.message } : { ok: true, data: data as T }
}

export const identityActions = {
  submit: (input: { legalName: string; birthDate: string; address: string; phone: string; idType: string; idLast4: string; idExpiry: string; front: string; back: string | null; selfie: string; consentVersion: string }) =>
    call<string>("submit_identity_verification", { p_legal_name: input.legalName, p_birth_date: input.birthDate, p_address: input.address, p_phone: input.phone, p_id_type: input.idType, p_id_last4: input.idLast4, p_id_expiry: input.idExpiry || null, p_front_path: input.front, p_back_path: input.back, p_selfie_path: input.selfie, p_consent_version: input.consentVersion }),
  withdraw: (id: string) => call("withdraw_identity_verification", { p_id: id }),
  decide: (id: string, approve: boolean, note: string) => call("decide_identity_verification", { p_id: id, p_approve: approve, p_note: note || null }),
  recordView: (id: string) => call("record_identity_view", { p_id: id }),
  deleteImages: async (verification: Verification): Promise<string> => {
    const { error } = await supabase.storage.from("identity-docs").remove([verification.front_path, verification.back_path, verification.selfie_path].filter((path): path is string => Boolean(path)))
    if (error) return error.message
    const marked = await call("mark_identity_docs_deleted", { p_id: verification.id })
    return marked.ok ? "" : marked.message
  },
}

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export type Caller = {
  id: string
  role: string
  permissions: string[]
  admin: SupabaseClient
}

// Verifies the caller's JWT, then loads their profile + permissions with the service role.
export async function requireCaller(req: Request): Promise<Caller> {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  )
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "")
  if (!token) throw new HttpError(401, "Not signed in")
  const { data: userData, error } = await admin.auth.getUser(token)
  if (error || !userData.user) throw new HttpError(401, "Invalid session")

  // Admin actions need a session that passed the authenticator (TOTP) challenge (aal2).
  // The token was already validated by getUser above, so reading its claims here is safe.
  let aal = "aal1"
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
    aal = payload.aal ?? "aal1"
  } catch {
    throw new HttpError(401, "Invalid session")
  }
  if (aal !== "aal2") throw new HttpError(403, "Authenticator verification required")

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", userData.user.id)
    .single()
  if (!profile || profile.status !== "active") throw new HttpError(403, "Account not active")
  if (profile.role !== "super_admin" && profile.role !== "admin") {
    throw new HttpError(403, "Admins only")
  }
  let permissions: string[] = []
  if (profile.role === "admin") {
    const { data } = await admin.from("admin_permissions").select("permission").eq("user_id", profile.id)
    permissions = (data ?? []).map((row) => row.permission)
  }
  return { id: profile.id, role: profile.role, permissions, admin }
}

export const can = (caller: Caller, permission: string) =>
  caller.role === "super_admin" || caller.permissions.includes(permission)

export async function audit(
  caller: Caller,
  action: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
) {
  await caller.admin.from("audit_log").insert({ actor_id: caller.id, target_id: targetId, action, details })
}

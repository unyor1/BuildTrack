import { audit, can, corsHeaders, HttpError, json, requireCaller } from "../_shared/guard.ts"

// Returns a one-time token hash. The browser exchanges it with
// supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) to get a session as the target user.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  try {
    const caller = await requireCaller(req)
    if (!can(caller, "users.impersonate")) throw new HttpError(403, "Missing permission: users.impersonate")
    const { id } = await req.json()
    if (typeof id !== "string") throw new HttpError(400, "Missing user id")
    if (id === caller.id) throw new HttpError(400, "You cannot impersonate yourself")

    const { data: target } = await caller.admin.from("profiles")
      .select("id, email, role, status, full_name").eq("id", id).single()
    if (!target) throw new HttpError(404, "User not found")
    if (target.role === "super_admin") throw new HttpError(403, "Super Admin accounts cannot be impersonated")
    if (target.role === "admin") {
      throw new HttpError(403, "Admin accounts cannot be impersonated (they require authenticator MFA)")
    }
    if (target.status !== "active") throw new HttpError(400, "Only active users can be impersonated")

    const { data, error } = await caller.admin.auth.admin.generateLink({ type: "magiclink", email: target.email })
    if (error || !data.properties?.hashed_token) throw new HttpError(500, "Could not start session")
    await audit(caller, "user.impersonate", target.id, { email: target.email })
    return json({
      token_hash: data.properties.hashed_token,
      target: { id: target.id, email: target.email, full_name: target.full_name, role: target.role },
    })
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status)
    console.error(err)
    return json({ error: "Server error" }, 500)
  }
})

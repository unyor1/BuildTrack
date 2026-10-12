import { createClient } from "npm:@supabase/supabase-js@2"
import { corsHeaders, json } from "../_shared/guard.ts"

// Called by the browser right after someone signed in with Google from the LOGIN page.
// If that Google account never completed registration (the database created it half-way: pending, no details submitted, never approved),
// it is deleted and the person is told to register first. Anything else is left alone: an established account is never touched.
// The caller can only affect their own account (the id comes from their verified token).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    if (!token) return json({ error: "Not signed in" }, 401)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })
    const { data: userData, error } = await admin.auth.getUser(token)
    if (error || !userData.user) return json({ error: "Invalid session" }, 401)
    const user = userData.user

    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, status, role, signup_provider, registration_completed_at, approved_at")
      .eq("id", user.id)
      .maybeSingle()
    const unregistered = Boolean(profile) && profile!.signup_provider === "google" && profile!.status === "pending" && profile!.role === "user" && !profile!.registration_completed_at && !profile!.approved_at
    if (!unregistered) return json({ removed: false })

    await admin.from("audit_log").insert({ actor_id: null, target_id: null, action: "oauth.blocked", details: { email: profile!.email, provider: "google", reason: "no registered account" } })
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error("oauth-gate delete failed", deleteError.message)
      return json({ error: "Could not clean up the unregistered account" }, 500)
    }
    return json({ removed: true })
  } catch (err) {
    console.error(err)
    return json({ error: "Server error" }, 500)
  }
})

import { createClient } from "npm:@supabase/supabase-js@2"
import { buildEmail, type EmailJob } from "../_shared/emailModel.ts"

// Sends the emails for notifications that are due (see migration 0028). Meant to be called on a schedule (every few minutes) by
// Supabase Cron or by hand. It is NOT for browsers: the caller must present the service role key (or the CRON_SECRET header).
// Secrets it reads from the Supabase environment (never from the repository): BREVO_API_KEY, MAIL_FROM_EMAIL, MAIL_FROM_NAME, APP_URL, CRON_SECRET.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405)
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const cronSecret = Deno.env.get("CRON_SECRET") ?? ""
  const secretHeader = req.headers.get("x-cron-secret") ?? ""
  // The gateway has already verified the token's signature (verify_jwt), so its role claim can be trusted: only the service role passes.
  let role = ""
  try {
    role = JSON.parse(atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role ?? ""
  } catch {
    role = ""
  }
  const allowed = role === "service_role" || (serviceKey && bearer && same(bearer, serviceKey)) || (cronSecret.length >= 16 && secretHeader && same(secretHeader, cronSecret))
  if (!allowed) return json({ error: "Not allowed" }, 403)

  const apiKey = Deno.env.get("BREVO_API_KEY") ?? ""
  const fromEmail = Deno.env.get("MAIL_FROM_EMAIL") ?? ""
  if (!apiKey || !fromEmail) return json({ configured: false, sent: 0, note: "Set BREVO_API_KEY and MAIL_FROM_EMAIL as Supabase secrets to turn emails on." })

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } })
  const { data, error } = await admin.rpc("claim_email_batch", { p_limit: 25 })
  if (error) {
    console.error("claim failed", error.message)
    return json({ error: "Could not read the queue" }, 500)
  }
  const jobs = (data ?? []) as Array<EmailJob & { to_email: string }>
  const appUrl = Deno.env.get("APP_URL") ?? ""
  const sender = { email: fromEmail, name: Deno.env.get("MAIL_FROM_NAME") ?? "BuildTrack" }
  let sent = 0
  let failed = 0

  for (const job of jobs) {
    const mail = buildEmail(job, appUrl)
    let ok = false
    let detail = ""
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender, to: [{ email: job.to_email }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text, tags: ["buildtrack", job.kind.slice(0, 30)] }),
      })
      ok = response.ok
      detail = ok ? `accepted (${response.status})` : `Brevo ${response.status}: ${(await response.text()).slice(0, 200)}`
    } catch (fetchError) {
      detail = `network: ${(fetchError as Error).message}`.slice(0, 200)
    }
    await admin.rpc("mark_email_result", { p_id: job.id, p_ok: ok, p_detail: detail })
    if (ok) sent++
    else failed++
  }
  return json({ configured: true, claimed: jobs.length, sent, failed })
})

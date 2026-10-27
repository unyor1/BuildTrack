type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
type ReceiverRpc = (fn: "ingest_biometric_scan" | "report_unregistered_scan", args: Record<string, string>) => PromiseLike<RpcResult>
// The database decides IN/OUT (20261027130000); "status" says whether this scan became attendance or was ignored.
// "unregistered" (20261027152428): the scan cannot count; reason no_match | not_linked | inactive | other_device.
type ScanDecision = { event_id: string | null; status: "recorded" | "repeat" | "out_of_order" | "unregistered"; direction?: "in" | "out"; occurred_at: string; schedule_flag?: string | null; minutes_off?: number | null; reason?: string }
const reasons = ["no_match", "not_linked", "inactive", "other_device"]
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

export function scanPayloadProblem(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Expected a scan object."
  const value = body as Record<string, unknown>
  const allowed = ["device_id", "biometric_uid", "direction", "occurred_at", "event_id", "result"]
  if (Object.keys(value).some(key => !allowed.includes(key))) return "Unexpected scan fields. Project scope is derived from the device."
  if (typeof value.device_id !== "string" || !uuid.test(value.device_id)) return "A registered device ID is required."
  // "result":"no_match" = the scanner found no stored finger: reported (never attendance) without a biometric ID.
  if (value.result !== undefined && value.result !== "no_match") return "Unknown scan result."
  if (value.result === "no_match" ? value.biometric_uid !== undefined : typeof value.biometric_uid !== "string" || !value.biometric_uid.trim() || value.biometric_uid.length > 80) return value.result === "no_match" ? "An unmatched scan has no biometric ID." : "A matched biometric ID is required."
  // Optional and never trusted: older firmware sends a switch value, newer firmware sends "auto".
  if (value.direction !== undefined && value.direction !== "in" && value.direction !== "out" && value.direction !== "auto") return "Direction must be in, out or auto (the server decides)."
  if (typeof value.occurred_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.occurred_at) || !Number.isFinite(Date.parse(value.occurred_at))) return "A timezone-aware device scan time is required."
  if (typeof value.event_id !== "string" || !value.event_id.trim() || value.event_id.length > 160) return "A stable source event ID is required."
  return ""
}

export async function receiveAttendance(req: Request, rpc: ReceiverRpc): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST required" }, 405)
  const token = req.headers.get("x-device-token") ?? ""
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Invalid or revoked device credential" }, 401)
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "JSON required" }, 415)
  try {
    const reader = req.body?.getReader()
    if (!reader) return json({ error: "Missing scan body" }, 400)
    let total = 0
    const chunks: Uint8Array[] = []
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > 4096) { await reader.cancel(); return json({ error: "Scan body too large" }, 413) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let body: unknown
    try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return json({ error: "Invalid JSON" }, 400) }
    const problem = scanPayloadProblem(body)
    if (problem) return json({ error: problem }, 400)
    const scan = body as Record<string, string>
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
    const { data, error } = scan.result === "no_match"
      ? await rpc("report_unregistered_scan", { p_device: scan.device_id, p_token_hash: hash, p_occurred_at: scan.occurred_at, p_event: scan.event_id.trim() })
      : await rpc("ingest_biometric_scan", { p_device: scan.device_id, p_token_hash: hash, p_biometric_uid: scan.biometric_uid.trim(), p_occurred_at: scan.occurred_at, p_event: scan.event_id.trim() })
    if (error?.code === "28000") return json({ error: "Invalid or revoked device credential" }, 401)
    if (error?.code === "P0429") return json({ error: "Too many scans. Retry the same event later." }, 429)
    if (error?.code === "P0001") return json({ error: "Scan rejected. Check worker enrollment, active status, timestamp and source event ID." }, 422)
    const decision = data as ScanDecision | null
    const unregistered = decision?.status === "unregistered"
    if (error || !decision || typeof decision !== "object" || (unregistered ? !reasons.includes(decision.reason ?? "")
      : typeof decision.event_id !== "string" || !["recorded", "repeat", "out_of_order"].includes(decision.status) || (decision.direction !== "in" && decision.direction !== "out")))
      return json({ error: "Attendance service unavailable. Retry the same event." }, 503)
    // Handled, but not attendance: the device shows why and must not retry or keep it pending.
    if (unregistered) return json({ recorded: false, event_id: null, status: "unregistered", reason: decision.reason, occurred_at: decision.occurred_at })
    // "recorded": true means the scan was handled (stored or deliberately ignored); the device must not retry it.
    // recorded + event_id stay first so older firmware that checks the reply prefix keeps working.
    return json({ recorded: true, event_id: decision.event_id, status: decision.status, direction: decision.direction, occurred_at: decision.occurred_at, schedule_flag: decision.schedule_flag ?? null, minutes_off: decision.minutes_off ?? null })
  } catch {
    // Never log the request/token, fingerprint ID, or server credential.
    return json({ error: "Attendance service unavailable. Retry the same event." }, 503)
  }
}

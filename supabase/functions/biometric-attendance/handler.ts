type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
type ReceiverRpc = (args: Record<string, string>) => PromiseLike<RpcResult>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

export function scanPayloadProblem(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Expected a scan object."
  const value = body as Record<string, unknown>
  const allowed = ["device_id", "biometric_uid", "direction", "occurred_at", "event_id"]
  if (Object.keys(value).some(key => !allowed.includes(key))) return "Unexpected scan fields. Project scope is derived from the device."
  if (typeof value.device_id !== "string" || !uuid.test(value.device_id)) return "A registered device ID is required."
  if (typeof value.biometric_uid !== "string" || !value.biometric_uid.trim() || value.biometric_uid.length > 80) return "A matched biometric ID is required."
  if (value.direction !== "in" && value.direction !== "out") return "Choose explicit in or out attendance."
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
    const { data, error } = await rpc({ p_device: scan.device_id, p_token_hash: hash, p_biometric_uid: scan.biometric_uid.trim(), p_direction: scan.direction, p_occurred_at: scan.occurred_at, p_event: scan.event_id.trim() })
    if (error?.code === "28000") return json({ error: "Invalid or revoked device credential" }, 401)
    if (error?.code === "P0429") return json({ error: "Too many scans. Retry the same event later." }, 429)
    if (error?.code === "P0001") return json({ error: "Scan rejected. Check worker enrollment, active status, timestamp and source event ID." }, 422)
    if (error || typeof data !== "string") return json({ error: "Attendance service unavailable. Retry the same event." }, 503)
    return json({ recorded: true, event_id: data })
  } catch {
    // Never log the request/token, fingerprint ID, or server credential.
    return json({ error: "Attendance service unavailable. Retry the same event." }, 503)
  }
}

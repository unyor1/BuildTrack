type Result = { data: unknown; error: { code?: string } | null }
type Rpc = (args: Record<string, string | number | null>) => PromiseLike<Result>
const stages = ["place_first", "lift", "place_second", "storing", "confirm"]
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } })

export async function receiveEnrollment(req: Request, rpc: Rpc): Promise<Response> {
  if (req.method !== "POST") return json({ error: "POST required" }, 405)
  const token = req.headers.get("x-device-token") ?? ""
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Invalid device credential" }, 401)
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "JSON required" }, 415)
  try {
    const reader = req.body?.getReader()
    if (!reader) return json({ error: "Missing body" }, 400)
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2048) { await reader.cancel(); return json({ error: "Body too large" }, 413) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength }
    let body: unknown
    try { body = JSON.parse(new TextDecoder().decode(bytes)) } catch { return json({ error: "Invalid JSON" }, 400) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Expected enrollment object" }, 400)
    const b = body as Record<string, unknown>
    if (Object.keys(b).some(key => !["device_id", "action", "capacity", "request_id", "error", "stage"].includes(key)) || typeof b.device_id !== "string" || !uuid.test(b.device_id)) return json({ error: "Invalid fields or device ID" }, 400)
    if (b.action !== "poll" && b.action !== "progress" && b.action !== "completed" && b.action !== "failed") return json({ error: "Invalid action" }, 400)
    if (b.action === "poll" ? !Number.isInteger(b.capacity) || Number(b.capacity) < 1 || Number(b.capacity) > 65535 || b.request_id !== undefined || b.error !== undefined
      : typeof b.request_id !== "string" || !uuid.test(b.request_id) || b.capacity !== undefined || (b.error !== undefined && (typeof b.error !== "string" || b.error.length > 160))) return json({ error: "Invalid enrollment payload" }, 400)
    // A step report names one known capture step; other actions never carry a step.
    if (b.action === "progress" ? typeof b.stage !== "string" || !stages.includes(b.stage) || b.error !== undefined : b.stage !== undefined) return json({ error: "Invalid enrollment payload" }, 400)
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
    const { data, error } = await rpc({ p_device: b.device_id, p_token_hash: hash, p_action: b.action, p_capacity: b.action === "poll" ? Number(b.capacity) : null, p_request: b.action === "poll" ? null : b.request_id as string, p_error: typeof b.error === "string" ? b.error : "", ...(b.action === "progress" ? { p_stage: b.stage as string } : {}) })
    if (error?.code === "28000") return json({ error: "Invalid or revoked device credential" }, 401)
    if (error?.code === "P0001") return json({ error: "Enrollment rejected. Check the active request and sensor." }, 422)
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Enrollment service unavailable" }, 503)
    return json(data)
  } catch { return json({ error: "Enrollment service unavailable" }, 503) }
}

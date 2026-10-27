// Fingerprint registration (Admin > Biometric Registration) as the Admin sees it. Pure: the screen reads
// worker_enrollment_requests + attendance_devices and these rules turn them into steps, a headline and the instruction
// for the worker. The steps come from the ESP32 (20261027110000_enrollment_progress); the browser never decides success.

export type EnrollmentStage = "" | "place_first" | "lift" | "place_second" | "storing" | "confirm"
export type EnrollmentJob = {
  id: string
  status: "queued" | "capturing" | "completed" | "failed" | "cancelled" | string
  stage?: EnrollmentStage | null
  error_message: string
  expires_at: string
  slot?: number | null
  finished_at?: string | null
}
export type StepState = "done" | "current" | "todo" | "failed"
export type EnrollmentStep = { key: string; label: string; state: StepState }
export type EnrollmentView = {
  tone: "idle" | "waiting" | "active" | "success" | "problem"
  headline: string
  instruction: string
  pending: boolean
  expired: boolean
  steps: EnrollmentStep[]
}

// A device polls every 3 s while it is idle; a capture step can keep it busy for up to ~40 s.
export const DEVICE_ONLINE_MS = 60_000

export function deviceStatus(lastSeen: string | null | undefined, now: number) {
  if (!lastSeen) return { online: false, label: "Never connected" }
  const age = now - Date.parse(lastSeen)
  if (!Number.isFinite(age)) return { online: false, label: "Never connected" }
  if (age <= DEVICE_ONLINE_MS) return { online: true, label: "Online" }
  const minutes = Math.round(age / 60_000)
  return { online: false, label: minutes < 60 ? `Offline (last seen ${minutes} min ago)` : minutes < 2880 ? `Offline (last seen ${Math.round(minutes / 60)} h ago)` : "Offline (last seen days ago)" }
}

export const enrollmentStepLabels: Array<[string, string]> = [
  ["queued", "Request sent to the scanner"],
  ["ready", "Scanner ready"],
  ["place_first", "First scan"],
  ["lift", "Lift the finger"],
  ["place_second", "Second scan (same finger)"],
  ["storing", "Saving on the scanner"],
  ["confirm", "Confirmation scan"],
  ["completed", "Registered and confirmed"],
]

const instructions: Record<string, string> = {
  queued: "Waiting for the ESP32 to pick up the request (it checks every 3 seconds).",
  ready: "The scanner is preparing. The worker should stand at the scanner.",
  place_first: "Place the finger flat on the scanner and hold it still.",
  lift: "Lift the finger off the scanner.",
  place_second: "Place the same finger on the scanner again.",
  storing: "Saving the fingerprint on the scanner. Keep the finger off.",
  confirm: "Place the same finger once more to confirm it is recognised.",
}

function stepIndex(job: EnrollmentJob | null, enrolled: boolean) {
  if (enrolled) return enrollmentStepLabels.length - 1
  if (!job) return -1
  if (job.status === "queued") return 0
  if (job.status === "capturing") {
    const at = enrollmentStepLabels.findIndex(([key]) => key === (job.stage || "ready"))
    return at < 0 ? 1 : at
  }
  // Finished jobs: the last step the device reported is where it stopped.
  const at = enrollmentStepLabels.findIndex(([key]) => key === (job.stage || (job.slot ? "ready" : "queued")))
  return at < 0 ? 0 : at
}

export function enrollmentView(job: EnrollmentJob | null, enrolled: boolean, now: number): EnrollmentView {
  const pending = !enrolled && (job?.status === "queued" || job?.status === "capturing")
  const expired = pending && Date.parse(job!.expires_at) < now
  const failed = !enrolled && !pending && (job?.status === "failed" || job?.status === "cancelled")
  const at = stepIndex(job, enrolled)
  const steps = enrollmentStepLabels.map(([key, label], index): EnrollmentStep => ({
    key,
    label,
    state: enrolled ? "done" : index < at ? "done" : index === at ? (failed || expired ? "failed" : pending ? "current" : "todo") : "todo",
  }))
  if (enrolled) return { tone: "success", headline: "Fingerprint registered and confirmed", instruction: "The scanner recognised the worker's finger. Attendance scans now count for this worker.", pending: false, expired: false, steps }
  if (expired) return { tone: "problem", headline: "Registration timed out", instruction: "Cancel, then start again with the worker at the scanner.", pending, expired, steps }
  if (pending) {
    const key = enrollmentStepLabels[at]?.[0] ?? "queued"
    return { tone: job!.status === "queued" ? "waiting" : "active", headline: job!.status === "queued" ? "Waiting for the scanner" : enrollmentStepLabels[at][1], instruction: instructions[key] ?? "", pending, expired, steps }
  }
  if (failed) return { tone: "problem", headline: job!.status === "cancelled" ? "Registration cancelled" : "Registration did not finish", instruction: job!.error_message || "Start again with the worker at the scanner.", pending, expired, steps }
  return { tone: "idle", headline: "Fingerprint not registered", instruction: "Choose the scanner, then start registration with the worker present.", pending, expired, steps: steps.map((step) => ({ ...step, state: "todo" })) }
}

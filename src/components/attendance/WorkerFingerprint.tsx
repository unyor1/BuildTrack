import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { useConfirm } from "../../lib/confirm"
import type { AttendanceWorker } from "../../lib/attendanceModel"
import { deviceStatus, enrollmentView, type EnrollmentJob } from "../../lib/enrollmentModel"

type Device = {
  id: string
  label: string
  last_seen_at: string | null
}
type Props = {
  worker: AttendanceWorker
  projectId: string
}

const primary = "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 !text-sm !font-bold text-white disabled:opacity-50"
const secondary = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface px-4 !text-sm !font-semibold text-fg disabled:opacity-50"
const toneBox = {
  idle: "border-line bg-surface-muted/50",
  waiting: "border-line bg-surface-muted/50",
  active: "border-brand/50 bg-brand-soft",
  success: "border-ok-fg/40 bg-ok-soft",
  problem: "border-danger-fg/40 bg-danger-soft",
}
const stepMark = { done: "✓", current: "●", todo: "", failed: "✕" }
const stepStyle = {
  done: "border-ok-fg bg-ok-soft text-ok-fg",
  current: "border-brand bg-brand text-white motion-safe:animate-pulse",
  todo: "border-line bg-surface text-fg-muted",
  failed: "border-danger-fg bg-danger-soft text-danger-fg",
}

// Admin fingerprint registration: the Admin starts it, the ESP32 + AS608 report each capture step, and the worker is
// linked only when the device confirms a final scan of the stored finger. Nothing here can mark a fingerprint registered.
export default function WorkerFingerprint({ worker, projectId }: Props) {
  const confirm = useConfirm()
  const [devices, setDevices] = useState<Device[]>([])
  const [selected, setSelected] = useState("")
  const [job, setJob] = useState<EnrollmentJob | null>(null)
  const [enrolled, setEnrolled] = useState(Boolean(worker.biometric_uid))
  const [enrolledAt, setEnrolledAt] = useState(worker.fingerprint_enrolled_at ?? "")
  const [slot, setSlot] = useState(worker.biometric_uid ?? "")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let current = true,
      inFlight = false
    async function load() {
      if (inFlight) return
      inFlight = true
      try {
        const [deviceResult, jobResult, workerResult] = await Promise.all([
          supabase
            .from("attendance_devices")
            .select("id,label,last_seen_at")
            .eq("project_id", projectId)
            .eq("active", true)
            .order("created_at")
            .limit(200),
          supabase
            .from("worker_enrollment_requests")
            // Whole row: `stage` exists only once 20261027110000 is applied; without it the steps stop at "Scanner ready".
            .select("*")
            .eq("worker_id", worker.id)
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("attendance_workers")
            .select("biometric_uid,fingerprint_enrolled_at")
            .eq("id", worker.id)
            .eq("project_id", projectId)
            .single(),
        ])
        if (!current) return
        if (deviceResult.error || jobResult.error || workerResult.error)
          throw new Error("Fingerprint status could not be loaded. Retrying automatically.")
        const available = (deviceResult.data ?? []) as Device[]
        setDevices(available)
        setSelected((value) =>
          available.some((d) => d.id === value) ? value : available.length === 1 ? available[0].id : "",
        )
        setJob(jobResult.data as EnrollmentJob | null)
        setEnrolled(Boolean(workerResult.data?.biometric_uid))
        setEnrolledAt(workerResult.data?.fingerprint_enrolled_at ?? "")
        setSlot(workerResult.data?.biometric_uid ?? "")
        setError("")
      } catch (problem) {
        if (current)
          setError(problem instanceof Error ? problem.message : "Enrollment status unavailable. Retrying automatically.")
      } finally {
        inFlight = false
        if (current) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 2000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [worker.id, projectId, version])

  const now = Date.now()
  const view = enrollmentView(job, enrolled, now)
  const device = devices.find((d) => d.id === selected)
  const status = device ? deviceStatus(device.last_seen_at, now) : null

  async function start() {
    if (busy || !device) return
    const ok = await confirm({
      title: "Start fingerprint registration?",
      confirmLabel: "Start registration",
      message: (
        <div className="space-y-2 text-sm">
          <p>
            <strong>{worker.full_name}</strong> will be registered on <strong>{device.label}</strong>.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>The worker is standing at the scanner now.</li>
            <li>Only this worker touches the scanner until it says Registered.</li>
            <li>They use the same finger for all three scans: two to record it, one to confirm it.</li>
          </ul>
          {status && !status.online ? (
            <p className="font-semibold text-danger-fg">The scanner looks {status.label.toLowerCase()}. The request waits up to 5 minutes for it.</p>
          ) : null}
        </div>
      ),
    })
    if (ok) await act(false)
  }

  async function act(cancel: boolean) {
    if (busy) return
    setBusy(true)
    setActionError("")
    try {
      const { error } = cancel
        ? await supabase.rpc("cancel_worker_enrollment", { p_request: job!.id })
        : await supabase.rpc("request_worker_enrollment", { p_worker: worker.id, p_device: selected })
      if (error)
        throw new Error(cancel ? "Could not cancel enrollment. Please retry." : error.message || "Could not start fingerprint registration.")
    } catch (problem) {
      setActionError(problem instanceof Error ? problem.message : "Enrollment request failed.")
    } finally {
      setBusy(false)
      setVersion((value) => value + 1)
    }
  }

  return (
    <section aria-label="Worker fingerprint registration" className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-fg">Register fingerprint</h3>
        {status && !enrolled ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${status.online ? "bg-ok-soft text-ok-fg" : "bg-danger-soft text-danger-fg"}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status.online ? "bg-ok-fg" : "bg-danger-fg"}`} />
            Scanner {status.label.charAt(0).toLowerCase() + status.label.slice(1)}
          </span>
        ) : null}
      </div>

      <div className={`rounded-xl border p-3 ${toneBox[view.tone]}`}>
        <p role="status" aria-live="polite" className="text-base font-extrabold text-fg">
          {loading ? "Loading fingerprint status…" : view.headline}
        </p>
        {!loading && view.instruction ? <p className="mt-1 text-sm text-fg">{view.instruction}</p> : null}
        {enrolled ? (
          <p className="mt-2 text-xs text-fg-muted">
            Scanner slot {slot || "—"}
            {enrolledAt ? ` · ${new Date(enrolledAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}` : ""}
          </p>
        ) : null}
      </div>

      {!loading && view.tone !== "idle" ? (
        <ol aria-label="Registration steps" className="grid gap-1.5 sm:grid-cols-2">
          {view.steps.map((step, index) => (
            <li key={step.key} aria-current={step.state === "current" ? "step" : undefined} className={`flex items-center gap-2 text-sm ${step.state === "todo" ? "text-fg-muted" : "font-semibold text-fg"}`}>
              <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${stepStyle[step.state]}`}>
                {stepMark[step.state] || index + 1}
              </span>
              <span>{step.label}</span>
              <span className="sr-only">{step.state === "done" ? "(done)" : step.state === "current" ? "(now)" : step.state === "failed" ? "(stopped here)" : ""}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {!enrolled && (
        <>
          <label className="block text-xs font-bold text-fg">
            Fingerprint scanner
            <select
              className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 !text-sm !font-normal text-fg"
              value={selected}
              disabled={loading || busy || view.pending}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{devices.length ? "Select a project device" : "No active device registered"}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label} ({deviceStatus(d.last_seen_at, now).online ? "online" : "offline"})
                </option>
              ))}
            </select>
          </label>
          {!devices.length && !loading && (
            <p className="text-xs text-fg-muted">
              Use the Devices tab to connect the project's ESP32 first. The registration firmware must be running.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(!view.pending || view.expired) && (
              <button type="button" disabled={busy || loading || !selected || !worker.active || Boolean(error)} onClick={() => void start()} className={primary}>
                {busy ? "Requesting…" : view.tone === "problem" ? "Try again" : "Register fingerprint"}
              </button>
            )}
            {view.pending && (
              <button type="button" disabled={busy} onClick={() => void act(true)} className={secondary}>
                Cancel enrollment
              </button>
            )}
          </div>
        </>
      )}
      <p className="text-xs text-fg-muted">
        No enrollment ID is typed. The scanner records two scans of the same finger, saves it in a free slot, then asks
        for a third scan to confirm it. Fingerprint images and templates stay on the scanner.
      </p>
      {error && (
        <p role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-xs text-danger-fg">
          {actionError}
        </p>
      )}
    </section>
  )
}

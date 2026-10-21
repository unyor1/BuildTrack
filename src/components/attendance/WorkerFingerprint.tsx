import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import type { AttendanceWorker } from "../../lib/attendanceModel"

type Device = {
  id: string
  label: string
}
type Job = {
  id: string
  status: string
  error_message: string
  expires_at: string
}
type Props = {
  worker: AttendanceWorker
  projectId: string
}
export default function WorkerFingerprint({ worker, projectId }: Props) {
  const [devices, setDevices] = useState<Device[]>([])
  const [selected, setSelected] = useState("")
  const [job, setJob] = useState<Job | null>(null)
  const [enrolled, setEnrolled] = useState(Boolean(worker.biometric_uid))
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
            .select("id,label")
            .eq("project_id", projectId)
            .eq("active", true)
            .order("created_at")
            .limit(200),
          supabase
            .from("worker_enrollment_requests")
            .select("id,status,error_message,expires_at")
            .eq("worker_id", worker.id)
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("attendance_workers")
            .select("biometric_uid")
            .eq("id", worker.id)
            .eq("project_id", projectId)
            .single(),
        ])
        if (!current) return
        if (deviceResult.error || jobResult.error || workerResult.error)
          throw new Error(
            "Fingerprint status could not be loaded. Retrying automatically.",
          )
        const available = (deviceResult.data ?? []) as Device[]
        setDevices(available)
        setSelected((value) =>
          available.some((d) => d.id === value)
            ? value
            : available.length === 1
              ? available[0].id
              : "",
        )
        setJob(jobResult.data as Job | null)
        setEnrolled(Boolean(workerResult.data?.biometric_uid))
        setError("")
      } catch (problem) {
        if (current)
          setError(
            problem instanceof Error
              ? problem.message
              : "Enrollment status unavailable. Retrying automatically.",
          )
      } finally {
        inFlight = false
        if (current) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [worker.id, projectId, version])

  const pending = job?.status === "queued" || job?.status === "capturing"
  const expired = pending && Date.parse(job.expires_at) < Date.now()
  async function act(cancel: boolean) {
    if (busy) return
    setBusy(true)
    setActionError("")
    try {
      const { error } = cancel
        ? await supabase.rpc("cancel_worker_enrollment", { p_request: job!.id })
        : await supabase.rpc("request_worker_enrollment", {
            p_worker: worker.id,
            p_device: selected,
          })
      if (error)
        throw new Error(
          cancel
            ? "Could not cancel enrollment. Please retry."
            : error.message || "Could not start fingerprint registration.",
        )
    } catch (problem) {
      setActionError(
        problem instanceof Error
          ? problem.message
          : "Enrollment request failed.",
      )
    } finally {
      setBusy(false)
      setVersion((value) => value + 1)
    }
  }

  return (
    <section
      aria-label="Worker fingerprint registration"
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <h3 className="font-bold">Register fingerprint</h3>
      <p role="status" className="text-sm font-semibold">
        {loading
          ? "Loading fingerprint status…"
          : enrolled
            ? "Fingerprint registered"
            : expired
              ? "Enrollment timed out — cancel or retry."
              : job?.status === "capturing"
                ? "Sensor ready: place finger, lift it, then scan the same finger again."
                : pending
                  ? "Waiting for the ESP32 / AS608 sensor…"
                  : "Fingerprint not registered"}
      </p>
      {!enrolled && (
        <>
          <label className="block text-xs font-bold">
            Fingerprint device
            <select
              className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
              value={selected}
              disabled={loading || busy || pending}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">
                {devices.length
                  ? "Select a project device"
                  : "No active device registered"}
              </option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          {!devices.length && !loading && (
            <p className="text-xs text-fg-muted">
              Use the Devices tab to connect the project’s ESP32 first. The
              updated enrollment firmware must be running.
            </p>
          )}
          {(!pending || expired) && (
            <button
              type="button"
              disabled={
                busy || loading || !selected || !worker.active || Boolean(error)
              }
              onClick={() => void act(false)}
              className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Requesting…" : "Register fingerprint"}
            </button>
          )}
          {pending && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(true)}
              className="min-h-11 rounded-xl border border-border px-4 text-sm"
            >
              Cancel enrollment
            </button>
          )}
        </>
      )}
      {job?.error_message && !pending && (
        <p className="text-xs text-fg-muted">{job.error_message}</p>
      )}
      <p className="text-xs text-fg-muted">
        No enrollment ID is typed manually. The device captures two impressions
        of the same finger and confirms registration automatically. Fingerprint
        images and templates stay on the sensor.
      </p>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="text-xs text-red-600">
          {actionError}
        </p>
      )}
    </section>
  )
}

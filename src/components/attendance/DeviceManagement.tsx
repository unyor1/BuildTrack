import { useCallback, useEffect, useState, type FormEvent } from "react"

import { supabase } from "../../lib/supabase"

import BiometricAdminGuard from "./BiometricAdminGuard"

type Device = {
  id: string
  label: string
  active: boolean
  last_seen_at: string | null
}

const columns = "id,label,active,last_seen_at"

async function credential() {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  )

  return {
    token,
    hash: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  }
}

export default function DeviceManagement({ projectId }: { projectId: string }) {
  return (
    <BiometricAdminGuard>
      <AdminDeviceManagement projectId={projectId} />
    </BiometricAdminGuard>
  )
}

function AdminDeviceManagement({ projectId }: { projectId: string }) {
  const [devices, setDevices] = useState<Device[]>([])

  const [label, setLabel] = useState("")

  const [busy, setBusy] = useState(false)

  const [error, setError] = useState("")

  const [once, setOnce] = useState<{
    id: string
    token: string
  } | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from("attendance_devices")
      .select(columns)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(200)

    setDevices((data ?? []) as Device[])

    if (error)
      setError("Device list could not be loaded. Check permission and retry.")
  }, [projectId])

  useEffect(() => {
    void reload()
  }, [reload])

  const register = async (event: FormEvent) => {
    event.preventDefault()

    if (busy || label.trim().length < 2) return

    setBusy(true)
    setError("")

    try {
      const made = await credential(),
        id = crypto.randomUUID()

      const { error } = await supabase
        .from("attendance_devices")
        .insert({
          id,
          project_id: projectId,
          label: label.trim(),
          token_sha256: made.hash,
        })

      if (error) throw error

      setOnce({ id, token: made.token })
      setLabel("")
      await reload()
    } catch {
      setError(
        "Could not register the device. Your browser must use HTTPS or localhost, and your account needs biometric management permission.",
      )
    } finally {
      setBusy(false)
    }
  }

  const change = async (device: Device, rotate: boolean) => {
    if (
      busy ||
      !window.confirm(
        rotate
          ? "Rotate this device token? The old token stops working immediately; update its ESP32 configuration."
          : "Revoke this device? It will no longer be allowed to submit attendance.",
      )
    )
      return

    setBusy(true)
    setError("")

    try {
      const made = rotate ? await credential() : null

      const { data, error } = await supabase
        .from("attendance_devices")
        .update(
          made ? { token_sha256: made.hash, active: true } : { active: false },
        )
        .eq("id", device.id)
        .eq("project_id", projectId)
        .select("id")
        .single()

      if (error || !data) throw error

      setOnce(made ? { id: device.id, token: made.token } : null)
      await reload()
    } catch {
      setError("Could not update the device. Refresh and retry.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-xl font-bold">
        ESP32 / AS608 device connection
      </h2>
      <p className="text-sm text-fg-muted">
        Register a device for this project. Its token can submit scans only for
        this project; it cannot read worker profiles or access QA data. Up to
        200 recent devices shown.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => void register(event)}
      >
        <label className="min-w-48 flex-1 text-xs font-bold">
          Device label
          <input
            className="mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
            required
            minLength={2}
            maxLength={100}
            placeholder="e.g. Main gate ESP32"
            value={label}
            disabled={busy}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <button
          disabled={busy}
          className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          Register device
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-border px-4 text-sm"
          onClick={() => void reload()}
        >
          Refresh
        </button>
      </form>
      {once && (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <strong className="block text-sm">
            Copy this device token now. It is shown only until you dismiss or
            leave this page.
          </strong>
          <label className="block text-xs">
            Device ID
            <input
              className="mt-1 block w-full rounded border border-amber-300 bg-white p-2 font-mono text-xs"
              readOnly
              value={once.id}
            />
          </label>
          <label className="block text-xs">
            Device token (keep private)
            <input
              className="mt-1 block w-full rounded border border-amber-300 bg-white p-2 font-mono text-xs"
              readOnly
              value={once.token}
              autoComplete="off"
            />
          </label>
          <p className="mb-0 text-xs">
            Put these in the ESP32’s private config. Never use your Supabase
            service-role key on the ESP32. Firmware and setup:
            hardware/esp32-as608/README.md.
          </p>
          <button
            className="text-xs font-bold underline"
            onClick={() => setOnce(null)}
          >
            I have saved it — hide token
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {devices.map((device) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
            key={device.id}
          >
            <div>
              <strong className="block">
                {device.label} · {device.active ? "Active" : "Revoked"}
              </strong>
              <span className="block break-all font-mono text-xs text-fg-muted">
                {device.id}
              </span>
              <span className="text-xs text-fg-muted">
                {device.last_seen_at
                  ? `Last received: ${new Date(device.last_seen_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}`
                  : "No scan received yet"}
              </span>
            </div>
            <div className="flex gap-3 text-xs">
              <button
                disabled={busy}
                className="text-brand underline"
                onClick={() => void change(device, true)}
              >
                Rotate token / enable
              </button>
              {device.active && (
                <button
                  disabled={busy}
                  className="text-red-600 underline"
                  onClick={() => void change(device, false)}
                >
                  Revoke
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

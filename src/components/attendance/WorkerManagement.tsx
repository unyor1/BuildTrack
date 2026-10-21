import { useState, type FormEvent } from "react"
import { supabase } from "../../lib/supabase"
import {
  attendanceDay,
  workerPhotoProblem,
  type AttendanceWorker,
} from "../../lib/attendanceModel"
import {
  emptyWorkerRegistration,
  workerFullName,
  workerRegistrationProblem,
} from "../../lib/workerRegistrationModel"
import WorkerPortrait from "./WorkerPortrait"
import BiometricAdminGuard from "./BiometricAdminGuard"
import WorkerCamera from "./WorkerCamera"
import WorkerFingerprint from "./WorkerFingerprint"
import {
  WorkerDirectory,
  WorkerAttendanceDetails,
} from "./ForemanWorkerAttendance"

type Props = {
  projectId: string
  view?: "register" | "profiles"
  onRegister?: () => void
}
const fieldClass =
  "mt-1 block min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-fg"
export default function WorkerManagement(props: Props) {
  return (
    <BiometricAdminGuard>
      <AdminWorkerManagement {...props} />
    </BiometricAdminGuard>
  )
}

function AdminWorkerManagement({
  projectId,
  view = "register",
  onRegister,
}: Props) {
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [editing, setEditing] = useState<AttendanceWorker | null>(null)
  const [form, setForm] = useState(emptyWorkerRegistration)
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<AttendanceWorker | null>(null)
  const editWorker = (worker: AttendanceWorker) => {
    if (busy) return
    setEditing(worker)
    setForm({
      first_name: worker.first_name ?? "",
      last_name: worker.last_name ?? "",
      middle_initial: worker.middle_initial ?? "",
      contact_number: worker.contact_number ?? "",
      email: worker.email ?? "",
      worker_code: worker.worker_code,
      trade: worker.trade,
      active: worker.active,
    })
    setPhoto(null)
    setMessage("")
    setError("")
    setSelected(null)
    onRegister?.()
  }
  const reset = () => {
    setEditing(null)
    setForm(emptyWorkerRegistration)
    setPhoto(null)
    setError("")
    setMessage("")
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError("")
    setMessage("")
    const problem =
      workerRegistrationProblem(form) ||
      (photo ? workerPhotoProblem(photo) : "")
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      let worker = editing
      const values = {
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        middle_initial: form.middle_initial
          .trim()
          .replace(/\.$/, "")
          .toUpperCase(),
        contact_number: form.contact_number.trim(),
        email: form.email.trim(),
        full_name: workerFullName(form),
        worker_code: form.worker_code.trim(),
        trade: form.trade.trim(),
      }
      const result = worker
        ? await supabase
            .from("attendance_workers")
            .update(values)
            .eq("id", worker.id)
            .eq("project_id", projectId)
            .select("*")
            .single()
        : await supabase
            .from("attendance_workers")
            .insert({ ...values, project_id: projectId })
            .select("*")
            .single()
      if (result.error || !result.data)
        throw result.error ?? new Error("Worker could not be saved.")
      worker = (result.data as AttendanceWorker)
      // Preserve the durable record on an upload failure: retry updates it, never inserts a duplicate.
      setEditing(worker)
      if (photo) {
        const extension =
          photo.type === "image/png"
            ? "png"
            : photo.type === "image/webp"
              ? "webp"
              : "jpg"
        const path = `${projectId}/${worker.id}/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from("worker-photos")
          .upload(path, photo, { upsert: false, contentType: photo.type })
        if (uploadError)
          throw new Error(
            "Worker saved, but the profile photo could not be uploaded. Please retry.",
          )
        const { error: linkError, data } = await supabase
          .from("attendance_workers")
          .update({ photo_path: path })
          .eq("id", worker.id)
          .eq("project_id", projectId)
          .select("id")
          .single()
        if (linkError || !data)
          throw new Error(
            "Worker saved, but the uploaded photo could not be linked. Please retry.",
          )
        setEditing({ ...worker, photo_path: path })
        setPhoto(null)
      }
      setMessage(
        "Worker profile saved. Use Register fingerprint below to enroll on the sensor.",
      )
    } catch (problem) {
      setError(
        (problem as { code?: string })?.code === "23505"
          ? "Worker code is already used in this project."
          : problem instanceof Error
            ? problem.message
            : "Could not save the worker. Check permission and field values, then retry.",
      )
    } finally {
      setBusy(false)
    }
  }

  if (view === "profiles")
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Project worker profiles</h2>
        <WorkerDirectory
          projectId={projectId}
          search={search}
          page={page}
          onSearch={(value) => {
            setSearch(value)
            setPage(0)
          }}
          onPage={setPage}
          onWorker={setSelected}
        />
        {selected && (
          <WorkerAttendanceDetails
            key={`${projectId}:${selected.id}`}
            projectId={projectId}
            worker={selected}
            initialDay={attendanceDay()}
            onClose={() => setSelected(null)}
            onEdit={busy ? undefined : editWorker}
          />
        )}
      </section>
    )

  return (
    <form
      className="space-y-6 rounded-2xl border border-border bg-surface p-5 sm:p-7"
      onSubmit={(event) => void save(event)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {editing ? "Worker registration details" : "Register worker"}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Enter the worker’s details and capture their portrait. Fingerprint
            registration is completed on the connected sensor.
          </p>
        </div>
        {editing && (
          <button
            type="button"
            className="text-sm font-bold text-brand underline"
            disabled={busy}
            onClick={reset}
          >
            Register another worker
          </button>
        )}
      </div>
      <fieldset
        disabled={busy}
        className="grid gap-6 disabled:opacity-60 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]"
      >
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <label className="block text-xs font-bold">
            First name
            <input
              className={fieldClass}
              name="first_name"
              autoComplete="given-name"
              required
              maxLength={70}
              value={form.first_name}
              onChange={(event) =>
                setForm({ ...form, first_name: event.target.value })
              }
            />
          </label>
          <label className="block text-xs font-bold">
            Last name
            <input
              className={fieldClass}
              name="last_name"
              autoComplete="family-name"
              required
              maxLength={70}
              value={form.last_name}
              onChange={(event) =>
                setForm({ ...form, last_name: event.target.value })
              }
            />
          </label>
          <label className="block text-xs font-bold">
            Middle initial (optional)
            <input
              className={fieldClass}
              name="middle_initial"
              maxLength={2}
              placeholder="e.g. A"
              value={form.middle_initial}
              onChange={(event) =>
                setForm({ ...form, middle_initial: event.target.value })
              }
            />
          </label>
          <label className="block text-xs font-bold">
            Contact number
            <input
              className={fieldClass}
              type="tel"
              autoComplete="tel"
              name="contact_number"
              required
              maxLength={32}
              value={form.contact_number}
              onChange={(event) =>
                setForm({ ...form, contact_number: event.target.value })
              }
            />
          </label>
          <label className="block text-xs font-bold">
            Email (optional)
            <input
              className={fieldClass}
              type="email"
              autoComplete="email"
              name="email"
              maxLength={254}
              value={form.email}
              onChange={(event) =>
                setForm({ ...form, email: event.target.value })
              }
            />
          </label>
          <label className="block text-xs font-bold">
            Worker code
            <input
              className={fieldClass}
              name="worker_code"
              required
              maxLength={80}
              placeholder="e.g. W-001"
              value={form.worker_code}
              onChange={(event) =>
                setForm({ ...form, worker_code: event.target.value })
              }
            />
          </label>
          <label className="block text-xs font-bold sm:col-span-2">
            Trade / position
            <input
              className={fieldClass}
              name="trade"
              maxLength={100}
              value={form.trade}
              onChange={(event) =>
                setForm({ ...form, trade: event.target.value })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm({ ...form, active: event.target.checked })
              }
            />
            Active worker
          </label>
        </div>
        <div className="space-y-3">
          {editing?.photo_path && !photo && (
            <WorkerPortrait
              path={editing.photo_path}
              name={editing.full_name}
            />
          )}
          <WorkerCamera
            key={editing?.id ?? "new-worker"}
            value={photo}
            disabled={busy}
            onChange={setPhoto}
          />
        </div>
      </fieldset>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Saving…" : editing ? "Save changes" : "Register worker"}
      </button>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm text-emerald-700" role="status">
          {message}
        </p>
      )}
      {editing ? (
        <WorkerFingerprint
          key={editing.id}
          worker={editing}
          projectId={projectId}
        />
      ) : (
        <p className="text-sm text-fg-muted">
          Save the worker details first. Then click Register fingerprint and
          have the worker scan on the selected device. No manual enrollment ID
          is needed.
        </p>
      )}
    </form>
  )
}

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Skeleton, SkeletonList } from "../ui/Skeleton"
import BeforeAfter from "../BeforeAfter"
import {
  categoryLabels,
  compressPhoto,
  severityLabels,
  formatStamp,
  statusDot,
  statusLabels,
  useChecklist,
  usePinEvidence,
  usePinPhotos,
  usePinTimeline,
  useSignedUrl,
  type Pin,
  type PinCategory,
  type PinSeverity,
  type PinPhoto,
  type PinStatus,
  type TimelineEntry,
} from "../../lib/blueprints"
import { useAuth } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { isNetworkProblem } from "../../lib/offlineModel"
import { enqueue } from "../../lib/offlineQueue"
import { disciplineLabels, type Discipline, type TeamMember } from "../../lib/projects"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"

export const field = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"

export function dbMessage(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /row-level security/i.test(error.message)) return "You are not allowed to do that."
  if (/Only an Engineer can change/i.test(error.message)) return "Only an Engineer can change the checklist items; you can tick them off."
  if (/network|fetch/i.test(error.message)) return "Network problem. Check your connection and try again."
  return error.message
}

// ---------- Progress tracker: Not started > In progress > For review > Verified (an Issue interrupts it) ----------
const steps: PinStatus[] = ["not_started", "in_progress", "for_review", "verified"]

// White or dark text, whichever reads better on the status colour (WCAG contrast).
const readableOn = (hex: string) => {
  const channel = (start: number) => {
    const v = parseInt(hex.slice(start, start + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.0598 ? "#ffffff" : "#1c1722"
}

export function ProgressTracker({ status }: { status: PinStatus }) {
  const index = status === "issue" ? 1 : steps.indexOf(status)
  return (
    <div>
      <ol className="flex items-center" aria-label="Progress">
        {steps.map((step, position) => {
          const reached = position <= index
          return (
            <li key={step} className="flex flex-1 items-center last:flex-none">
              <span
                className="flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 text-[11px] font-bold text-white transition-colors"
                style={{ background: reached ? statusDot[step] : "transparent", borderColor: reached ? statusDot[step] : "var(--line)", color: reached ? readableOn(statusDot[step]) : "var(--fg-muted)" }}
                aria-current={position === index ? "step" : undefined}
              >
                {reached ? "✓" : position + 1}
              </span>
              {position < steps.length - 1 ? <span className="mx-1 h-0.5 flex-1 rounded transition-colors" style={{ background: position < index ? statusDot[steps[position + 1]] : "var(--line)" }} /> : null}
            </li>
          )
        })}
      </ol>
      <div className="mt-1 flex justify-between text-[11px] font-semibold text-fg-muted">
        {steps.map((step) => <span key={step} className={step === status ? "text-fg" : ""}>{statusLabels[step]}</span>)}
      </div>
      {status === "issue" ? <p className="mt-2 rounded-lg bg-danger-soft px-2 py-1 text-xs font-semibold text-danger-fg">An issue was found. The engineer will reopen it when it is fixed.</p> : null}
    </div>
  )
}

// ---------- Checklist ----------
export function ChecklistProgress({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2" aria-label={`${done} of ${total} done`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span className="block h-full rounded-full bg-[#1ca875] transition-all" style={{ width: `${percent}%` }} />
      </span>
      <span className="text-xs font-semibold text-fg-muted">{done}/{total}</span>
    </div>
  )
}

export function PinChecklist({ pinId, canEdit, canTick, onChange }: { pinId: string; canEdit: boolean; canTick: boolean; onChange?: (done: number, total: number) => void }) {
  const toast = useToast()
  const { items, setItems, loading, reload } = useChecklist(pinId)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const done = items.filter((item) => item.done).length

  useEffect(() => {
    onChange?.(done, items.length)
  }, [done, items.length, onChange])

  const add = async (event: FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    if (value.length > 200) return toast.error("That item is too long", "Keep it under 200 characters.")
    setBusy(true)
    const { error } = await supabase.from("pin_checklist_items").insert({ pin_id: pinId, project_id: "00000000-0000-0000-0000-000000000000", text: value })
    setBusy(false)
    if (error) return toast.error("Could not add the item", dbMessage(error))
    setText("")
    await reload()
  }

  const tick = async (id: string, value: boolean) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, done: value } : item)))
    const { data, error } = await supabase.from("pin_checklist_items").update({ done: value }).eq("id", id).select("id")
    if (error || !data?.length) {
      toast.error("Could not update the item", error ? dbMessage(error) : "You may not be allowed to tick items on this pin.")
    }
    await reload()
  }

  const remove = async (id: string) => {
    const { error } = await supabase.from("pin_checklist_items").delete().eq("id", id)
    if (error) return toast.error("Could not remove the item", dbMessage(error))
    await reload()
  }

  return (
    <div className="space-y-3">
      {loading ? <SkeletonList rows={3} label="Loading the checklist" /> : (
        <>
          {items.length ? <ChecklistProgress done={done} total={items.length} /> : <p className="text-sm text-fg-muted">{canEdit ? "No checklist yet. Add the steps that must be done before this pin can be verified." : "No checklist for this pin."}</p>}
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id} className="group flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-surface-muted/60">
                <input type="checkbox" className="mt-1 h-4 w-4 flex-none accent-[#9e1f93]" checked={item.done} disabled={!canTick} onChange={(e) => void tick(item.id, e.target.checked)} aria-label={item.text} />
                <span className={`flex-1 text-sm ${item.done ? "text-fg-muted line-through" : ""}`}>
                  {item.text}
                  {item.done_at ? <span className="block text-[11px] text-fg-muted">Done {formatStamp(item.done_at)}</span> : null}
                </span>
                {canEdit ? <button type="button" aria-label={`Remove ${item.text}`} onClick={() => void remove(item.id)} className="px-1 text-fg-muted opacity-0 hover:text-danger-fg focus:opacity-100 group-hover:opacity-100">&times;</button> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {canEdit ? (
        <form className="flex gap-2" onSubmit={(event) => void add(event)}>
          <input className={field + " mt-0"} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a step" maxLength={200} aria-label="New checklist step" />
          <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:opacity-60">Add</button>
        </form>
      ) : null}
    </div>
  )
}

// ---------- Timeline + comments ----------
const describe = (entry: TimelineEntry) => {
  if (entry.kind === "status") return `changed status: ${statusLabels[entry.from_status ?? "not_started"]} → ${statusLabels[entry.to_status ?? "not_started"]}`
  if (entry.kind === "created") return "created the pin"
  if (entry.kind === "moved") return "moved the pin"
  if (entry.kind === "edited") return "edited the details"
  if (entry.kind === "photo") return `added a photo${entry.note ? `: ${entry.note}` : ""}`
  if (entry.kind === "photo_removed") return `removed a photo${entry.note && entry.note !== "Photo removed" ? `: ${entry.note}` : ""}`
  if (entry.kind === "checklist") return entry.note ?? "updated the checklist"
  return "commented"
}

export function PinTimeline({ pinId, canComment, refreshKey = 0 }: { pinId: string; canComment: boolean; refreshKey?: number }) {
  const toast = useToast()
  const { entries, loading, reload } = usePinTimeline(pinId)
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (refreshKey) void reload()
  }, [refreshKey, reload])

  const post = async (event: FormEvent) => {
    event.preventDefault()
    if (!comment.trim()) return
    setBusy(true)
    const { error } = await supabase.from("pin_events").insert({ pin_id: pinId, project_id: "00000000-0000-0000-0000-000000000000", kind: "comment", note: comment.trim().slice(0, 2000) })
    setBusy(false)
    if (error) return toast.error("Could not post the comment", dbMessage(error))
    setComment("")
    await reload()
  }

  return (
    <div className="space-y-3">
      {loading ? <SkeletonList rows={4} label="Loading the timeline" /> : entries.length === 0 ? <p className="text-sm text-fg-muted">No activity yet.</p> : (
        <ol className="space-y-3">
          {[...entries].reverse().map((entry) => (
            <li key={entry.id} className="border-l-2 border-line pl-3 text-sm">
              <span className="font-semibold">{entry.actor_name}</span> <span className="text-fg-muted">{describe(entry)}</span>
              {entry.kind === "comment" && entry.note ? <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-muted px-2 py-1.5">{entry.note}</p> : null}
              <span className="block text-[11px] text-fg-muted">{formatStamp(entry.created_at)}</span>
            </li>
          ))}
        </ol>
      )}
      {canComment ? (
        <form className="flex gap-2" onSubmit={(event) => void post(event)}>
          <input className={field + " mt-0"} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" maxLength={2000} aria-label="Comment" />
          <button type="submit" disabled={busy || !comment.trim()} className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-hover disabled:opacity-60">Post</button>
        </form>
      ) : null}
    </div>
  )
}

// ---------- Photos ----------
function Thumb({ photo, onRemove }: { photo: PinPhoto; onRemove?: () => void }) {
  const { url, failed } = useSignedUrl("pin-photos", photo.path)
  return (
    <figure className="relative">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={photo.caption ?? "Pin photo"} loading="lazy" className="h-24 w-full rounded-lg border border-line object-cover transition hover:opacity-90" />
        </a>
      ) : failed ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-line bg-surface-muted text-xs text-fg-muted">Unavailable</div>
      ) : (
        <Skeleton className="h-24 w-full" />
      )}
      {photo.caption ? <figcaption className="truncate text-[11px] text-fg-muted">{photo.caption}</figcaption> : null}
      {onRemove ? <button type="button" aria-label="Remove photo" onClick={onRemove} className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white hover:bg-black/80">&times;</button> : null}
    </figure>
  )
}

export function PinPhotos({ pin, canAdd, canRemoveAny, meId, onChanged, columns = 3 }: { pin: Pin; canAdd: boolean; canRemoveAny: boolean; meId: string; onChanged?: () => void; columns?: 2 | 3 | 4 }) {
  const toast = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const { photos, reload } = usePinPhotos(pin.id)
  const evidence = usePinEvidence(pin.id, pin.status)
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [savedOffline, setSavedOffline] = useState(0)

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    let added = 0
    for (const file of Array.from(files).slice(0, 5)) {
      if (!file.type.startsWith("image/")) {
        toast.error("Not an image", `${file.name} was skipped.`)
        continue
      }
      try {
        const blob = await compressPhoto(file)
        const path = `${pin.project_id}/${pin.id}/${Date.now()}-${added + savedOffline}.jpg`
        // No signal: keep the compressed photo on this device; it is uploaded when the connection is back.
        const keepOffline = async () => {
          if (!profile) throw new Error("You are signed out.")
          await enqueue({ userId: profile.id, kind: "pin_photo", label: pin.title, payload: { projectId: pin.project_id, pinId: pin.id, path, blob } })
          setSavedOffline((count) => count + 1)
          toast.info("Photo saved on this device", "It will be uploaded when you are back online.")
        }
        if (!navigator.onLine) {
          await keepOffline()
          continue
        }
        const upload = await supabase.storage.from("pin-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false })
        if (upload.error && isNetworkProblem(upload.error)) {
          await keepOffline()
          continue
        }
        if (upload.error) throw new Error(upload.error.message)
        const { error } = await supabase.from("pin_photos").insert({ pin_id: pin.id, project_id: pin.project_id, path })
        if (error) {
          await supabase.storage.from("pin-photos").remove([path])
          throw new Error(error.message)
        }
        added++
      } catch (error) {
        toast.error("Photo not added", error instanceof Error ? dbMessage({ message: error.message }) : "Upload failed.")
      }
    }
    setBusy(false)
    if (fileInput.current) fileInput.current.value = ""
    if (added) {
      toast.success(`${added} photo${added === 1 ? "" : "s"} added`)
      await reload()
      onChanged?.()
    }
  }

  const remove = async (photo: PinPhoto) => {
    if (!(await confirm({ title: "Remove this photo?", confirmLabel: "Remove", tone: "danger" }))) return
    const { error } = await supabase.from("pin_photos").delete().eq("id", photo.id)
    if (error) return toast.error("Could not remove the photo", dbMessage(error))
    await supabase.storage.from("pin-photos").remove([photo.path]) // allowed for the uploader; otherwise the file stays unused
    toast.success("Photo removed")
    await reload()
    onChanged?.()
  }

  const grid = columns === 4 ? "grid-cols-2 sm:grid-cols-4" : columns === 2 ? "grid-cols-2" : "grid-cols-3"
  return (
    <div className="space-y-2">
      {canAdd ? (
        <div>
          <input ref={fileInput} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void add(e.target.files)} />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-muted disabled:opacity-60">{busy ? "Uploading..." : "Add photos"}</button>
        </div>
      ) : null}
      {photos.length === 0 ? <p className="text-sm text-fg-muted">No photos yet.</p> : (
        <>
          {photos.length > 1 ? <BeforeAfter bucket="pin-photos" before={{ path: photos[0].path, at: photos[0].created_at, caption: photos[0].caption }} after={{ path: photos[photos.length - 1].path, at: photos[photos.length - 1].created_at, caption: photos[photos.length - 1].caption }} /> : null}
          <div className={`grid gap-2 ${grid}`}>
            {photos.map((photo) => <Thumb key={photo.id} photo={photo} onRemove={!evidence && (canRemoveAny || photo.uploaded_by === meId) ? () => void remove(photo) : undefined} />)}
          </div>
        </>
      )}
      {evidence && photos.length ? (
        <p className="flex items-start gap-1.5 text-xs text-fg-muted">
          <svg className="mt-0.5 flex-none" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          Evidence locked: this work was sent for review, so its photos stay on record. You can still add new ones.
        </p>
      ) : null}
    </div>
  )
}

// ---------- Edit form (Engineers) ----------
export function PinFields({ pin, team, onSaved, idPrefix = "pin" }: { pin: Pin; team: TeamMember[]; onSaved: () => void; idPrefix?: string }) {
  const toast = useToast()
  const [form, setForm] = useState({ title: pin.title, description: pin.description ?? "", category: pin.category, discipline: (pin.discipline ?? "") as Discipline | "", severity: pin.severity ?? "medium", due_date: pin.due_date ?? "", assigned_to: pin.assigned_to ?? "" })
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({})
  const [busy, setBusy] = useState(false)
  const foremen = team.filter((member) => member.role === "foreman")

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const found: typeof errors = {}
    if (form.title.trim().length < 2 || form.title.trim().length > 120) found.title = "Enter a title between 2 and 120 characters."
    if (form.description.length > 2000) found.description = "Keep the description under 2000 characters."
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    const { data, error } = await supabase
      .from("pins")
      .update({ title: form.title.trim(), description: form.description.trim() || null, category: form.category, discipline: form.discipline || null, severity: form.severity, due_date: form.due_date || null, assigned_to: form.assigned_to || null })
      .eq("id", pin.id)
      .select("id")
    setBusy(false)
    if (error) return toast.error("Pin not saved", dbMessage(error))
    if (!data?.length) return toast.error("Pin not saved", "You may not be allowed to edit this pin.")
    toast.success("Pin saved")
    onSaved()
  }

  return (
    <form id={`${idPrefix}-fields`} className="space-y-3" noValidate onSubmit={(event) => void save(event)}>
      <label className="block text-sm font-semibold">
        Title
        <input className={field} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        {errors.title ? <span className="mt-1 block text-xs font-normal text-danger-fg">{errors.title}</span> : null}
      </label>
      <label className="block text-sm font-semibold">
        Description
        <textarea className={field} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        {errors.description ? <span className="mt-1 block text-xs font-normal text-danger-fg">{errors.description}</span> : null}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">Category
          <select className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as PinCategory })}>
            {(Object.keys(categoryLabels) as PinCategory[]).map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Discipline
          <select className={field} value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value as Discipline | "" })}>
            <option value="">Not set</option>
            {(Object.keys(disciplineLabels) as Discipline[]).map((d) => <option key={d} value={d}>{disciplineLabels[d]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Severity
          <select className={field} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as PinSeverity })}>
            {(Object.keys(severityLabels) as PinSeverity[]).map((s) => <option key={s} value={s}>{severityLabels[s]}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Assigned foreman
          <select className={field} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
            <option value="">Anyone on the project</option>
            {foremen.map((f) => <option key={f.user_id} value={f.user_id}>{f.full_name}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Deadline
          <input className={field} type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </label>
      </div>
      <div className="text-right">
        <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60">{busy ? "Saving..." : "Save changes"}</button>
      </div>
    </form>
  )
}

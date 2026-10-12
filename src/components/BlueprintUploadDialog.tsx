import { useState, type FormEvent } from "react"
import Modal from "./Modal"
import { BLUEPRINT_ACCEPT, uploadBlueprintRevision, validateBlueprintFile, type Blueprint } from "../lib/blueprints"
import { disciplineLabels, type Discipline } from "../lib/projects"

const field = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"

// Upload a new plan, or a new revision of an existing plan (existing is set).
export default function BlueprintUploadDialog({
  projectId,
  existing,
  onClose,
  onDone,
}: {
  projectId: string
  existing?: Blueprint | null
  onClose: () => void
  onDone: (blueprintId: string) => void
}) {
  const [title, setTitle] = useState(existing?.title ?? "")
  const [level, setLevel] = useState(existing?.level ?? "")
  const [discipline, setDiscipline] = useState<Discipline | "">(existing?.discipline ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [page, setPage] = useState(1)
  const [notes, setNotes] = useState("")
  const [errors, setErrors] = useState<{ title?: string; file?: string }>({})
  const [failure, setFailure] = useState("")
  const [step, setStep] = useState("")
  const [busy, setBusy] = useState(false)
  const isPdf = file?.type === "application/pdf"

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: { title?: string; file?: string } = {}
    if (!existing && (title.trim().length < 2 || title.trim().length > 120)) found.title = "Enter a title between 2 and 120 characters."
    const fileProblem = validateBlueprintFile(file)
    if (fileProblem) found.file = fileProblem
    setErrors(found)
    setFailure("")
    if (Object.keys(found).length || !file) return
    setBusy(true)
    try {
      const id = await uploadBlueprintRevision(
        { projectId, blueprintId: existing?.id, title, level, discipline, file, page, notes },
        setStep,
      )
      onDone(id)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Upload failed.")
      setBusy(false)
      setStep("")
    }
  }

  return (
    <Modal title={existing ? `New revision: ${existing.title}` : "Upload a plan"} onClose={busy ? () => undefined : onClose}>
      <form className="space-y-3" noValidate onSubmit={(event) => void submit(event)}>
        {failure ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{failure}</p> : null}
        {!existing ? (
          <>
            <label className="block text-sm font-semibold">
              Plan title *
              <input className={field} maxLength={120} placeholder="Ground floor - general arrangement" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
              {errors.title ? <span className="mt-1 block text-xs font-normal text-danger-fg">{errors.title}</span> : null}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">
                Level / area
                <input className={field} maxLength={40} placeholder="L01" value={level} onChange={(e) => setLevel(e.target.value)} disabled={busy} />
              </label>
              <label className="block text-sm font-semibold">
                Discipline
                <select className={field} value={discipline} onChange={(e) => setDiscipline(e.target.value as Discipline | "")} disabled={busy}>
                  <option value="">Not set</option>
                  {(Object.keys(disciplineLabels) as Discipline[]).map((d) => (
                    <option key={d} value={d}>{disciplineLabels[d]}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-fg-muted">The new file becomes revision {(existing.blueprint_revisions[0]?.revision ?? 0) + 1}. Earlier revisions are kept and pins stay on the plan.</p>
        )}
        <label className="block text-sm font-semibold">
          File (PDF, PNG, JPEG or WebP, up to 25 MB) *
          <input className={field} type="file" accept={BLUEPRINT_ACCEPT} disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors((c) => ({ ...c, file: undefined })) }} />
          {errors.file ? <span className="mt-1 block text-xs font-normal text-danger-fg">{errors.file}</span> : null}
        </label>
        <p className="text-xs text-fg-muted">Working from CAD? Export the sheet as PDF or PNG first; DWG/DXF files cannot be shown in the browser.</p>
        {isPdf ? (
          <label className="block text-sm font-semibold">
            PDF page to use
            <input className={field} type="number" min={1} max={999} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} disabled={busy} />
          </label>
        ) : null}
        <label className="block text-sm font-semibold">
          Notes (what changed)
          <textarea className={field} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy} />
        </label>
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-fg-muted">{busy ? step : ""}</span>
          <button type="submit" disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60">
            {busy ? "Uploading..." : existing ? "Upload revision" : "Upload plan"}
          </button>
        </div>
      </form>
    </Modal>
  )
}

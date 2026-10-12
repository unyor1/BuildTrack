import { useEffect, useRef, useState, type FormEvent } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import Modal from "../../components/Modal"
import { EmptyState, PageHead, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { Chip } from "../../components/qa/QaBits"
import DataConfirmModal from "../../components/PrivacyNotice"
import { SnagPhotoStrip } from "../../components/qa/SnagParts"
import { useConfirm } from "../../lib/confirm"
import { getSelectedProjectId } from "../../lib/projects"
import { fixStageText, refNumber, snagStatusLabels, snagTone, urgencies, urgencyLabels, type Urgency } from "../../lib/qaModel"
import { snagActions, uploadSnagPhoto, useSnagPhotos, useSnags, type Snag } from "../../lib/snags"
import { errorText, useToast } from "../../lib/toast"
import type { ClientPageProps } from "./types"

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const label = "mb-1 block text-xs font-extrabold uppercase tracking-wider text-fg-muted"

// The client reports something wrong in plain words, with photos. The engineer looks at it, accepts it (the team fixes it) or explains
// why not, and the client can follow the repair until it is checked.
export default function ClientSnagSubmission(_: ClientPageProps) {
  const projectId = getSelectedProjectId()
  const { snags, loading, error, reload } = useSnags(projectId)
  const toast = useToast()
  const confirm = useConfirm()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [urgency, setUrgency] = useState<Urgency>("normal")
  const [files, setFiles] = useState<File[]>([])
  const [problem, setProblem] = useState("")
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Snag | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const wanted = useRef(new URLSearchParams(window.location.search).get("snag"))

  useEffect(() => {
    if (!wanted.current || loading) return
    const target = snags.find((row) => row.id === wanted.current)
    wanted.current = null
    if (target) setOpen(target)
  }, [loading, snags])

  const [confirming, setConfirming] = useState(false)
  const review = (event: FormEvent) => {
    event.preventDefault()
    if (!projectId) return
    if (title.trim().length < 3) return setProblem("Say briefly what is wrong (at least 3 characters).")
    setProblem("")
    setConfirming(true)
  }

  const submit = async () => {
    if (!projectId) return
    setBusy(true)
    const result = await snagActions.submit({ projectId, title: title.trim(), description: description.trim(), location: location.trim(), urgency })
    if (!result.ok) {
      setBusy(false)
      setConfirming(false)
      setProblem(result.message)
      return toast.error("Report not sent", result.message)
    }
    let failed = 0
    for (const file of files.slice(0, 4)) {
      try {
        await uploadSnagPhoto(projectId, result.data, file)
      } catch (uploadError) {
        failed++
        if (failed === 1) toast.error("A photo was not added", errorText(uploadError))
      }
    }
    setBusy(false)
    setConfirming(false)
    toast.success("Report sent", "The engineer is notified. You will see the answer here.")
    setTitle("")
    setDescription("")
    setLocation("")
    setUrgency("normal")
    setFiles([])
    await reload()
  }

  const withdraw = async (snag: Snag) => {
    if (!(await confirm({ title: "Withdraw this report?", message: "The engineer will no longer see it as waiting.", confirmLabel: "Withdraw" }))) return
    const result = await snagActions.withdraw(snag.id)
    if (!result.ok) return toast.error("Not withdrawn", result.message)
    toast.success("Report withdrawn")
    setOpen(null)
    await reload()
  }

  return (
    <div className="client-page">
      <ProjectContextBar listPath="/client/overview" listLabel="My projects" />
      <PageHead eyebrow="Report a problem" title="Tell the team what needs attention" description="Describe it in your own words and add photos. The project engineer reviews it, and you can follow the repair here." />
      {!projectId ? null : (
        <>
          <form onSubmit={review} noValidate className="mb-6 grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <div><label className={label} htmlFor="snag-title">What is wrong</label><input id="snag-title" className={inputClass} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Crack above the door in room 204" /></div>
            <div><label className={label} htmlFor="snag-desc">Details (optional)</label><textarea id="snag-desc" rows={3} maxLength={2000} className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="How big, when you noticed it, anything the team should know" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label} htmlFor="snag-where">Where (optional)</label><input id="snag-where" className={inputClass} maxLength={200} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Floor, room or area" /></div>
              <div><label className={label} htmlFor="snag-urgency">How urgent is it</label><select id="snag-urgency" className={inputClass} value={urgency} onChange={(event) => setUrgency(event.target.value as Urgency)}>{urgencies.map((value) => <option key={value} value={value}>{urgencyLabels[value]}</option>)}</select></div>
            </div>
            <div>
              <p className={label}>Photos (up to 4)</p>
              <div className="flex flex-wrap items-center gap-2">
                {files.map((file, index) => (
                  <span key={index} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-semibold">{file.name.slice(0, 18)}<button type="button" aria-label={`Remove ${file.name}`} className="text-fg-muted hover:text-fg" onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}>×</button></span>
                ))}
                {files.length < 4 ? <button type="button" className={buttonSecondary + " !py-1.5 !text-xs"} onClick={() => picker.current?.click()}>Add a photo</button> : null}
                <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" multiple hidden onChange={(event) => { const chosen = Array.from(event.target.files ?? []); setFiles((current) => [...current, ...chosen].slice(0, 4)); if (picker.current) picker.current.value = "" }} />
              </div>
            </div>
            {problem ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{problem}</p> : null}
            <div className="flex justify-end"><button type="submit" className={buttonPrimary} disabled={busy}>{busy ? "Sending..." : "Send report"}</button></div>
          </form>

          {confirming ? (
            <DataConfirmModal title="Check your report" description="This goes to the project engineer." scope="client_report" rows={[{ label: "What is wrong", value: title.trim() }, { label: "Details", value: description.trim() }, { label: "Where", value: location.trim() }, { label: "Urgency", value: urgencyLabels[urgency] }, { label: "Photos", value: files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} (they may show people or private areas)` : "" }]} confirmLabel="Send report" busy={busy} onConfirm={submit} onClose={() => !busy && setConfirming(false)} />
          ) : null}

          <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Your reports</h2>
          {error ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p> : null}
          {loading ? <SkeletonList rows={3} label="Loading your reports" /> : snags.length === 0 ? (
            <EmptyState title="No reports yet">When you report a problem it appears here with its progress.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {snags.map((snag) => (
                <li key={snag.id}>
                  <button type="button" onClick={() => setOpen(snag)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:bg-surface-muted">
                    <span className="min-w-0"><span className="block truncate text-sm font-extrabold">{snag.title}</span><span className="text-xs text-fg-muted">{refNumber("snag", snag.number)} • {when(snag.created_at)} • {fixStageText(snag.status, snag.fix_stage)}</span></span>
                    <Chip tone={snagTone[snag.status]}>{snagStatusLabels[snag.status]}</Chip>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {open ? <ClientSnagModal snag={snags.find((row) => row.id === open.id) ?? open} onClose={() => setOpen(null)} onWithdraw={() => void withdraw(open)} /> : null}
    </div>
  )
}

function ClientSnagModal({ snag, onClose, onWithdraw }: { snag: Snag; onClose: () => void; onWithdraw: () => void }) {
  const { photos } = useSnagPhotos(snag.id)
  return (
    <Modal title={`${refNumber("snag", snag.number)}  ${snag.title}`} description={`${when(snag.created_at)} • ${urgencyLabels[snag.urgency]}${snag.location ? ` • ${snag.location}` : ""}`} size="lg" onClose={onClose}
      footer={<>{snag.status === "submitted" ? <button type="button" className={buttonSecondary} onClick={onWithdraw}>Withdraw</button> : null}<button type="button" className={buttonSecondary} onClick={onClose}>Close</button></>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Chip tone={snagTone[snag.status]}>{snagStatusLabels[snag.status]}</Chip><span className="text-sm">{fixStageText(snag.status, snag.fix_stage)}</span></div>
        {snag.description ? <p className="whitespace-pre-wrap text-sm">{snag.description}</p> : null}
        {snag.response ? <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm"><strong>The engineer wrote:</strong> {snag.response}</p> : null}
        {photos.length ? <SnagPhotoStrip photos={photos} /> : null}
      </div>
    </Modal>
  )
}

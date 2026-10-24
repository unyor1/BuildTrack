import { useEffect, useRef, useState, type FormEvent } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, PageHead, buttonPrimary, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { Chip } from "../../components/qa/QaBits"
import DataConfirmModal from "../../components/PrivacyNotice"
import { ClientSnagModal } from "../../components/qa/SnagParts"
import PinLinkPicker from "../../components/ui/PinLinkPicker"
import IssuePhotoPicker from "../../components/issues/IssuePhotoPicker"
import type { IssuePhotoDraft } from "../../lib/siteIssues"
import { useProjectWork } from "../../lib/projectWork"
import { pinLinkProblem, startPinLink, type PinLink } from "../../lib/pinPickerModel"
import { useConfirm } from "../../lib/confirm"
import { getSelectedProjectId } from "../../lib/projects"
import { fixStageText, refNumber, snagStatusLabels, snagTone, urgencies, urgencyLabels, type Urgency } from "../../lib/qaModel"
import { snagActions, uploadSnagPhoto, useSnags, type Snag } from "../../lib/snags"
import { errorText, useToast } from "../../lib/toast"
import type { ClientPageProps } from "./types"

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
const label = "mb-1 block text-xs font-extrabold uppercase tracking-wider text-fg-muted"

// The client reports something wrong in plain words, with photos. The engineer looks at it, accepts it (the team fixes it) or explains
// why not, and the client can follow the repair until it is checked.
export default function ClientSnagSubmission(_: ClientPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const { snags, loading, error, reload } = useSnags(projectId)
  const toast = useToast()
  const confirm = useConfirm()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [urgency, setUrgency] = useState<Urgency>("normal")
  const [photos, setPhotos] = useState<IssuePhotoDraft[]>([])
  // From a pin panel the pin arrives in ?pin=; otherwise the client picks sheet and pin, or leaves it Project-wide.
  const [link, setLink] = useState<PinLink>(() => startPinLink(work.pins, new URLSearchParams(window.location.search).get("pin")))
  const wantedPin = useRef(new URLSearchParams(window.location.search).get("pin"))
  useEffect(() => {
    if (!wantedPin.current || work.loading) return
    setLink(startPinLink(work.pins, wantedPin.current))
    wantedPin.current = null
  }, [work.loading, work.pins])
  const pinId = link.pinId
  const [pendingReport, setPendingReport] = useState<string | null>(null)
  const [attachedCount, setAttachedCount] = useState(0)
  const [problem, setProblem] = useState("")
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Snag | null>(null)
  const sending = useRef(false)
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
    const linkProblem = pinLinkProblem(link, { projectId, pins: work.pins, items: [], requirePin: false })
    if (linkProblem) return setProblem(linkProblem)
    setProblem("")
    setConfirming(true)
  }

  const submit = async () => {
    if (!projectId || sending.current) return
    sending.current = true
    setBusy(true)
    const result = pendingReport ? { ok: true as const, data: pendingReport } : await snagActions.submit({ projectId, title: title.trim(), description: description.trim(), location: location.trim(), urgency, pinId })
    if (!result.ok) {
      sending.current = false
      setBusy(false)
      setConfirming(false)
      setProblem(result.message)
      return toast.error("Report not sent", result.message)
    }
    setPendingReport(result.data)
    const failed: IssuePhotoDraft[] = []
    for (const photo of photos) {
      try {
        await uploadSnagPhoto(projectId, result.data, photo.file, photo.annotations, photo.caption)
      } catch (uploadError) {
        failed.push(photo)
        if (failed.length === 1) toast.error("A photo was not added", errorText(uploadError))
      }
    }
    setBusy(false)
    sending.current = false
    setConfirming(false)
    setAttachedCount(count => count + photos.length - failed.length)
    if (failed.length) {
      setPhotos(failed)
      setProblem(`Your report was saved. ${failed.length} photo(s) still need uploading. Retry to attach them to the same report, or remove them and finish.`)
      await reload()
      return
    }
    toast.success("Report sent", "The engineer is notified. You will see the answer here.")
    setTitle("")
    setDescription("")
    setLocation("")
    setUrgency("normal")
    setPhotos([]); setLink(startPinLink(work.pins, null)); setPendingReport(null); setAttachedCount(0); setProblem("")
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
      <ProjectContextBar listPath="/client/overview" listLabel="Overview" />
      <PageHead eyebrow="Report a problem" title="Tell the team what needs attention" description="Describe it in your own words and add photos. The project engineer reviews it, and you can follow the repair here." />
      {!projectId ? null : (
        <>
          <form onSubmit={review} noValidate className="mb-6 grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <fieldset disabled={busy || Boolean(pendingReport)} className="grid min-w-0 gap-4 disabled:opacity-70">
            <div><label className={label} htmlFor="snag-title">What is wrong</label><input id="snag-title" className={inputClass} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Crack above the door in room 204" /></div>
            <div><label className={label} htmlFor="snag-desc">Details (optional)</label><textarea id="snag-desc" rows={3} maxLength={2000} className={inputClass} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="How big, when you noticed it, anything the team should know" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={label} htmlFor="snag-where">Where (optional)</label><input id="snag-where" className={inputClass} maxLength={200} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Floor, room or area" /></div>
              <div><label className={label} htmlFor="snag-urgency">How urgent is it</label><select id="snag-urgency" className={inputClass} value={urgency} onChange={(event) => setUrgency(event.target.value as Urgency)}>{urgencies.map((value) => <option key={value} value={value}>{urgencyLabels[value]}</option>)}</select></div>
            </div>
            <PinLinkPicker projectId={projectId} sheets={work.blueprints} pins={work.pins} value={link} onChange={setLink} allowProjectWide showItem={false} disabled={work.loading || Boolean(work.error)} pinLabel="Work pin on the blueprint" />
            </fieldset>
            {work.error ? <p role="alert" className="text-sm text-danger-fg">{work.error} <button type="button" onClick={() => void work.reload()} className="underline">Retry work pins</button></p> : null}
            <IssuePhotoPicker photos={photos} onChange={setPhotos} limit={4 - attachedCount} disabled={busy} />
            {problem ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{problem}</p> : null}
            <div className="flex justify-end"><button type="submit" className={buttonPrimary} disabled={busy || work.loading}>{busy ? "Sending..." : pendingReport ? "Finish / retry remaining photos" : "Send report"}</button></div>
          </form>

          {confirming ? (
            <DataConfirmModal title="Check your report" description="This goes to the project engineer. Original photos and your annotations are saved separately." scope="client_report" rows={[{ label: "What is wrong", value: title.trim() }, { label: "Details", value: description.trim() }, { label: "Work pin", value: work.pins.find(pin => pin.id === pinId)?.title ?? "Project-wide (not one pin)" }, { label: "Where", value: location.trim() }, { label: "Urgency", value: urgencyLabels[urgency] }, { label: "Photos", value: `${photos.length} photo(s), including saved annotations` }]} confirmLabel={pendingReport ? "Finish uploading" : "Send report"} busy={busy} onConfirm={submit} onClose={() => !busy && setConfirming(false)} />
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

      {open ? <ClientSnagModal key={open.id} snag={snags.find((row) => row.id === open.id) ?? open} onClose={() => setOpen(null)} onWithdraw={() => void withdraw(open)} /> : null}
    </div>
  )
}

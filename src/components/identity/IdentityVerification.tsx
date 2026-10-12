import { useEffect, useMemo, useRef, useState } from "react"
import Modal from "../Modal"
import DataConfirmModal, { PrivacyNoticeModal } from "../PrivacyNotice"
import { useAuth } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { detailsProblem, fileProblem, idTypeLabel, idTypes, identityActions, identityStatusLabel, identityTone, removeIdentityPhotos, uploadIdentityPhoto, useMyVerifications, type IdentityDraft, type IdType } from "../../lib/identity"
import { PRIVACY_VERSION } from "../../lib/privacy"
import { manilaToday } from "../../lib/progress"
import { errorText, useToast } from "../../lib/toast"

const field = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
const label = "block text-xs font-extrabold uppercase tracking-wider text-fg-muted"
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60"
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text disabled:opacity-60"
const when = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" })

type Slot = { file: File | null; url: string | null }

function PhotoSlot({ title, hint, slot, onPick, required = true }: { title: string; hint: string; slot: Slot; onPick: (file: File | null) => void; required?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const problem = slot.file ? fileProblem(slot.file) : ""
  return (
    <div className="rounded-xl border border-line p-3">
      <p className={label}>{title}{required ? "" : " (optional)"}</p>
      <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex h-24 w-36 flex-none items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-surface-muted">
          {slot.url ? <img src={slot.url} alt={`${title} preview`} className="h-full w-full object-cover" /> : <span className="text-xs text-fg-muted">No photo yet</span>}
        </div>
        <div className="space-y-1.5">
          <button type="button" className={secondary + " !py-1.5 !text-xs"} onClick={() => input.current?.click()}>{slot.file ? "Retake / choose again" : "Take or choose a photo"}</button>
          {slot.file ? <button type="button" className="block text-xs font-bold text-danger-fg underline" onClick={() => onPick(null)}>Remove</button> : null}
          {problem ? <p role="alert" className="text-xs font-bold text-danger-fg">{problem}</p> : null}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => { const chosen = event.target.files?.[0] ?? null; onPick(chosen); if (input.current) input.current.value = "" }} />
      </div>
    </div>
  )
}

// Three steps: details, photos, then a "check your information" confirmation with the data privacy notice before anything is sent.
export function IdentityWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void | Promise<void> }) {
  const { profile } = useAuth()
  const toast = useToast()
  const today = manilaToday()
  const [step, setStep] = useState<1 | 2>(1)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState("")
  const [draft, setDraft] = useState<IdentityDraft>({ legalName: profile?.full_name ?? "", birthDate: "", address: "", phone: profile?.phone ?? "", idType: "", idLast4: "", idExpiry: "" })
  const [front, setFront] = useState<Slot>({ file: null, url: null })
  const [back, setBack] = useState<Slot>({ file: null, url: null })
  const [selfie, setSelfie] = useState<Slot>({ file: null, url: null })
  const hasBack = idTypes.find((item) => item.value === draft.idType)?.hasBack ?? true

  // Free the preview pictures when the dialog closes.
  const urls = useRef<string[]>([])
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const pick = (set: (slot: Slot) => void) => (file: File | null) => {
    const url = file ? URL.createObjectURL(file) : null
    if (url) urls.current.push(url)
    set({ file, url })
  }
  const set = <K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const next = () => {
    const issue = detailsProblem(draft, today)
    if (issue) return setProblem(issue)
    setProblem("")
    setStep(2)
  }

  const review = () => {
    const issue = fileProblem(front.file) || (hasBack ? fileProblem(back.file) : "") || fileProblem(selfie.file)
    if (!front.file) return setProblem("Add a photo of the front of your ID.")
    if (hasBack && !back.file) return setProblem("Add a photo of the back of your ID.")
    if (!selfie.file) return setProblem("Add a selfie holding your ID next to your face.")
    if (issue) return setProblem(issue)
    setProblem("")
    setConfirming(true)
  }

  const rows = useMemo(
    () => [
      { label: "Legal name", value: draft.legalName.trim() },
      { label: "Birth date", value: draft.birthDate },
      { label: "Address", value: draft.address.trim() },
      { label: "Phone", value: draft.phone.trim() },
      { label: "ID type", value: idTypeLabel(draft.idType) },
      { label: "ID number", value: draft.idLast4 ? `ends with ${draft.idLast4.toUpperCase()}` : "" },
      { label: "ID expires", value: draft.idExpiry },
      { label: "Photos", value: `ID front${hasBack ? ", ID back" : ""}, selfie with ID` },
    ],
    [draft, hasBack],
  )

  const send = async () => {
    if (!profile || !front.file || !selfie.file) return
    setBusy(true)
    const uploaded: Array<string | null> = []
    try {
      const frontPath = await uploadIdentityPhoto(profile.id, "front", front.file)
      uploaded.push(frontPath)
      const backPath = hasBack && back.file ? await uploadIdentityPhoto(profile.id, "back", back.file) : null
      uploaded.push(backPath)
      const selfiePath = await uploadIdentityPhoto(profile.id, "selfie", selfie.file)
      uploaded.push(selfiePath)
      const result = await identityActions.submit({ legalName: draft.legalName.trim(), birthDate: draft.birthDate, address: draft.address.trim(), phone: draft.phone.trim(), idType: draft.idType, idLast4: draft.idLast4.trim(), idExpiry: draft.idExpiry, front: frontPath, back: backPath, selfie: selfiePath, consentVersion: PRIVACY_VERSION })
      if (!result.ok) throw new Error(result.message)
      toast.success("Sent for review", "An administrator will check your documents.")
      await onDone()
    } catch (error) {
      await removeIdentityPhotos(uploaded) // do not leave pictures behind when the submission failed
      setConfirming(false)
      setProblem(errorText(error))
      toast.error("Not sent", errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        title="Verify your identity"
        description={step === 1 ? "Step 1 of 2: your details" : "Step 2 of 2: your documents"}
        size="lg"
        onClose={onClose}
        closeOnBackdrop={false}
        footer={
          step === 1 ? (
            <><button type="button" className={secondary} onClick={onClose}>Cancel</button><button type="button" className={primary} onClick={next}>Next: documents</button></>
          ) : (
            <><button type="button" className={secondary} onClick={() => { setProblem(""); setStep(1) }}>Back</button><button type="button" className={primary} onClick={review}>Review and send</button></>
          )
        }
      >
        <div className="mb-4 flex gap-1" aria-hidden="true">{[1, 2].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-brand" : "bg-surface-muted"}`} />)}</div>
        {step === 1 ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-fg-muted">We check that you are a real person before giving access to project data. Use your real details exactly as on your ID. Only you and administrators who approve users can see this information.</p>
            <div><label className={label} htmlFor="iv-name">Full legal name</label><input id="iv-name" className={field} value={draft.legalName} onChange={(event) => set("legalName", event.target.value)} autoComplete="name" maxLength={120} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={label} htmlFor="iv-birth">Date of birth</label><input id="iv-birth" type="date" max={today} className={field} value={draft.birthDate} onChange={(event) => set("birthDate", event.target.value)} autoComplete="bday" /></div>
              <div><label className={label} htmlFor="iv-phone">Phone number</label><input id="iv-phone" type="tel" className={field} value={draft.phone} onChange={(event) => set("phone", event.target.value)} autoComplete="tel" placeholder="+63 912 345 6789" /></div>
            </div>
            <div><label className={label} htmlFor="iv-address">Home address</label><input id="iv-address" className={field} value={draft.address} onChange={(event) => set("address", event.target.value)} autoComplete="street-address" maxLength={250} placeholder="Street, barangay, city, province" /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1"><label className={label} htmlFor="iv-type">Type of ID</label><select id="iv-type" className={field} value={draft.idType} onChange={(event) => set("idType", event.target.value as IdType)}><option value="">Choose...</option>{idTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
              <div><label className={label} htmlFor="iv-last">Last 4 of the ID number</label><input id="iv-last" className={field} value={draft.idLast4} maxLength={4} onChange={(event) => set("idLast4", event.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="e.g. 4821" /></div>
              <div><label className={label} htmlFor="iv-expiry">ID expiry (if any)</label><input id="iv-expiry" type="date" min={today} className={field} value={draft.idExpiry} onChange={(event) => set("idExpiry", event.target.value)} /></div>
            </div>
            <p className="text-xs text-fg-muted">We never store the full ID number, only its last characters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-fg-muted">Good photos are approved faster: all four corners visible, no glare or blur, the text readable. The selfie must show your face and the ID together.</p>
            <PhotoSlot title="ID: front" hint="Place the ID flat on a plain surface in good light." slot={front} onPick={pick(setFront)} />
            {hasBack ? <PhotoSlot title="ID: back" hint="The back side, with any address or barcode." slot={back} onPick={pick(setBack)} /> : <p className="text-xs text-fg-muted">A passport has no back side to upload.</p>}
            <PhotoSlot title="Selfie holding your ID" hint="Hold the ID next to your face. Do not cover your face or the ID." slot={selfie} onPick={pick(setSelfie)} />
          </div>
        )}
        {problem ? <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-fg">{problem}</p> : null}
      </Modal>
      {confirming ? (
        <DataConfirmModal title="Check your information" description="You are about to send your details and ID photos to the administrators for review." scope="identity" rows={rows} confirmLabel="Send for verification" busy={busy} onConfirm={send} onClose={() => !busy && setConfirming(false)} />
      ) : null}
    </>
  )
}

// The card on the account home: where the person stands and what to do next.
export function IdentityCard() {
  const { profile, refreshProfile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { items, loading, reload } = useMyVerifications(profile?.id ?? null)
  const [open, setOpen] = useState(false)
  const [reading, setReading] = useState(false)
  const status = profile?.identity_status ?? "unverified"
  const latest = items[0] ?? null

  // While waiting, re-check every 30 s so the approval shows without a refresh.
  useEffect(() => {
    if (status !== "pending") return
    const timer = window.setInterval(() => {
      void reload()
      void refreshProfile()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [status, reload, refreshProfile])

  const done = async () => {
    setOpen(false)
    await Promise.all([reload(), refreshProfile()])
  }

  const withdraw = async () => {
    if (!latest || latest.status !== "submitted") return
    if (!(await confirm({ title: "Withdraw this submission?", message: "Your documents will not be reviewed. You can submit again later.", confirmLabel: "Withdraw", cancelLabel: "Keep it" }))) return
    const result = await identityActions.withdraw(latest.id)
    if (!result.ok) return toast.error("Could not withdraw", result.message)
    toast.success("Submission withdrawn")
    await done()
  }

  if (status === "verified" && !loading && !latest) return null
  return (
    <section aria-label="Identity verification" className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold">Identity verification</h2>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">
            {status === "verified" ? `You were verified${profile?.identity_verified_at ? ` on ${when(profile.identity_verified_at)}` : ""}.`
              : status === "pending" ? "An administrator is checking your documents. This usually takes a day."
              : status === "rejected" ? "Your last submission could not be approved. Fix what is listed below and send it again."
              : "Before you can ask for Engineer, Foreman or Client access, an administrator needs to confirm who you are. It takes about five minutes."}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${identityTone[status]}`}>{identityStatusLabel[status]}</span>
      </div>
      {status === "rejected" && latest?.decision_note ? <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg"><strong>What to correct:</strong> {latest.decision_note}</p> : null}
      {status === "unverified" || status === "rejected" ? (
        <>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {[["1", "Your details", "Legal name, birth date, address"], ["2", "Photos", "Government ID (front and back) and a selfie holding it"], ["3", "Review", "Check it, accept the data privacy notice, send"]].map(([n, title, text]) => (
              <li key={n} className="rounded-xl bg-surface-muted p-3"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{n}</span><strong>{title}</strong><p className="mt-1 text-xs text-fg-muted">{text}</p></li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className={primary} onClick={() => setOpen(true)}>{status === "rejected" ? "Correct and send again" : "Start verification"}</button>
            <button type="button" className="text-xs font-bold text-brand-text underline" onClick={() => setReading(true)}>How your documents are protected</button>
          </div>
        </>
      ) : null}
      {status === "pending" && latest?.status === "submitted" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-fg-muted">Sent {when(latest.submitted_at)} • {idTypeLabel(latest.id_type)} ending {latest.id_last4}</span>
          <button type="button" className={secondary + " !py-1 !text-xs"} onClick={() => void withdraw()}>Withdraw</button>
        </div>
      ) : null}
      {open ? <IdentityWizard onClose={() => setOpen(false)} onDone={done} /> : null}
      {reading ? <PrivacyNoticeModal scope="identity" onClose={() => setReading(false)} /> : null}
    </section>
  )
}

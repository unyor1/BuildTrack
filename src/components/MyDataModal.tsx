import { useState } from "react"
import Modal from "./Modal"
import { useAuth } from "../lib/auth"
import { useConfirm } from "../lib/confirm"
import { requestErasure, useMyDataRequests, withdrawErasure } from "../lib/dataRequests"
import { formatDate } from "../lib/admin"
import { errorText, useToast } from "../lib/toast"

const buttonDanger = "rounded-lg bg-[#d93a3a] px-4 py-2 text-sm font-bold text-white hover:bg-[#b82f2f] disabled:opacity-60"
const buttonSecondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text disabled:opacity-60"

// "Delete my data": the person asks, an administrator carries it out. Explains what goes and what stays before anything is sent.
export default function MyDataModal({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { rows, reload } = useMyDataRequests(profile?.id)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const open = rows?.find((row) => row.status === "open")
  const last = rows?.find((row) => row.status !== "open")

  const send = async () => {
    if (!(await confirm({ title: "Ask to delete your data?", message: "An administrator will review this. When it is carried out your account is closed and you can no longer sign in. This cannot be undone.", confirmLabel: "Send request", tone: "danger" }))) return
    setBusy(true)
    try {
      const problem = await requestErasure(reason)
      if (problem) return toast.error("Request not sent", problem)
      toast.success("Request sent", "You will be notified when it is decided.")
      setReason("")
      await reload()
    } catch (error) {
      toast.error("Request not sent", errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const withdraw = async () => {
    if (!open) return
    setBusy(true)
    const problem = await withdrawErasure(open.id)
    setBusy(false)
    if (problem) return toast.error("Not withdrawn", problem)
    toast.success("Request withdrawn")
    await reload()
  }

  const privileged = profile?.role === "super_admin" || profile?.role === "admin"

  return (
    <Modal title="Delete my data" description="Your right under the Data Privacy Act (RA 10173)" size="md" onClose={onClose} footer={<button type="button" className={buttonSecondary} onClick={onClose}>Close</button>}>
      <div className="space-y-4 text-sm">
        <section>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">What is deleted</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Your name, phone, company, job title and profile photo</li>
            <li>Your ID photos, selfie and identity details</li>
            <li>Your notifications, access requests and your sign-in email</li>
          </ul>
        </section>
        <section>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">What stays</h3>
          <p className="mt-1">Site records you helped create (reports, pin updates, inspections) belong to the project. They stay, shown as "Deleted account". The audit trail and your privacy consent record also stay, as the law requires.</p>
        </section>
        {privileged ? (
          <p className="rounded-lg bg-surface-muted p-3">Administrator accounts cannot use this form. Ask a Super Admin to change your role first.</p>
        ) : open ? (
          <div className="rounded-lg border border-line bg-surface-muted p-3">
            <p className="font-bold">Request waiting since {formatDate(open.created_at)}</p>
            <p className="mt-1 text-fg-muted">An administrator will review it. You can withdraw it until then.</p>
            <button type="button" className={`${buttonSecondary} mt-3`} disabled={busy} onClick={() => void withdraw()}>Withdraw request</button>
          </div>
        ) : (
          <>
            {last?.status === "declined" ? <p className="rounded-lg bg-danger-soft p-3 text-danger-fg">Your last request was not carried out: {last.decision_note}</p> : null}
            <label className="block font-semibold">
              Why are you asking? <span className="font-normal text-fg-muted">(optional)</span>
              <textarea value={reason} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg" />
            </label>
            <button type="button" className={buttonDanger} disabled={busy || rows === null} onClick={() => void send()}>Ask to delete my data</button>
          </>
        )}
      </div>
    </Modal>
  )
}

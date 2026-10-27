import { useRef, useState } from "react"
import { useAuth } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { qaActions, refNumber, type Defect, type Inspection } from "../../lib/qa"
import { useCorrectionInspection } from "../../lib/qaReinspection"
import { correctionCloseProblem } from "../../lib/qaReinspectionModel"
import { useToast } from "../../lib/toast"
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"

// Package NCR decisions belong to their exact linked inspection, not the NCR evidence/detail dialog.
export default function NcrInspectionVerification({ defect, inspection, canVerify, onChanged }: {
  defect: Defect; inspection: Inspection; canVerify: boolean; onChanged: () => void | Promise<void>
}) {
  const { profile } = useAuth()
  const allowed = canVerify && profile?.role === "engineer" && profile.status === "active"
    && defect.project_id === inspection.project_id && defect.pin_id === inspection.pin_id && defect.status === "for_verification"
  const linked = useCorrectionInspection(defect.id, allowed ? defect.correction_attempt_id ?? null : null)
  const confirm = useConfirm()
  const toast = useToast()
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  if (!allowed || !defect.correction_attempt_id) return null
  const ref = refNumber("ncr", defect.number)
  if (linked.loading || linked.error) return <p role={linked.error ? "alert" : "status"} className="rounded-lg border border-line p-3 text-xs text-fg-muted">
    {ref}: {linked.error || "Checking the linked correction inspection…"}
    {linked.error ? <button type="button" className="ml-2 font-bold underline" onClick={() => void linked.reload()}>Retry</button> : null}
  </p>
  if (linked.id !== inspection.id) return null
  const signedOff = ["passed", "failed", "conditional"].includes(inspection.status)
  const closeProblem = !signedOff ? "Sign off this inspection and record a Pass for this finding before closing its NCR."
    : correctionCloseProblem(defect.correction_attempt_id, linked.status, linked.error, linked.loading, linked.ready)
  const decide = async (close: boolean) => {
    if (pending.current || note.trim().length < 5 || (close && closeProblem)) return
    pending.current = true; setBusy(true)
    try {
      if (close && !(await confirm({ title: `Close ${ref}?`, message: "Closing confirms the corrected work meets the requirement. This does not complete the checklist.", confirmLabel: "Close NCR" }))) return
      const result = await qaActions.verifyDefect(defect.id, close, note.trim())
      if (!result.ok) throw new Error(result.message)
      toast.success(close ? `${ref} closed` : `${ref} sent back`)
      setNote("")
      await Promise.all([onChanged(), linked.reload()])
    } catch (error) { toast.error("NCR decision not saved", (error as Error).message) }
    finally { pending.current = false; setBusy(false) }
  }
  return <section aria-label={`Verify ${ref} correction`} className="space-y-3 rounded-xl border border-brand p-3">
    <h3 className="text-sm font-extrabold">{ref} · {defect.title}</h3>
    {closeProblem ? <p role="status" className="text-xs font-semibold text-amber-800 dark:text-amber-300">{closeProblem}</p>
      : <p className="text-xs text-fg-muted">This finding has a signed-off Pass. Closing this NCR does not complete the checklist or resolve other findings.</p>}
    <label className="block text-xs font-bold text-fg-muted" htmlFor={`verify-${defect.id}`}>Verification note
      <textarea id={`verify-${defect.id}`} rows={2} maxLength={1000} className={`${inputClass} mt-1`} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="What was verified, or what still needs correction (at least 5 characters)" />
    </label>
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className={buttonSecondary} disabled={busy || note.trim().length < 5} onClick={() => void decide(false)}>Send back</button>
      <button type="button" className={buttonPrimary} disabled={busy || note.trim().length < 5 || Boolean(closeProblem)} title={closeProblem || undefined} onClick={() => void decide(true)}>Close NCR</button>
    </div>
  </section>
}

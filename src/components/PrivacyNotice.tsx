import { useState } from "react"
import Modal from "./Modal"
import { PRIVACY_VERSION, hasValue, privacyCommon, privacyRights, privacyScopes, type PrivacyScope, type SummaryRow } from "../lib/privacy"
import { supabase } from "../lib/supabase"

const buttonPrimary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60"
const buttonSecondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text disabled:opacity-60"

// Writes the person's acceptance of the notice (versioned). Best effort: the form is still sent if the record cannot be written, because
// the action itself (for example the identity submission) records the version again on the server.
export async function recordPrivacyConsent(scope: PrivacyScope): Promise<void> {
  try {
    await supabase.rpc("record_privacy_consent", { p_scope: scope, p_version: PRIVACY_VERSION })
  } catch {
    // Ignored on purpose, see above.
  }
}

function NoticeBody({ scope, full }: { scope: PrivacyScope; full: boolean }) {
  const notice = privacyScopes[scope]
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">What we collect</h3>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">{notice.collects.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
      <section><h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">Why</h3><p className="mt-1">{notice.purpose}</p></section>
      <section><h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">Who can see it</h3><p className="mt-1">{notice.access}</p></section>
      <section><h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">How long we keep it</h3><p className="mt-1">{notice.keptFor}</p></section>
      {full ? (
        <>
          <section><h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">How we protect it</h3><ul className="mt-1 list-disc space-y-0.5 pl-5">{privacyCommon.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section><h3 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">Your rights under the Data Privacy Act of 2012 (RA 10173)</h3><ul className="mt-1 list-disc space-y-0.5 pl-5">{privacyRights.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <p className="text-xs text-fg-muted">Notice version {PRIVACY_VERSION}.</p>
        </>
      ) : null}
    </div>
  )
}

// The full notice for a topic, read-only (opened from "Data privacy" links).
export function PrivacyNoticeModal({ scope = "general", onClose }: { scope?: PrivacyScope; onClose: () => void }) {
  return (
    <Modal title={privacyScopes[scope].title} description="Data privacy notice" size="lg" onClose={onClose} footer={<button type="button" className={buttonSecondary} onClick={onClose}>Close</button>}>
      <NoticeBody scope={scope} full />
      {scope !== "general" ? (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-extrabold">General notice</h3>
          <NoticeBody scope="general" full={false} />
        </div>
      ) : null}
    </Modal>
  )
}

// "Please check what you are sending": the information the form collected, a plain privacy summary, and a required agreement,
// before anything is submitted. Used wherever personal data leaves a form.
export default function DataConfirmModal({
  title = "Check your information",
  description = "Please make sure everything is correct before you send it.",
  scope,
  rows,
  confirmLabel = "Confirm and send",
  busy = false,
  record = true,
  onConfirm,
  onClose,
}: {
  title?: string
  description?: string
  scope: PrivacyScope
  rows: SummaryRow[]
  confirmLabel?: string
  busy?: boolean
  record?: boolean // write the acceptance (needs a signed-in person; false on the sign-up form)
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const [agreed, setAgreed] = useState(false)
  const [reading, setReading] = useState(false)
  const shown = rows.filter(hasValue)

  const confirm = async () => {
    if (record) await recordPrivacyConsent(scope)
    await onConfirm()
  }

  return (
    <Modal
      title={title}
      description={description}
      size="md"
      onClose={onClose}
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className={buttonSecondary} disabled={busy} onClick={onClose}>Go back and edit</button>
          <button type="button" className={buttonPrimary} disabled={!agreed || busy} onClick={() => void confirm()}>{busy ? "Sending..." : confirmLabel}</button>
        </>
      }
    >
      <dl className="divide-y divide-line rounded-xl border border-line text-sm">
        {shown.map((row) => (
          <div key={row.label} className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr]">
            <dt className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{row.label}</dt>
            <dd className="break-words font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded-xl bg-surface-muted p-3 text-sm">
        <p className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">Data privacy</p>
        <p className="mt-1">{privacyScopes[scope].purpose}</p>
        <p className="mt-1 text-fg-muted">Seen by: {privacyScopes[scope].access}</p>
        <button type="button" className="mt-2 text-xs font-bold text-brand-text underline" onClick={() => setReading((value) => !value)} aria-expanded={reading}>{reading ? "Hide the full notice" : "Read the full notice"}</button>
        {reading ? <div className="mt-3 border-t border-line pt-3"><NoticeBody scope={scope} full /></div> : null}
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#9E1F93]" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>I confirm that the information above is correct and I agree to its processing as described in the data privacy notice.</span>
      </label>
    </Modal>
  )
}

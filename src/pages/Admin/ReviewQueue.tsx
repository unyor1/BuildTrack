import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Modal from "../../components/Modal"
import { SkeletonList } from "../../components/ui/Skeleton"
import { useSignedUrl } from "../../lib/blueprints"
import { useConfirm } from "../../lib/confirm"
import { formatDate, formatTime, roleLabel } from "../../lib/admin"
import type { Profile } from "../../lib/auth"
import { idTypeLabel, identityActions, maskedId, type Verification } from "../../lib/identity"
import { supabase } from "../../lib/supabase"
import { timeAgo } from "../../lib/notifications"
import { useToast } from "../../lib/toast"

const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text disabled:opacity-60"
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60"
type Requested = "engineer" | "foreman" | "client"

type Item =
  | { kind: "registration"; key: string; at: string; user: Profile }
  | { kind: "identity"; key: string; at: string; user: Profile | null; verification: Verification }

function DocImage({ path, title, onOpen }: { path: string | null; title: string; onOpen: (url: string, title: string) => void }) {
  const { url, failed } = useSignedUrl("identity-docs", path)
  if (!path) return <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-line text-xs text-fg-muted">{title}: not required</div>
  if (failed) return <div className="flex h-40 items-center justify-center rounded-lg border border-line bg-surface-muted text-xs text-fg-muted">{title}: image deleted or unavailable</div>
  if (!url) return <div className="skeleton h-40 rounded-lg" aria-hidden="true" />
  return (
    <button type="button" onClick={() => onOpen(url, title)} className="group relative block overflow-hidden rounded-lg border border-line" aria-label={`Enlarge ${title}`}>
      <img src={url} alt={title} className="h-40 w-full object-cover transition group-hover:scale-[1.02]" />
      <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-left text-[11px] font-bold text-white">{title}</span>
    </button>
  )
}

function Row({ label, children, flag }: { label: string; children: React.ReactNode; flag?: string }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
      <dt className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold">{children}{flag ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{flag}</span> : null}</dd>
    </div>
  )
}

const norm = (value: string | null | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

// Split view for decisions: waiting registrations and identity checks on the left, the person's details and the decision on the right.
// Keys: J / K move through the list, A approves, R jumps to the rejection reason.
export default function ReviewQueue({ users, onChanged, onDecideRegistration }: { users: Profile[]; onChanged: () => Promise<void> | void; onDecideRegistration: (user: Profile, action: "approve" | "reject", role: Requested) => Promise<void> }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [verifications, setVerifications] = useState<Verification[]>([])
  const [loading, setLoading] = useState(true)
  const [showDecided, setShowDecided] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState<{ url: string; title: string } | null>(null)
  const reasonBox = useRef<HTMLTextAreaElement>(null)
  const viewed = useRef(new Set<string>())

  const load = useCallback(async () => {
    const { data } = await supabase.from("identity_verifications").select("*").order("submitted_at", { ascending: false }).limit(200)
    setVerifications((data as Verification[] | null) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const byId = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const items = useMemo<Item[]>(() => {
    const list: Item[] = []
    for (const user of users) if (user.status === "pending") list.push({ kind: "registration", key: `r:${user.id}`, at: user.created_at, user })
    for (const verification of verifications) if (verification.status === "submitted" || showDecided) list.push({ kind: "identity", key: `i:${verification.id}`, at: verification.submitted_at, user: byId.get(verification.user_id) ?? null, verification })
    return list.sort((a, b) => a.at.localeCompare(b.at)) // oldest first: the longest wait is decided first
  }, [users, verifications, showDecided, byId])

  const current = items.find((item) => item.key === selected) ?? items[0] ?? null

  // Opening someone's documents is written to the audit log (once per item per session).
  useEffect(() => {
    if (current?.kind !== "identity" || current.verification.docs_deleted_at || viewed.current.has(current.verification.id)) return
    viewed.current.add(current.verification.id)
    void identityActions.recordView(current.verification.id)
  }, [current])

  useEffect(() => setReason(""), [current?.key])

  const move = useCallback((by: number) => {
    if (!items.length) return
    const index = Math.max(0, items.findIndex((item) => item.key === current?.key))
    setSelected(items[Math.min(items.length - 1, Math.max(0, index + by))].key)
  }, [items, current?.key])

  const decideIdentity = useCallback(async (approve: boolean) => {
    if (current?.kind !== "identity" || current.verification.status !== "submitted") return
    const who = current.verification.legal_name
    if (!approve && reason.trim().length < 5) {
      reasonBox.current?.focus()
      return toast.error("A reason is needed", "Tell the person what to correct (at least 5 characters).")
    }
    if (!(await confirm({ title: approve ? `Verify ${who}?` : `Send ${who} back?`, message: approve ? "They can then request access for their role. Their documents stay available until you delete them." : "They are told what to correct and can submit again.", confirmLabel: approve ? "Verify" : "Send back", tone: approve ? "default" : "danger" }))) return
    setBusy(true)
    const result = await identityActions.decide(current.verification.id, approve, reason.trim())
    setBusy(false)
    if (!result.ok) return toast.error("Not saved", result.message)
    toast.success(approve ? "Identity verified" : "Sent back for correction", who)
    await Promise.all([load(), onChanged()])
  }, [current, reason, confirm, toast, load, onChanged])

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (zoom || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === "j") move(1)
      else if (event.key === "k") move(-1)
      else if (event.key === "a" && current?.kind === "identity") void decideIdentity(true)
      else if (event.key === "r" && current?.kind === "identity") reasonBox.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [move, decideIdentity, current, zoom])

  const deleteImages = async (verification: Verification) => {
    if (!(await confirm({ title: "Delete the ID images?", message: "The photos are removed for good. The decision and the last characters of the ID number stay on record.", confirmLabel: "Delete images", tone: "danger" }))) return
    const problem = await identityActions.deleteImages(verification)
    if (problem) return toast.error("Not deleted", problem)
    toast.success("ID images deleted")
    await load()
  }

  if (loading) return <SkeletonList rows={5} label="Loading the review queue" />

  const waitingIdentity = verifications.filter((v) => v.status === "submitted").length
  const waitingRegistrations = users.filter((u) => u.status === "pending").length

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]" role="region" aria-label="Review queue">
      <aside className="rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div><h2 className="text-sm font-extrabold">Waiting for you</h2><p className="text-xs text-fg-muted">{waitingRegistrations} registration{waitingRegistrations === 1 ? "" : "s"} • {waitingIdentity} ID check{waitingIdentity === 1 ? "" : "s"}</p></div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold"><input type="checkbox" checked={showDecided} onChange={(event) => setShowDecided(event.target.checked)} /> Decided</label>
        </div>
        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-fg-muted">Nothing is waiting. New registrations and ID checks appear here and you get a notification.</p>
        ) : (
          <ul className="max-h-[70vh] divide-y divide-line overflow-y-auto" aria-label="Queue">
            {items.map((item) => {
              const active = item.key === current?.key
              const name = item.kind === "registration" ? item.user.full_name || item.user.email : item.verification.legal_name
              return (
                <li key={item.key}>
                  <button type="button" onClick={() => setSelected(item.key)} aria-current={active ? "true" : undefined} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-muted ${active ? "bg-brand-soft" : ""}`}>
                    <span className={`mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-extrabold text-white ${item.kind === "identity" ? "bg-[#F18B00] !text-black" : "bg-brand"}`} aria-hidden="true">{item.kind === "identity" ? "ID" : "NEW"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{name}</span>
                      <span className="block truncate text-xs text-fg-muted">{item.kind === "registration" ? (item.user.requested_role ? `Asked for ${roleLabel[item.user.requested_role]}` : "Details not sent yet") : `${idTypeLabel(item.verification.id_type)}${item.verification.status !== "submitted" ? ` • ${item.verification.status}` : ""}`}</span>
                    </span>
                    <span className="flex-none text-[11px] text-fg-muted">{timeAgo(item.at)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="border-t border-line px-4 py-2 text-[11px] text-fg-muted">Keys: <kbd className="rounded border border-line px-1">J</kbd> / <kbd className="rounded border border-line px-1">K</kbd> move, <kbd className="rounded border border-line px-1">A</kbd> approve an ID, <kbd className="rounded border border-line px-1">R</kbd> reason to reject</p>
      </aside>

      <section className="min-w-0 rounded-2xl border border-line bg-surface p-5" aria-live="polite">
        {!current ? (
          <p className="py-16 text-center text-sm text-fg-muted">Choose someone from the list.</p>
        ) : current.kind === "registration" ? (
          <RegistrationPane user={current.user} busy={busy} onDecide={async (action, role) => { setBusy(true); await onDecideRegistration(current.user, action, role); setBusy(false) }} />
        ) : (
          <IdentityPane
            item={current}
            reason={reason}
            setReason={setReason}
            reasonBox={reasonBox}
            busy={busy}
            onZoom={(url, title) => setZoom({ url, title })}
            onApprove={() => void decideIdentity(true)}
            onReject={() => void decideIdentity(false)}
            onDelete={() => void deleteImages(current.verification)}
          />
        )}
      </section>

      {zoom ? (
        <Modal title={zoom.title} size="xl" onClose={() => setZoom(null)} footer={<button type="button" className={secondary} onClick={() => setZoom(null)}>Close</button>}>
          <img src={zoom.url} alt={zoom.title} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg" />
        </Modal>
      ) : null}
    </div>
  )
}

function RegistrationPane({ user, busy, onDecide }: { user: Profile; busy: boolean; onDecide: (action: "approve" | "reject", role: Requested) => Promise<void> }) {
  const ready = Boolean(user.registration_completed_at)
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-xs font-extrabold uppercase tracking-wider text-brand-text">Registration</p><h2 className="text-xl font-extrabold">{user.full_name || user.email}</h2><p className="text-sm text-fg-muted">{user.email}</p></div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Pending</span>
      </div>
      <dl className="mt-4 divide-y divide-line">
        <Row label="Signed up with">{user.signup_provider === "google" ? "Google" : user.signup_provider === "admin" ? "Created by an administrator" : "Email and password"}</Row>
        <Row label="Phone">{user.phone || "-"}</Row>
        <Row label="Company">{user.company || "-"}</Row>
        <Row label="Job title">{user.position || "-"}</Row>
        <Row label="Access wanted">{user.requested_role ? roleLabel[user.requested_role] : "Not said yet"}</Row>
        <Row label="Registered">{`${formatDate(user.created_at)} ${formatTime(user.created_at)}`}</Row>
      </dl>
      {ready ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {(["engineer", "foreman", "client"] as Requested[]).sort((a, b) => Number(b === user.requested_role) - Number(a === user.requested_role)).map((role) => (
            <button key={role} type="button" disabled={busy} className={role === user.requested_role ? primary : secondary} onClick={() => void onDecide("approve", role)}>Approve as {roleLabel[role]}</button>
          ))}
          <button type="button" disabled={busy} className={secondary + " !text-danger-fg"} onClick={() => void onDecide("reject", "client")}>Reject</button>
        </div>
      ) : (
        <div className="mt-5"><p className="mb-2 text-sm text-fg-muted">This person has not sent their registration details yet, so there is nothing to approve.</p><button type="button" disabled={busy} className={secondary + " !text-danger-fg"} onClick={() => void onDecide("reject", "client")}>Reject</button></div>
      )}
    </div>
  )
}

function IdentityPane({ item, reason, setReason, reasonBox, busy, onZoom, onApprove, onReject, onDelete }: {
  item: Extract<Item, { kind: "identity" }>
  reason: string
  setReason: (value: string) => void
  reasonBox: React.RefObject<HTMLTextAreaElement | null>
  busy: boolean
  onZoom: (url: string, title: string) => void
  onApprove: () => void
  onReject: () => void
  onDelete: () => void
}) {
  const v = item.verification
  const waiting = v.status === "submitted"
  const nameMismatch = item.user && norm(item.user.full_name) !== "" && norm(item.user.full_name) !== norm(v.legal_name)
  const expired = v.id_expiry && v.id_expiry < new Date().toISOString().slice(0, 10)
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="text-xs font-extrabold uppercase tracking-wider text-brand-text">Identity check</p><h2 className="text-xl font-extrabold">{v.legal_name}</h2><p className="text-sm text-fg-muted">{item.user?.email ?? "Account removed"} • sent {formatDate(v.submitted_at)} {formatTime(v.submitted_at)}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${v.status === "submitted" ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" : v.status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" : "bg-gray-200 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200"}`}>{v.status === "submitted" ? "Waiting" : v.status}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <DocImage path={v.docs_deleted_at ? null : v.front_path} title="ID front" onOpen={onZoom} />
        <DocImage path={v.docs_deleted_at ? null : v.back_path} title="ID back" onOpen={onZoom} />
        <DocImage path={v.docs_deleted_at ? null : v.selfie_path} title="Selfie with ID" onOpen={onZoom} />
      </div>
      {v.docs_deleted_at ? <p className="mt-2 text-xs text-fg-muted">The images were deleted on {formatDate(v.docs_deleted_at)}.</p> : null}

      <dl className="mt-4 divide-y divide-line">
        <Row label="Legal name" flag={nameMismatch ? `Account name: ${item.user?.full_name}` : undefined}>{v.legal_name}</Row>
        <Row label="Date of birth">{formatDate(v.birth_date)}</Row>
        <Row label="Address">{v.address}</Row>
        <Row label="Phone" flag={item.user?.phone && norm(item.user.phone) !== norm(v.phone) ? "Differs from account" : undefined}>{v.phone}</Row>
        <Row label="ID">{idTypeLabel(v.id_type)} {maskedId(v.id_last4)}</Row>
        <Row label="ID expiry" flag={expired ? "Expired" : undefined}>{v.id_expiry ? formatDate(v.id_expiry) : "No expiry"}</Row>
        <Row label="Privacy notice">Accepted (version {v.consent_version})</Row>
        {v.reviewed_at ? <Row label="Decision">{v.status === "approved" ? "Approved" : "Sent back"} on {formatDate(v.reviewed_at)}{v.decision_note ? ` • "${v.decision_note}"` : ""}</Row> : null}
      </dl>

      {waiting ? (
        <div className="mt-5 space-y-3 rounded-xl border border-line bg-surface-muted/50 p-4">
          <div>
            <label htmlFor="id-reason" className="block text-xs font-extrabold uppercase tracking-wider text-fg-muted">Reason (required to send back)</label>
            <textarea id="id-reason" ref={reasonBox} rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. The selfie does not show the ID clearly. Please retake it in better light." className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" disabled={busy} className={secondary + " !text-danger-fg"} onClick={onReject}>Send back</button>
            <button type="button" disabled={busy} className={primary} onClick={onApprove}>Verify identity</button>
          </div>
        </div>
      ) : !v.docs_deleted_at ? (
        <div className="mt-5 flex justify-end"><button type="button" className={secondary + " !text-danger-fg"} onClick={onDelete}>Delete the ID images</button></div>
      ) : null}
    </div>
  )
}

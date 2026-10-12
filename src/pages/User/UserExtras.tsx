import { useRef, useState, type FormEvent } from "react"
import { useAuth, roleHomePath, type AppRole } from "../../lib/auth"
import { formatInviteCode, inviteReasonText, profileCompleteness, redeemInvite, removeAvatar, uploadAvatar } from "../../lib/profileTools"
import { followLink } from "../../lib/notifications"
import { useConfirm } from "../../lib/confirm"
import { useToast } from "../../lib/toast"

const initialsOf = (name: string) =>
  name
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

export function Avatar({ url, name, size = 64 }: { url: string | null | undefined; name: string; size?: number }) {
  const style = { width: size, height: size, fontSize: size / 2.6 }
  return url ? (
    <img src={url} alt="" referrerPolicy="no-referrer" style={style} className="flex-none rounded-full object-cover ring-2 ring-white/70" />
  ) : (
    <span style={style} className="flex flex-none items-center justify-center rounded-full bg-brand font-extrabold text-white ring-2 ring-white/70">{initialsOf(name) || "?"}</span>
  )
}

// Photo picker: uploads straight away, shows progress, can remove.
export function AvatarEditor({ onChanged }: { onChanged: () => void }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  if (!profile) return null

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      await uploadAvatar(profile.id, file)
      toast.success("Profile photo updated")
      onChanged()
    } catch (problem) {
      toast.error("Photo not saved", problem instanceof Error ? problem.message : "Try another picture.")
    }
    setBusy(false)
    if (input.current) input.current.value = ""
  }
  const clear = async () => {
    if (!(await confirm({ title: "Remove your photo?", message: "Your initials will be shown instead.", confirmLabel: "Remove" }))) return
    setBusy(true)
    try {
      await removeAvatar(profile.id)
      toast.success("Photo removed")
      onChanged()
    } catch (problem) {
      toast.error("Could not remove the photo", problem instanceof Error ? problem.message : "Try again.")
    }
    setBusy(false)
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar url={profile.avatar_url} name={profile.full_name || profile.email} size={72} />
      <div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-surface-muted disabled:opacity-60">
            {busy ? "Saving..." : profile.avatar_url ? "Change photo" : "Upload photo"}
          </button>
          {profile.avatar_url ? (
            <button type="button" disabled={busy} onClick={() => void clear()} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-danger-fg hover:bg-danger-soft disabled:opacity-60">Remove</button>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-fg-muted">PNG, JPEG or WebP. It is cropped to a square.</p>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Choose a profile photo" onChange={(event) => void pick(event.target.files?.[0])} />
      </div>
    </div>
  )
}

export function ProfileCompleteness({ onEdit }: { onEdit: () => void }) {
  const { profile } = useAuth()
  const { items, percent } = profileCompleteness(profile)
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="border-l-4 border-accent pl-3 text-lg font-extrabold text-brand-strong">Your profile</h2>
        <span className="text-sm font-extrabold text-brand-text">{percent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
        <div className="h-full rounded-full bg-gradient-to-r from-[#9e1f93] to-[#f18b00] transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-4 grid gap-1.5 text-sm sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className={`flex items-center gap-2 ${item.done ? "text-fg" : "text-fg-muted"}`}>
            <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[11px] font-bold ${item.done ? "bg-green-600 text-white" : "border border-line"}`} aria-hidden="true">{item.done ? "✓" : ""}</span>
            {item.label}
          </li>
        ))}
      </ul>
      {percent < 100 ? (
        <button type="button" onClick={onEdit} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover">Complete my profile</button>
      ) : (
        <p className="mt-4 text-sm font-semibold text-green-700 dark:text-green-300">Your profile is complete. Admins can see who you are.</p>
      )}
    </section>
  )
}

export function InviteCodeCard({ onJoined }: { onJoined: () => Promise<void> }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (code.replace(/-/g, "").length < 12) return setError("An invitation code has 12 letters and numbers.")
    setError("")
    setBusy(true)
    try {
      const result = await redeemInvite(code)
      if (!result.ok) {
        setError(inviteReasonText[result.reason])
      } else {
        toast.success("Welcome aboard", `You joined as ${result.role}.`)
        await onJoined()
        followLink(roleHomePath(result.role as AppRole), null)
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not check the code. Try again.")
    }
    setBusy(false)
  }

  if (profile?.role && profile.role !== "user") return null
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="border-l-4 border-accent pl-3 text-lg font-extrabold text-brand-strong">Have an invitation code?</h2>
      <p className="mt-1 pl-4 text-sm text-fg-muted">An administrator may have given you a code. It gives you the role right away, with no waiting.</p>
      <form className="mt-4 flex flex-wrap items-start gap-2" onSubmit={(event) => void submit(event)} noValidate>
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="invite-code" className="sr-only">Invitation code</label>
          <input
            id="invite-code"
            value={code}
            onChange={(event) => setCode(formatInviteCode(event.target.value))}
            placeholder="XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "invite-code-error" : undefined}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm uppercase tracking-widest text-fg"
          />
          {error ? <p id="invite-code-error" role="alert" className="mt-1.5 text-sm text-danger-fg">{error}</p> : null}
        </div>
        <button type="submit" disabled={busy || !code} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60">{busy ? "Checking..." : "Join with code"}</button>
      </form>
    </section>
  )
}

const guide = [
  {
    role: "Engineer",
    tagline: "Plans the work and signs it off",
    points: ["Upload blueprints and place pins", "Review what the foreman reports", "Approve it or send it back with a reason"],
  },
  {
    role: "Foreman",
    tagline: "Does the work and reports it",
    points: ["See the pins assigned to you", "Report progress with notes and photos", "Fix what the engineer sends back"],
  },
  {
    role: "Client",
    tagline: "Follows the project",
    points: ["See the plans and verified progress", "Get notified at each milestone", "Read-only: nothing can be changed by mistake"],
  },
]

export function RoleGuide() {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="border-l-4 border-accent pl-3 text-lg font-extrabold text-brand-strong">Which role is yours?</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {guide.map((item) => (
          <div key={item.role} className="rounded-xl border border-line bg-surface-muted/50 p-4">
            <p className="text-base font-extrabold">{item.role}</p>
            <p className="text-xs font-semibold text-brand-text">{item.tagline}</p>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              {item.points.map((point) => (
                <li key={point} className="flex gap-2"><span className="text-accent" aria-hidden="true">•</span>{point}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

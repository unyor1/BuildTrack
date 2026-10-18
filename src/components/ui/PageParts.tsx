import type { ReactNode } from "react"

// Small building blocks for the data pages (dashboards, queues, registers). Semantic colours only.

export function PageHead({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="bt-pagehead mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0">
        {eyebrow ? <p className="bt-pagehead__eyebrow mb-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.12em] text-brand-text">{eyebrow}</p> : null}
        <h1 className="bt-pagehead__title text-2xl font-extrabold tracking-tight text-fg sm:text-[32px] sm:leading-tight">{title}</h1>
        {description ? <p className="bt-pagehead__desc mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

const toneBar = { brand: "bt-persona-bar", green: "bg-green-600", amber: "bg-amber-500", red: "bg-red-600", sky: "bg-sky-500", gray: "bg-gray-400" }

export function StatCard({ label, value, note, tone = "brand", onClick }: { label: string; value: ReactNode; note?: ReactNode; tone?: keyof typeof toneBar; onClick?: () => void }) {
  const body = (
    <>
      <span className={`absolute inset-x-0 top-0 h-[3px] ${toneBar[tone]}`} aria-hidden="true" />
      <span className="block text-[11px] font-extrabold uppercase tracking-[0.08em] text-fg-muted">{label}</span>
      <span className="mt-2 block text-[28px] font-extrabold leading-none tracking-tight text-fg tabular-nums">{value}</span>
      {note ? <span className="mt-2 block text-xs leading-snug text-fg-muted">{note}</span> : null}
    </>
  )
  const base = "bt-stat relative block h-full w-full overflow-hidden rounded-2xl border border-line bg-surface px-5 py-4 text-left shadow-[var(--bt-shadow)]"
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} transition hover:-translate-y-0.5 hover:shadow-[var(--bt-shadow-hover)]`}>{body}</button>
  ) : (
    <div className={base}>{body}</div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="text-base font-extrabold text-fg">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Meter({ value, tone = "brand", label }: { value: number; tone?: keyof typeof toneBar; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? "Progress"}>
      <div className={`h-full rounded-full transition-all duration-500 ${toneBar[tone]}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export const buttonPrimary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60"
export const buttonSecondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text disabled:opacity-60"
export const buttonDanger = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-60"
export const inputClass = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand"

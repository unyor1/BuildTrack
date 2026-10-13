import type { ReactNode } from "react"

export type SetupStep = { key: string; title: string; text: string; done: boolean; action?: { label: string; run: () => void } }

// First-run guidance: the few things to do, in order, with real progress. Each step is "done" because the database says so (never a
// manual tick), the first open step carries the button, and the card disappears when everything is done.
export default function GetStarted({ title, intro, steps, aside }: { title: string; intro: string; steps: SetupStep[]; aside?: ReactNode }) {
  const done = steps.filter((step) => step.done).length
  if (!steps.length || done === steps.length) return null
  const current = steps.findIndex((step) => !step.done)
  return (
    <section aria-labelledby="get-started" className="mb-5 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--bt-shadow)]">
      <div className="bt-persona-bar h-1" aria-hidden="true" />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="get-started" className="text-base font-extrabold">{title}</h2>
            <p className="mt-0.5 max-w-2xl text-sm text-fg-muted">{intro}</p>
          </div>
          <p className="rounded-full bg-brand-soft px-3 py-1 text-xs font-extrabold text-brand-text tabular-nums" aria-label={`${done} of ${steps.length} steps done`}>{done} of {steps.length} done</p>
        </div>
        <ol className="mt-4 space-y-2">
          {steps.map((step, index) => {
            const active = index === current
            return (
              <li key={step.key} className={`flex items-start gap-3 rounded-xl border p-3 ${step.done ? "border-line bg-surface-muted/60" : active ? "border-brand/40 bg-brand-soft/40" : "border-line"}`}>
                <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-extrabold ${step.done ? "bg-green-700 text-white" : active ? "bt-persona-bar text-white" : "border border-line text-fg-muted"}`} aria-hidden="true">{step.done ? "✓" : index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${step.done ? "text-fg-muted line-through decoration-1" : ""}`}>{step.title}<span className="sr-only">{step.done ? " (done)" : active ? " (next)" : ""}</span></p>
                  {!step.done ? <p className="text-xs text-fg-muted">{step.text}</p> : null}
                </div>
                {active && step.action ? <button type="button" onClick={step.action.run} className="flex-none rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-hover">{step.action.label}</button> : null}
              </li>
            )
          })}
        </ol>
        {aside ? <div className="mt-3 text-xs text-fg-muted">{aside}</div> : null}
      </div>
    </section>
  )
}

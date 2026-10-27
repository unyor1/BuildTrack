import { refNumber } from "../../lib/qa"
import type { PriorQaCheck } from "../../lib/qaReinspection"

export default function ReinspectionScope({ rows, loading, error, onChanged, onOpenInspection }: {
  rows: PriorQaCheck[]; loading: boolean; error: string
  onChanged: () => Promise<void>; onOpenInspection?: (id: string) => void
}) {
  return <section aria-label="Reinspection scope" className="space-y-3 rounded-xl border border-brand/40 bg-brand-soft/30 p-3">
    <h3 className="text-sm font-extrabold">Full checklist reinspection</h3>
    <p className="text-xs leading-relaxed text-fg-muted">Every check in this checklist needs a fresh result, including previously passed checks, because the repair may affect other work. Required measurements, tests and photos must be recorded again. This does not resubmit unrelated checklists or the whole project.</p>
    <p className="text-xs leading-relaxed text-fg-muted">Earlier results and evidence remain unchanged as history. They do not count as results for this new inspection. NCRs still need Engineer verification and closure; completing the checklist remains a separate manual action.</p>
    {loading ? <p role="status" className="text-xs">Loading earlier checks…</p> : error ? <p role="alert" className="text-sm text-danger-fg">{error} <button type="button" className="underline" onClick={() => void onChanged()}>Retry</button></p> : rows.length ? <details>
      <summary className="cursor-pointer text-sm font-bold">Previous inspection results — reference only ({rows.length})</summary>
      <ul className="mt-2 space-y-2">{rows.map(row => <li key={row.id} className="rounded-lg border border-line bg-surface p-2 text-xs">
        <p className="font-bold">{row.text}</p>
        <p className="mt-1 text-fg-muted">Previous {row.result === "pass" ? "Pass" : row.result === "fail" ? "Fail" : row.result === "na" ? "N/A" : "Pending"} · {refNumber("ir", row.source_number)} · Must be checked again in this inspection</p>
        {row.acceptance_criteria ? <p className="mt-1 whitespace-pre-wrap">Requirement: {row.acceptance_criteria}</p> : null}
        {onOpenInspection ? <button type="button" className="mt-1 font-bold text-brand-text underline" onClick={() => onOpenInspection(row.inspection_id)}>View original result and evidence</button> : null}
      </li>)}</ul>
    </details> : <p className="text-xs text-fg-muted">The new inspection contains the full recorded checklist. Earlier records remain available in its linked history.</p>}
  </section>
}

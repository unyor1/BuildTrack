import { useEffect, useId, useState, type ReactNode } from "react"
import { timelineWindow } from "../../lib/verificationViewModel"

// Callers pass newest-first entries. All history stays accessible without growing the page.
export default function LimitedTimeline<T>({ entries, renderEntry, entryKey, label = "Activity timeline", resetKey, limit = 5 }: {
  entries: T[]; renderEntry: (entry: T) => ReactNode; entryKey: (entry: T) => string | number;
  label?: string; resetKey?: string; limit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  useEffect(() => { setExpanded(false) }, [resetKey])
  const shown = timelineWindow(entries, expanded, limit)
  if (!entries.length) return <p className="text-sm text-fg-muted">No activity yet.</p>
  return <div className="min-w-0 space-y-2">
    <p className="text-xs text-fg-muted" role="status">{expanded ? `All ${entries.length} events` : `Latest ${shown.length} of ${entries.length} events`}</p>
    <ol id={listId} aria-label={label} tabIndex={0} className="max-h-72 space-y-3 overflow-y-auto overscroll-contain break-words pr-2 focus-visible:outline-brand">
      {shown.map(entry => <li key={entryKey(entry)} className="border-l-2 border-line pl-3 text-sm">{renderEntry(entry)}</li>)}
    </ol>
    {entries.length > limit ? <button type="button" aria-expanded={expanded} aria-controls={listId} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-brand-text hover:bg-surface-muted" onClick={() => setExpanded(value => !value)}>{expanded ? "Show latest only" : `View all ${entries.length} events`}</button> : null}
  </div>
}

import { useMemo } from "react"
import { categoryLabels, defectBreakdown, defectTrend, tradeLabels, type Breakdown, type DefectCategory, type Trade } from "../../lib/qaModel"
import type { Defect } from "../../lib/qa"

// Where problems come from and whether they are getting fixed: defect reports raised and closed per week, and the biggest sources by
// trade and by kind of problem. Same defect rows as the register, so the picture always agrees with the list.
const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-PH", { day: "numeric", month: "short" })
const H = 150
const PAD = { top: 10, right: 8, bottom: 22, left: 26 }

function Bars({ rows, labelOf, label }: { rows: Breakdown[]; labelOf: (key: string) => string; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.total))
  return (
    <div>
      <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-fg-muted">{label}</h3>
      {rows.length === 0 ? <p className="text-sm text-fg-muted">No defect reports yet.</p> : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} title={`${labelOf(row.key)}: ${row.total} raised, ${row.open} still open${row.critical ? `, ${row.critical} critical` : ""}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{labelOf(row.key)}</span>
                <span className="flex-none tabular-nums text-fg-muted"><strong className="text-fg">{row.total}</strong> · {row.open} open{row.critical ? ` · ${row.critical} critical` : ""}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                <div className="h-full rounded-full bg-[var(--sc-plan)]" style={{ width: `${(row.total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DefectTrends({ defects, today }: { defects: Defect[]; today: string }) {
  const weeks = useMemo(() => defectTrend(defects, today, 8), [defects, today])
  const byTrade = useMemo(() => defectBreakdown(defects, "trade"), [defects])
  const byCategory = useMemo(() => defectBreakdown(defects, "category"), [defects])
  const top = Math.max(2, ...weeks.map((week) => Math.max(week.raised, week.closed)))
  const width = 360
  const innerW = width - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = innerW / weeks.length
  const bar = Math.min(14, slot / 2 - 3)
  const y = (value: number) => PAD.top + innerH - (value / top) * innerH
  const totalRaised = weeks.reduce((sum, week) => sum + week.raised, 0)
  const totalClosed = weeks.reduce((sum, week) => sum + week.closed, 0)

  return (
    <section aria-label="Defect trends" className="bt-scurve rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-extrabold">Defect trends</h2>
        <ul className="flex gap-4 text-xs text-fg-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--sc-plan)]" aria-hidden="true" />Raised</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--sc-done)]" aria-hidden="true" />Closed</li>
        </ul>
      </div>
      {defects.length === 0 ? <p className="mt-2 text-sm text-fg-muted">Trends appear once the first defect report is raised.</p> : (
        <div className="mt-3 grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <h3 className="mb-1 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Last 8 weeks</h3>
            <svg viewBox={`0 0 ${width} ${H}`} width="100%" role="img" aria-label={`Defect reports raised and closed per week over 8 weeks: ${totalRaised} raised, ${totalClosed} closed`}>
              {[0, Math.ceil(top / 2), top].map((value) => (
                <g key={value}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(value)} y2={y(value)} className="bt-sc-grid" strokeWidth="1" />
                  <text x={PAD.left - 5} y={y(value) + 3} textAnchor="end" className="bt-sc-axis">{value}</text>
                </g>
              ))}
              {weeks.map((week, i) => {
                const cx = PAD.left + slot * i + slot / 2
                return (
                  <g key={week.start}>
                    <title>{`Week of ${shortDate(week.start)}: ${week.raised} raised, ${week.closed} closed`}</title>
                    <rect x={cx - bar - 1} y={y(week.raised)} width={bar} height={Math.max(0, y(0) - y(week.raised))} rx="3" fill="var(--sc-plan)" />
                    <rect x={cx + 1} y={y(week.closed)} width={bar} height={Math.max(0, y(0) - y(week.closed))} rx="3" fill="var(--sc-done)" />
                    {i % 2 === 0 || weeks.length < 6 ? <text x={cx} y={H - 6} textAnchor="middle" className="bt-sc-axis">{shortDate(week.start)}</text> : null}
                  </g>
                )
              })}
            </svg>
            <p className="text-xs text-fg-muted">{totalRaised} raised and {totalClosed} closed in these weeks. {totalClosed >= totalRaised ? "Fixes are keeping up." : "More are being raised than fixed."}</p>
          </div>
          <Bars rows={byTrade} labelOf={(key) => (key === "other" ? "Other trades" : tradeLabels[key as Trade])} label="By trade" />
          <Bars rows={byCategory} labelOf={(key) => (key === "other" ? "Other" : categoryLabels[key as DefectCategory])} label="By kind of problem" />
        </div>
      )}
    </section>
  )
}

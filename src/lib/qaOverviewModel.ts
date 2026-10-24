import type { Defect, Inspection, InspectionItem, QaSummary } from "./qa"
import { allDates, inRange, isFiltered, manilaDayOf, rangeProblem, type DateRange } from "./dateRangeModel.ts"
import { defectTrend, type TrendWeek } from "./qaModel.ts"

export type OverviewItemResult = Pick<InspectionItem, "inspection_id" | "result">
const round = (value: number) => Math.round(value * 10) / 10
const rate = (part: number, total: number) => total ? round(100 * part / total) : null
const average = (values: number[]) => values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null

// Same definitions as get_qa_summary, applied to the selected cohort: inspections requested / NCRs raised in the period.
// Results are their current state, NOT a reconstruction of how the project looked at the end of the selected dates.
export function qaOverviewSummary(inspections: Inspection[], defects: Defect[], items: OverviewItemResult[], today: string, staff = false): QaSummary {
  const active = inspections.filter(row => row.status !== "cancelled")
  const completed = active.filter(row => ["passed", "conditional", "failed"].includes(row.status))
  const first = completed.filter(row => !row.reinspection_of)
  const completedIds = new Set(completed.map(row => row.id))
  const checked = items.filter(row => completedIds.has(row.inspection_id) && (row.result === "pass" || row.result === "fail"))
  const failed = checked.filter(row => row.result === "fail").length
  const open = defects.filter(row => row.status !== "closed")
  const closed = defects.filter(row => row.status === "closed")
  const trades = [...new Set([...active.map(row => row.trade), ...defects.map(row => row.trade)])].sort()
  return {
    staff,
    inspections: {
      total: active.length,
      requested: active.filter(row => row.status === "requested").length,
      in_progress: active.filter(row => row.status === "in_progress").length,
      passed: completed.filter(row => row.status === "passed").length,
      conditional: completed.filter(row => row.status === "conditional").length,
      failed: completed.filter(row => row.status === "failed").length,
      first_pass_rate: rate(first.filter(row => row.status === "passed").length, first.length),
      average_score: average(completed.flatMap(row => row.score === null ? [] : [row.score])),
    },
    defects: {
      open: open.length,
      critical_open: open.filter(row => row.severity === "critical").length,
      major_open: open.filter(row => row.severity === "major").length,
      minor_open: open.filter(row => row.severity === "minor").length,
      overdue: open.filter(row => row.due_date && row.due_date < today).length,
      for_verification: open.filter(row => row.status === "for_verification").length,
      closed: closed.length,
      average_days_to_close: average(closed.flatMap(row => row.closed_at ? [(Date.parse(row.closed_at) - Date.parse(row.raised_at)) / 86400000] : [])),
    },
    items: { checked: checked.length, failed, defects_per_100_items: rate(failed, checked.length) },
    by_trade: trades.map(trade => {
      const rows = completed.filter(row => row.trade === trade)
      return { trade, inspections: rows.length, pass_rate: rate(rows.filter(row => row.status === "passed").length, rows.length), open_defects: open.filter(row => row.trade === trade).length }
    }),
    recent: [...active].sort((a, b) => Date.parse(b.completed_at ?? b.requested_at) - Date.parse(a.completed_at ?? a.requested_at)).slice(0, 8),
  }
}

// Filtered trends cover the WHOLE chosen interval (at most 8 equal-day buckets), even for older or long date ranges.
// Closed bars refer only to NCRs raised in the cohort and closed within the displayed interval.
export function qaOverviewTrend(defects: Defect[], today: string, dates: DateRange = allDates): TrendWeek[] {
  if (!isFiltered(dates) || rangeProblem(dates)) return defectTrend(defects, today, 8)
  const selected = defects.filter(row => inRange(row.raised_at, dates))
  const end = dates.to || (dates.from > today ? dates.from : today)
  const start = dates.from || selected.map(row => manilaDayOf(row.raised_at)!).sort()[0] || end
  const startTime = Date.parse(`${start}T00:00:00Z`)
  const span = Math.round((Date.parse(`${end}T00:00:00Z`) - startTime) / 86400000) + 1
  const size = Math.max(1, Math.ceil(span / 8))
  const dayAt = (offset: number) => new Date(startTime + offset * 86400000).toISOString().slice(0, 10)
  const rows: TrendWeek[] = []
  for (let offset = 0; offset < span; offset += size) {
    const range = { from: dayAt(offset), to: dayAt(Math.min(offset + size - 1, span - 1)) }
    rows.push({ start: range.from, end: range.to, raised: selected.filter(row => inRange(row.raised_at, range)).length, closed: selected.filter(row => row.closed_at && inRange(row.closed_at, range)).length })
  }
  return rows
}

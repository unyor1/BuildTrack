export const WORKER_PAGE_SIZE = 24
export const RECORD_PAGE_SIZE = 30

export function validAttendanceDay(day: string, today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return false
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}

export const workerSearchPattern = (search: string) => `%${search.trim().replace(/[%_\\]/g, "\\$&")}%`

export type WorkerDaySummary = {
  clockIns: number
  clockOuts: number
  firstIn: string | null
  lastOut: string | null
}

export function attendancePageLabel(page: number, size: number, total: number) {
  return total ? `${page * size + 1}–${Math.min((page + 1) * size, total)} of ${total}` : "0 records"
}

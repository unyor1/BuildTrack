import { attendanceDay, attendanceTime } from "./attendanceModel.ts"
import { validAttendanceDay } from "./foremanAttendanceModel.ts"

export type AttendanceReportPeriod = "daily" | "weekly" | "monthly"
export type AttendanceReportPerson = { id: string; full_name: string; worker_code: string; trade: string }
export type AttendanceReportEvent = {
  id: string
  project_id: string
  worker_id: string
  direction: "in" | "out"
  occurred_at: string
  received_at: string
  device_id: string
  worker: AttendanceReportPerson | null
}
export type AttendanceReportRange = {
  period: AttendanceReportPeriod
  startDay: string
  endDay: string
  throughDay: string
  start: string
  endExclusive: string
}
export type AttendanceReportData = {
  project: { id: string; name: string; code: string }
  worker: AttendanceReportPerson | null
  range: AttendanceReportRange
  events: AttendanceReportEvent[]
  generatedAt: string
}
export type AttendanceDailyRow = {
  day: string
  workerId: string
  name: string
  code: string
  trade: string
  clockIns: number
  clockOuts: number
  firstIn: string | null
  lastOut: string | null
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10)
export function attendanceReportRange(period: AttendanceReportPeriod, anchor: string, today = attendanceDay()): AttendanceReportRange {
  if (!["daily", "weekly", "monthly"].includes(period) || !validAttendanceDay(anchor, today)) throw new Error("Choose a valid report period and a date no later than today.")
  const start = new Date(`${anchor}T00:00:00Z`), end = new Date(start)
  if (period === "weekly") {
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
    end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate() + 6)
  } else if (period === "monthly") {
    start.setUTCDate(1)
    end.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0)
  }
  const startDay = isoDay(start), endDay = isoDay(end), throughDay = endDay < today ? endDay : today
  const until = new Date(`${throughDay}T00:00:00+08:00`)
  until.setTime(until.getTime() + 86400000)
  return { period, startDay, endDay, throughDay, start: new Date(`${startDay}T00:00:00+08:00`).toISOString(), endExclusive: until.toISOString() }
}

export function attendanceReportSummary(events: AttendanceReportEvent[]) {
  const groups = new Map<string, AttendanceDailyRow>()
  let clockIns = 0, clockOuts = 0
  for (const event of events) {
    const day = attendanceDay(new Date(event.occurred_at)), key = `${day}:${event.worker_id}`
    let row = groups.get(key)
    if (!row) {
      row = { day, workerId: event.worker_id, name: event.worker?.full_name ?? "Worker unavailable", code: event.worker?.worker_code ?? event.worker_id, trade: event.worker?.trade || "Site worker", clockIns: 0, clockOuts: 0, firstIn: null, lastOut: null }
      groups.set(key, row)
    }
    if (event.direction === "in") {
      clockIns++; row.clockIns++
      if (!row.firstIn || Date.parse(event.occurred_at) < Date.parse(row.firstIn)) row.firstIn = event.occurred_at
    } else {
      clockOuts++; row.clockOuts++
      if (!row.lastOut || Date.parse(event.occurred_at) > Date.parse(row.lastOut)) row.lastOut = event.occurred_at
    }
  }
  return {
    scans: events.length, clockIns, clockOuts,
    workers: new Set(events.map(event => event.worker_id)).size,
    days: new Set([...groups.values()].map(row => row.day)).size,
    rows: [...groups.values()].sort((a, b) => a.day.localeCompare(b.day) || a.name.localeCompare(b.name) || a.workerId.localeCompare(b.workerId)),
  }
}

export const reportTime = (value: string | null) => value ? attendanceTime(value) : "—"
export const reportPeriodTitle = (period: AttendanceReportPeriod) => ({ daily: "Daily", weekly: "Weekly", monthly: "Monthly" })[period]

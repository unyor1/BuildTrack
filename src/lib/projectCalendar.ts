import { useCallback, useMemo } from "react"
import { useProjectWork } from "./projectWork"
import { useDefects, useInspections } from "./qa"
import { usePeriodicReload } from "./realtime"
import { calendarQaAllowed, projectCalendarEvents, type CalendarRole } from "./projectCalendarModel"

export function useProjectCalendar(projectId: string | null, role: CalendarRole, userId: string | null) {
  const work = useProjectWork(projectId)
  // Do not even request internal QA/NCR tables for Clients or the management-only Admin calendar.
  const qaProject = calendarQaAllowed(role) ? projectId : null
  const inspections = useInspections(qaProject)
  const defects = useDefects(qaProject)
  const reload = useCallback(async () => { await Promise.all([work.reload(), inspections.reload(), defects.reload()]) }, [work.reload, inspections.reload, defects.reload])
  usePeriodicReload(projectId ? `calendar:${role}:${projectId}` : null, reload)
  const data = useMemo(() => work.project && work.project.id === projectId ? projectCalendarEvents({ role, userId, project: work.project, pins: work.pins, blueprints: work.blueprints, inspections: inspections.inspections, defects: defects.defects, nameOf: work.nameOf }) : { events: [], undated: 0 }, [role, userId, projectId, work.project, work.pins, work.blueprints, inspections.inspections, defects.defects, work.nameOf])
  return { ...data, project: work.project, loading: work.loading || inspections.loading || defects.loading, error: work.error || inspections.error || defects.error, notFound: work.notFound, today: work.today, reload }
}

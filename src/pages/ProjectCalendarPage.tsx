import ProjectCalendar from "../components/calendar/ProjectCalendar"
import { EmptyState } from "../components/ui/PageParts"
import { useAuth } from "../lib/auth"
import { getSelectedProjectId } from "../lib/projects"
import { useProjectCalendar } from "../lib/projectCalendar"
import { calendarRoleMatches, type CalendarRole } from "../lib/projectCalendarModel"

export default function ProjectCalendarPage({ role }: { role: CalendarRole }) {
  const { profile } = useAuth()
  const projectId = getSelectedProjectId()
  const allowed = calendarRoleMatches(role, profile?.role) && profile?.status === "active"
  const calendar = useProjectCalendar(allowed ? projectId : null, role, profile?.id ?? null)
  if (!allowed) return <div className={`${role}-page`}><EmptyState title="Calendar unavailable">Your account cannot access this workspace.</EmptyState></div>
  if (!projectId) return <div className={`${role}-page`}><EmptyState title="Choose a project">Open a project to see its own calendar.</EmptyState></div>
  if (calendar.notFound && !calendar.loading) return <div className={`${role}-page`}><EmptyState title="Project unavailable">The project was removed or your access has changed.</EmptyState></div>
  return <div className={`${role}-page`}><ProjectCalendar key={`${role}:${projectId}`} role={role} projectId={projectId} projectName={calendar.project?.name ?? "Loading project"} projectCode={calendar.project?.code ?? ""} today={calendar.today} events={calendar.events} undated={calendar.undated} loading={calendar.loading || !calendar.project} error={calendar.error} onReload={() => void calendar.reload()} /></div>
}

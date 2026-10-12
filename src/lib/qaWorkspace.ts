import { useCallback, useMemo } from "react"
import { useDefects, useInspections, useQaSummary, useTemplates } from "./qa"
import { useProjectWork } from "./projectWork"
import { useSettings } from "./settings"

// Everything the QA screens of one project share, loaded once: project, team, pins, checklists, inspections, defects, summary and the
// company's pass mark and weights. `reloadAll` is called after every change so lists, counters and badges agree.
export function useQaWorkspace(projectId: string | null) {
  const work = useProjectWork(projectId)
  const { settings, loading: settingsLoading } = useSettings()
  const templates = useTemplates(projectId)
  const inspections = useInspections(projectId)
  const defects = useDefects(projectId)
  const summary = useQaSummary(projectId)
  const { reload: reloadTemplates } = templates
  const { reload: reloadInspections } = inspections
  const { reload: reloadDefects } = defects
  const { reload: reloadSummary } = summary

  const reloadAll = useCallback(async () => {
    await Promise.all([reloadTemplates(), reloadInspections(), reloadDefects(), reloadSummary()])
  }, [reloadTemplates, reloadInspections, reloadDefects, reloadSummary])

  const foremen = useMemo(() => work.team.filter((member) => member.role === "foreman"), [work.team])
  const weights = settings.weights
  const threshold = settings.threshold

  return {
    projectId,
    work,
    project: work.project,
    nameOf: work.nameOf,
    today: work.today,
    foremen,
    weights,
    threshold,
    standards: settings.standards,
    templates: templates.templates,
    inspections: inspections.inspections,
    defects: defects.defects,
    summary: summary.summary,
    loading: work.loading || templates.loading || inspections.loading || defects.loading || settingsLoading,
    summaryLoading: summary.loading,
    error: templates.error || inspections.error || defects.error,
    reloadAll,
    reloadTemplates,
  }
}

export type QaWorkspace = ReturnType<typeof useQaWorkspace>

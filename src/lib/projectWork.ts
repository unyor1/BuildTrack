import { useCallback, useMemo } from "react"
import { useBlueprints, useProjectPins } from "./blueprints"
import { manilaToday } from "./progress"
import { useProject, useProjectTeam } from "./projects"
import { byProject, useLiveReload } from "./realtime"

// Everything an engineer's page needs about one project in one place: project, sheets, pins and who is on the team.
export function useProjectWork(projectId: string | null) {
  const { project, loading: projectLoading, notFound } = useProject(projectId)
  const { blueprints, loading: sheetsLoading, error: sheetsError, reload: reloadSheets } = useBlueprints(projectId)
  useLiveReload([...byProject("blueprints",projectId),{table:"blueprint_revisions"}],()=>void reloadSheets())
  const { pins, setPins, loading: pinsLoading, error, reload: reloadPins } = useProjectPins(projectId, true)
  const { team } = useProjectTeam(projectId)
  const reload=useCallback(async()=>{await Promise.all([reloadSheets(),reloadPins()])},[reloadSheets,reloadPins])

  const lookups = useMemo(() => {
    const names = new Map(team.map((member) => [member.user_id, member.full_name]))
    const sheets = new Map(blueprints.map((sheet) => [sheet.id, sheet]))
    return {
      nameOf: (id: string | null) => (id ? (names.get(id) ?? "Someone on the team") : "Unassigned"),
      sheetOf: (id: string) => sheets.get(id)?.title ?? "Sheet",
    }
  }, [team, blueprints])

  return {
    project,
    notFound,
    blueprints,
    pins,
    setPins,
    team,
    loading: projectLoading || sheetsLoading || pinsLoading,
    error: error || sheetsError,
    today: manilaToday(),
    reload,
    reloadPins,
    ...lookups,
  }
}

import { useCallback, useEffect, useRef, useState } from "react"
import type { DailyReport } from "./reportFormat"
import { supabase } from "./supabase"
import { fetchAll } from "./paging"
import { byProject, useLiveReload } from "./realtime"

export * from "./reportFormat"

// Reports of one project, newest first. The database decides what the caller may see (own drafts, everyone's submitted reports).
export function useDailyReports(projectId: string | null) {
  const generation = useRef(0)
  const [reports, setReports] = useState<DailyReport[]>([])
  const [loading, setLoading] = useState(Boolean(projectId))
  const [error, setError] = useState("")
  const reload = useCallback(async () => {
    const run = ++generation.current
    if (!projectId) {
      setReports([])
      setError("")
      setLoading(false)
      return
    }
    const { data, error: loadError } = await fetchAll<DailyReport>((from, to) => supabase.from("daily_reports").select("*").eq("project_id", projectId).order("report_date", { ascending: false }).order("id").range(from, to))
    if (run !== generation.current) return
    setError(loadError ? "Could not load the reports. Check your connection and try again." : "")
    setReports(data)
    setLoading(false)
  }, [projectId])
  useEffect(() => {
    setReports([])
    setLoading(Boolean(projectId))
    void reload()
    return () => { generation.current++ }
  }, [reload, projectId])
  useLiveReload(byProject("daily_reports", projectId), reload)
  return { reports, loading, error, reload }
}

export type ProjectQuestion = {
  id: string
  project_id: string
  pin_id: string | null
  author_id: string
  question: string
  answer: string | null
  answered_by: string | null
  answered_at: string | null
  created_at: string
}

export function useQuestions(projectId: string | null) {
  const [questions, setQuestions] = useState<ProjectQuestion[]>([])
  const [loading, setLoading] = useState(Boolean(projectId))
  const [error, setError] = useState("")
  const reload = useCallback(async () => {
    if (!projectId) {
      setQuestions([])
      setLoading(false)
      return
    }
    const { data, error: loadError } = await fetchAll<ProjectQuestion>((from, to) => supabase.from("project_questions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).order("id").range(from, to))
    setError(loadError ? "Could not load the questions. Check your connection and try again." : "")
    setQuestions(data)
    setLoading(false)
  }, [projectId])
  useEffect(() => {
    setLoading(Boolean(projectId))
    void reload()
  }, [reload, projectId])
  useLiveReload(byProject("project_questions", projectId), reload)
  return { questions, loading, error, reload }
}

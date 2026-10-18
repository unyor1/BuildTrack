import { useEffect, useMemo, useState } from "react"
import AssignedProjects from "./AssignedProjects"
import { PageHead } from "./ui/PageParts"
import { useAuth } from "../lib/auth"
import { fetchAll } from "../lib/paging"
import { openProject } from "../lib/projects"
import { useQaLite } from "../lib/qaLite"
import { useLiveReload } from "../lib/realtime"
import { supabase } from "../lib/supabase"

type Chip = { label: string; count: number; tone: string }
const amber = "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100"
const red = "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100"
const sky = "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100"

// What waits in each project, so the list shows where to go first. Row Level Security limits every count to the person's projects.
function useProjectAttention(role: "engineer" | "foreman", me: string | null) {
  const qa = useQaLite("projects")
  const [pins, setPins] = useState<Array<{ project_id: string; status: string }>>([])
  const [tick, setTick] = useState(0)
  useLiveReload([{ table: "pins" }], () => setTick((value) => value + 1))
  useEffect(() => {
    let active = true
    if (!me) return
    void fetchAll<{ project_id: string; status: string }>((from, to) => {
      const query = supabase.from("pins").select("project_id,status").neq("category", "note")
      return (role === "engineer" ? query.in("status", ["for_review", "issue"]) : query.eq("assigned_to", me).neq("status", "verified")).order("id").range(from, to)
    }).then((result) => { if (active && !result.error) setPins(result.data) })
    return () => { active = false }
  }, [role, me, tick])
  return useMemo(() => (projectId: string): Chip[] => {
    const here = pins.filter((pin) => pin.project_id === projectId)
    if (role === "engineer") return [
      { label: "to review", count: here.filter((pin) => pin.status === "for_review").length, tone: amber },
      { label: "QA to action", count: qa.inspections.filter((row) => row.project_id === projectId && row.status === "requested").length + qa.defects.filter((row) => row.project_id === projectId && row.status === "for_verification").length, tone: amber },
      { label: "open issues", count: here.filter((pin) => pin.status === "issue").length, tone: red },
    ]
    return [
      { label: "assigned to you", count: here.length, tone: sky },
      { label: "to correct", count: qa.defects.filter((row) => row.project_id === projectId && row.assigned_to === me && (row.status === "open" || row.status === "in_progress")).length, tone: amber },
    ]
  }, [pins, qa.inspections, qa.defects, role, me])
}

// Engineer / Foreman home: only the projects assigned to them. Opening one switches the sidebar to that project's own sections,
// so each project's work, QA records and reports stay separate.
export default function FieldProjects({ role, notice }: { role: "engineer" | "foreman"; notice?: string }) {
  const { profile } = useAuth()
  const attention = useProjectAttention(role, profile?.id ?? null)
  return (
    <div className={role === "engineer" ? "engineer-page" : "foreman-page"}>
      <PageHead eyebrow={role === "engineer" ? "Engineering office" : "Field operations"} title="My projects"
        description="Choose a project to open it. Each project has its own sidebar, work, QA records and reports, kept separate from your other projects." />
      {notice ? <p role="status" className="mb-4 rounded-lg bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">{notice}</p> : null}
      <AssignedProjects title="Assigned to you" cardExtra={(projectId) => {
        const chips = attention(projectId).filter((chip) => chip.count)
        return <>
          {chips.length ? chips.map((chip) => <span key={chip.label} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${chip.tone}`}>{chip.count} {chip.label}</span>) : <span className="text-[11px] font-semibold text-fg-muted">Nothing waiting</span>}
          <button type="button" onClick={() => openProject(role, projectId)} className="ml-auto inline-flex min-h-6 items-center text-xs font-bold text-brand-text hover:underline">Open project →</button>
        </>
      }} />
    </div>
  )
}

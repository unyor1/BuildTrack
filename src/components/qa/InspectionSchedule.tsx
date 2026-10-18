import { useState } from "react"
import type { Inspection } from "../../lib/qa"
import { supabase } from "../../lib/supabase"
import { useProjectTeam } from "../../lib/projects"
import { useToast } from "../../lib/toast"
import { buttonSecondary, inputClass } from "../ui/PageParts"

export default function InspectionSchedule({ inspection, canEdit, onChanged }: { inspection: Inspection; canEdit: boolean; onChanged: () => void | Promise<void> }) {
  const { team } = useProjectTeam(inspection.project_id)
  const toast = useToast()
  const [target, setTarget] = useState(inspection.target_at ? new Date(new Date(inspection.target_at).getTime() + 8 * 3600000).toISOString().slice(0, 16) : "")
  const [owner, setOwner] = useState(inspection.escalation_owner ?? "")
  const [busy, setBusy] = useState(false)
  const open = ["requested", "in_progress"].includes(inspection.status)
  const overdue = open && Boolean(inspection.target_at && Date.parse(inspection.target_at) < Date.now())
  const age = Math.max(0, Math.floor((Date.now() - Date.parse(inspection.requested_at)) / 3600000))
  const save = async () => {
    setBusy(true)
    const { error } = await supabase.rpc("set_inspection_schedule", { p_id: inspection.id, p_target: `${target}:00+08:00`, p_owner: owner })
    setBusy(false)
    if (error) return toast.error("Schedule not saved", error.message)
    toast.success("Inspection schedule saved")
    await onChanged()
  }
  return <section className="space-y-2 rounded-xl border border-line p-3" aria-label="Inspection deadline">
    <p className={`text-sm font-bold ${overdue ? "text-danger-fg" : "text-fg"}`}>{overdue ? "Overdue inspection" : "Inspection target"} · {age} hours since request</p>
    {canEdit && open ? <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold">Target (Manila)<input type="datetime-local" className={inputClass} value={target} onChange={e => setTarget(e.target.value)} /></label>
      <label className="text-xs font-semibold">Escalation owner<select className={inputClass} value={owner} onChange={e => setOwner(e.target.value)}><option value="">Select Engineer</option>{team.filter(m => m.role === "engineer").map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></label>
      <button type="button" className={buttonSecondary} disabled={busy || !target || !owner} onClick={() => void save()}>Save target</button>
    </div> : <p className="text-xs text-fg-muted">{inspection.target_at ? new Date(inspection.target_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "No target recorded"} · {team.find(m => m.user_id === inspection.escalation_owner)?.full_name ?? "Unassigned"}</p>}
  </section>
}

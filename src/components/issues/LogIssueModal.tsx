import { useRef, useState, type FormEvent } from "react"
import Modal from "../Modal"
import { buttonDanger, buttonSecondary, inputClass } from "../ui/PageParts"
import { severityLabels, useChecklist, type Pin, type PinSeverity } from "../../lib/blueprints"
import { severityOrder } from "../../lib/progress"
import { logSiteIssue, type IssuePhotoDraft } from "../../lib/siteIssues"
import IssuePhotoPicker from "./IssuePhotoPicker"
import { issueChecklistSelectionProblem } from "../../lib/issueChecklist"

export default function LogIssueModal({pins,sheetOf,onClose,onDone}:{pins:Pin[];sheetOf:(id:string)=>string;onClose:()=>void;onDone:()=>Promise<void>}) {
  const candidates=pins.filter(pin=>!["verified","for_review"].includes(pin.status) && pin.category!=="note")
  const [pinId,setPinId]=useState(candidates[0]?.id ?? "")
  const [checklistItemId,setChecklistItemId]=useState("")
  const checklist=useChecklist(pinId || null)
  const checklistItems=checklist.items.filter(item=>item.pin_id===pinId)
  const checklistProblem=issueChecklistSelectionProblem(pinId,checklistItemId,checklist.items,checklist.loading,checklist.error)
  const [severity,setSeverity]=useState<PinSeverity>("medium")
  const [reason,setReason]=useState("")
  const [photos,setPhotos]=useState<IssuePhotoDraft[]>([])
  const [error,setError]=useState("")
  const [busy,setBusy]=useState(false)
  const requestId=useRef(crypto.randomUUID())
  const pending=useRef(false)
  const close=()=>{if(!pending.current && ((!reason.trim() && !photos.length) || window.confirm("Discard this unsaved issue report?"))) onClose()}
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(pending.current) return
    const pin=candidates.find(row=>row.id===pinId)
    if(!pin) return setError("Choose an available work pin.")
    if(checklistProblem) return setError(checklistProblem)
    if(reason.trim().length<5) return setError("Describe the issue (at least 5 characters).")
    pending.current=true;setBusy(true);setError("")
    try{await logSiteIssue({id:requestId.current,projectId:pin.project_id,pinId,checklistItemId:checklistItemId || null,severity,description:reason.trim(),photos});await onDone()}catch(e){setError((e as Error).message)}finally{pending.current=false;setBusy(false)}
  }
  return <Modal title="Log an issue" size="xl" description="Linked to a work pin and optionally one of its checklist items. Visible to the assigned Foreman. Original photos and all saved markup versions are preserved." onClose={close} footer={<><button type="button" className={buttonSecondary} disabled={busy} onClick={close}>Cancel</button><button type="submit" form="log-site-issue" className={buttonDanger} disabled={busy || !candidates.length || Boolean(checklistProblem)}>{busy ? "Uploading and saving…" : "Log issue"}</button></>}>
    {!candidates.length ? <p className="text-sm text-fg-muted">No available work pins. Add a pin on the plan, or finish/reopen its current review first.</p> : <form id="log-site-issue" className="space-y-4" onSubmit={event=>void submit(event)}>
      <label className="block text-sm font-bold">Work pin<select className={`${inputClass} mt-1`} disabled={busy} value={pinId} onChange={e=>{setPinId(e.target.value);setChecklistItemId("");setError("")}}>{candidates.map(pin=><option key={pin.id} value={pin.id}>{pin.title} ({sheetOf(pin.blueprint_id)})</option>)}</select></label>
      <label className="block text-sm font-bold">Checklist item<select className={`${inputClass} mt-1`} disabled={busy || checklist.loading || Boolean(checklist.error)} value={checklistItemId} onChange={e=>setChecklistItemId(e.target.value)}>
        <option value="">Whole work pin / no specific checklist item</option>
        {checklistItems.map(item=><option key={item.id} value={item.id}>{item.text}</option>)}
      </select></label>
      {checklistProblem ? <p role="status" className="text-xs text-fg-muted">{checklistProblem} {checklist.error ? <button type="button" className="font-bold underline" onClick={()=>void checklist.reload()}>Retry checklist</button> : null}</p> : !checklistItems.length ? <p className="text-xs text-fg-muted">This pin has no checklist items yet. The issue will apply to the whole work pin.</p> : null}
      <label className="block text-sm font-bold">Severity<select className={`${inputClass} mt-1`} disabled={busy} value={severity} onChange={e=>setSeverity(e.target.value as PinSeverity)}>{severityOrder.slice().reverse().map(value=><option key={value} value={value}>{severityLabels[value]}</option>)}</select></label>
      <label className="block text-sm font-bold">What is wrong? *<textarea className={`${inputClass} mt-1`} rows={3} minLength={5} maxLength={1000} required disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <IssuePhotoPicker photos={photos} onChange={setPhotos} disabled={busy}/>
      {error ? <p role="alert" className="text-sm text-danger-fg">{error}</p> : null}
    </form>}
  </Modal>
}

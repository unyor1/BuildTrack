import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "./supabase"
import { fetchAll } from "./paging"
import { byColumn, byProject, useLiveReload } from "./realtime"
import { issuePhotoProblem, markupProblem, type IssueMarkup } from "./issueMarkup"

export type SiteIssueReport = { id: string; pin_id: string; project_id: string; checklist_item_id: string | null; checklist_name: string | null; description: string; severity: string; raised_by: string | null; created_at: string }
export type SiteIssuePhoto = { id: string; report_id: string; project_id: string; path: string; caption: string; annotations: IssueMarkup[]; version: number; uploaded_by: string | null; updated_by: string | null; created_at: string; updated_at: string }
export type IssuePhotoRevision = { photo_id: string; version: number; annotations: IssueMarkup[]; caption: string; edited_by: string | null; created_at: string }
export type IssuePhotoDraft = { id: string; file: File; url: string; caption: string; annotations: IssueMarkup[] }

export function useIssueRegister(projectId: string | null) {
  const [reports,setReports]=useState<SiteIssueReport[]>([])
  const [raised,setRaised]=useState<Record<string,string>>({})
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(Boolean(projectId))
  const sequence=useRef(0)
  const reload=useCallback(async()=>{
    const current=++sequence.current
    if(!projectId) {setReports([]);setRaised({});setError("");setLoading(false);return}
    const [observations,events]=await Promise.all([
      fetchAll<SiteIssueReport>((from,to)=>supabase.from("site_issue_reports").select("*").eq("project_id",projectId).order("created_at").order("id").range(from,to)),
      fetchAll<{pin_id:string;created_at:string}>((from,to)=>supabase.from("pin_events").select("pin_id,created_at").eq("project_id",projectId).eq("kind","status").eq("to_status","issue").order("id").range(from,to)),
    ])
    if(current!==sequence.current) return
    setError(observations.error || events.error ? "Could not load issue history. Refresh before making changes." : "")
    if(!observations.error && !events.error) {
      const dates:Record<string,string>={}
      for(const row of [...events.data,...observations.data]) if(!dates[row.pin_id] || row.created_at>dates[row.pin_id]) dates[row.pin_id]=row.created_at
      setRaised(dates);setReports(observations.data)
    }
    setLoading(false)
  },[projectId])
  useEffect(()=>{setReports([]);setRaised({});setError("");setLoading(Boolean(projectId));void reload();return()=>{sequence.current++}},[reload,projectId])
  useLiveReload([...byProject("site_issue_reports",projectId),...byProject("pin_events",projectId)],()=>void reload())
  return {reports,raised,everRaised:new Set(Object.keys(raised)),error,loading,reload}
}

export function useIssueEvidence(pinId: string) {
  const [reports,setReports]=useState<Array<SiteIssueReport & {site_issue_photos:SiteIssuePhoto[]}>>([])
  const [error,setError]=useState("")
  const [loading,setLoading]=useState(true)
  const sequence=useRef(0)
  const reload=useCallback(async()=>{
    const current=++sequence.current
    const result=await fetchAll<SiteIssueReport & {site_issue_photos:SiteIssuePhoto[]}>((from,to)=>supabase.from("site_issue_reports").select("*,site_issue_photos(*)").eq("pin_id",pinId).order("created_at",{ascending:false}).order("id").range(from,to))
    if(current!==sequence.current) return
    setError(result.error ? "Could not load issue descriptions and photos." : "")
    if(!result.error) setReports(result.data)
    setLoading(false)
  },[pinId])
  useEffect(()=>{setReports([]);setLoading(true);void reload();return()=>{sequence.current++}},[reload])
  useLiveReload([...byColumn("site_issue_reports","pin_id",pinId),{table:"site_issue_photos"}],()=>void reload())
  return {reports,error,loading,reload}
}

// Stage original bytes in a private bucket. The RPC attaches the whole batch atomically; RLS protects attached originals from cleanup.
async function uploadDrafts(projectId:string,pinId:string,drafts:IssuePhotoDraft[]) {
  const uploaded:string[]=[]
  try {
    const payload=[]
    for(const draft of drafts) {
      const problem=issuePhotoProblem(draft.file) || markupProblem(draft.annotations)
      if(problem) throw new Error(problem)
      const ext=draft.file.type === "image/jpeg" ? "jpg" : draft.file.type === "image/png" ? "png" : "webp"
      const path=`${projectId}/${pinId}/${crypto.randomUUID()}.${ext}`
      const {error}=await supabase.storage.from("issue-photos").upload(path,draft.file,{contentType:draft.file.type,upsert:false})
      if(error) throw new Error(error.message)
      uploaded.push(path);payload.push({path,caption:draft.caption,annotations:draft.annotations})
    }
    return {payload,uploaded}
  } catch(e) {if(uploaded.length) await supabase.storage.from("issue-photos").remove(uploaded);throw e}
}

export async function logSiteIssue(input:{id:string;projectId:string;pinId:string;checklistItemId?:string|null;severity:string;description:string;photos:IssuePhotoDraft[]}) {
  // Retry after a lost response must not create a second issue or re-upload the batch.
  const known=await supabase.from("site_issue_reports").select("id").eq("id",input.id).maybeSingle()
  if(known.error) throw new Error(known.error.message)
  if(known.data) return
  const batch=await uploadDrafts(input.projectId,input.pinId,input.photos)
  const {error}=await supabase.rpc("log_site_issue",{p_id:input.id,p_pin:input.pinId,p_severity:input.severity,p_description:input.description,p_photos:batch.payload,p_checklist_item:input.checklistItemId ?? null})
  if(error) {
    const check=await supabase.from("site_issue_reports").select("id").eq("id",input.id).maybeSingle()
    if(check.data) return
    if(batch.uploaded.length) await supabase.storage.from("issue-photos").remove(batch.uploaded)
    throw new Error(error.message)
  }
}

export async function addSiteIssuePhotos(projectId:string,pinId:string,reportId:string,drafts:IssuePhotoDraft[]) {
  const batch=await uploadDrafts(projectId,pinId,drafts)
  const {error}=await supabase.rpc("add_site_issue_photos",{p_report:reportId,p_photos:batch.payload})
  if(error) {if(batch.uploaded.length) await supabase.storage.from("issue-photos").remove(batch.uploaded);throw new Error(error.message)}
}

export async function saveSiteIssuePhoto(photo:SiteIssuePhoto,annotations:IssueMarkup[],caption:string) {
  const {error}=await supabase.rpc("save_site_issue_photo",{p_photo:photo.id,p_version:photo.version,p_annotations:annotations,p_caption:caption})
  if(error) throw new Error(error.message)
}

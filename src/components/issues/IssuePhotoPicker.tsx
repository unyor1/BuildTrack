import { useEffect, useRef, useState } from "react"
import { ISSUE_PHOTO_LIMIT, issuePhotoProblem } from "../../lib/issueMarkup"
import type { IssuePhotoDraft } from "../../lib/siteIssues"
import { buttonSecondary } from "../ui/PageParts"
import IssuePhotoEditor, { MarkupLayer } from "./IssuePhotoEditor"

export default function IssuePhotoPicker({photos,onChange,disabled=false,limit=ISSUE_PHOTO_LIMIT}:{photos:IssuePhotoDraft[];onChange:(photos:IssuePhotoDraft[])=>void;disabled?:boolean;limit?:number}) {
  const [editing,setEditing]=useState<string|null>(null)
  const [error,setError]=useState("")
  const urls=useRef(new Set<string>())
  useEffect(()=>()=>{for(const url of urls.current) URL.revokeObjectURL(url)},[])
  const add=(files:FileList|null)=>{
    if(!files) return
    const list=Array.from(files)
    if(photos.length+list.length>limit) return setError(`You can add ${limit} photos here. Remove some or select fewer.`)
    for(const file of list) {const why=issuePhotoProblem(file);if(why) return setError(`${file.name}: ${why}`)}
    setError("")
    onChange([...photos,...list.map(file=>{const url=URL.createObjectURL(file);urls.current.add(url);return {id:crypto.randomUUID(),file,url,caption:file.name.slice(0,500),annotations:[]}})])
  }
  const current=photos.find(photo=>photo.id===editing)
  return <section className="space-y-3 rounded-xl border border-line p-3" aria-label="Issue photos">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Photos ({photos.length}/{limit})</h3><label className={`${buttonSecondary} cursor-pointer ${disabled ? "pointer-events-none opacity-50" : ""}`}>Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled} className="sr-only" onChange={e=>{add(e.currentTarget.files);e.currentTarget.value=""}} /></label></div>
    <p className="text-xs text-fg-muted">JPEG, PNG or WebP, up to 8 MB each. Select several at once. Annotate each photo before submitting; originals are preserved.</p>
    {error ? <p role="alert" className="text-xs text-danger-fg">{error}</p> : null}
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{photos.map(photo=><li key={photo.id} className="min-w-0 rounded-lg border border-line p-2">
      <button type="button" disabled={disabled} className="block w-full" onClick={()=>setEditing(photo.id)} aria-label={`Annotate ${photo.caption}`}><DraftThumbnail photo={photo} /></button>
      <p className="mt-1 truncate text-xs" title={photo.caption}>{photo.caption}</p>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" className={buttonSecondary+" !px-2 !py-1 !text-xs"} disabled={disabled} onClick={()=>setEditing(photo.id)}>Edit / annotate</button><button type="button" className={buttonSecondary+" !px-2 !py-1 !text-xs"} disabled={disabled} onClick={()=>{URL.revokeObjectURL(photo.url);urls.current.delete(photo.url);onChange(photos.filter(p=>p.id!==photo.id))}}>Remove</button></div>
    </li>)}</ul>
    {current ? <IssuePhotoEditor key={current.id} src={current.url} initial={current.annotations} caption={current.caption} onClose={()=>setEditing(null)} onSave={(annotations,caption)=>onChange(photos.map(photo=>photo.id===current.id ? {...photo,annotations,caption} : photo))} /> : null}
  </section>
}

function DraftThumbnail({photo}:{photo:IssuePhotoDraft}) {
  const [height,setHeight]=useState(750)
  return <div className="relative overflow-hidden rounded bg-black/10"><img src={photo.url} alt={photo.caption} className="max-h-40 w-full object-contain" onLoad={e=>setHeight(1000*e.currentTarget.naturalHeight/e.currentTarget.naturalWidth)} /><svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 1000 ${height}`}><MarkupLayer items={photo.annotations} height={height} /></svg></div>
}

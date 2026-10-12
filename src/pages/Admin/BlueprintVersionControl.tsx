import { useEffect, useState } from "react"
import AdminProjectSelect, { useAdminProject } from "../../components/AdminProjectSelect"
import { EmptyState } from "../../components/ui/PageParts"
import { SkeletonRows } from "../../components/ui/Skeleton"
import { formatStamp, signedUrl, type Revision } from "../../lib/blueprints"
import { useProjectWork } from "../../lib/projectWork"
import { useToast } from "../../lib/toast"
import { supabase } from "../../lib/supabase"
import { PageIntro, Panel, StatusBadge } from "./AdminShell"
import type { AdminPageProps } from "./types"

const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

// Every revision of every sheet: who uploaded it, when, what changed, and a download of the original file. Revisions are never edited.
export default function BlueprintVersionControl(_: AdminPageProps) {
  const { projects, projectId, choose, loading: projectsLoading } = useAdminProject()
  const work = useProjectWork(projectId)
  const toast = useToast()
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const ids = [...new Set(work.blueprints.flatMap((sheet) => sheet.blueprint_revisions.map((revision) => revision.uploaded_by)).filter((id): id is string => Boolean(id)))]
    if (!ids.length) return
    let active = true
    // Needs the View users permission; without it the uploader column simply stays empty.
    supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", ids)
      .then(({ data }) => {
        if (active) setNames(new Map(((data as Array<{ id: string; full_name: string | null; email: string }> | null) ?? []).map((row) => [row.id, row.full_name || row.email])))
      })
    return () => {
      active = false
    }
  }, [work.blueprints])

  const download = async (revision: Revision) => {
    setBusy(revision.id)
    const url = await signedUrl("blueprints", revision.file_path)
    setBusy(null)
    if (!url) return toast.error("Could not open the file", "You may not be allowed to read it, or it no longer exists.")
    window.open(url, "_blank", "noopener")
  }

  const loading = projectsLoading || work.loading
  return (
    <div className="admin-page">
      <PageIntro eyebrow="Plans" title="Version control" description="The history of every sheet. Each revision is kept as uploaded; a new revision never overwrites an old one." />
      <div className="mb-4"><AdminProjectSelect projects={projects} value={projectId} onChange={choose} /></div>
      {loading ? (
        <Panel><table className="admin-table"><tbody><SkeletonRows rows={4} cols={6} /></tbody></table></Panel>
      ) : work.blueprints.length === 0 ? (
        <EmptyState title="No sheets yet">Upload the first sheet in Blueprint Upload.</EmptyState>
      ) : (
        work.blueprints.map((sheet) => (
          <Panel key={sheet.id} title={<>{sheet.title}{sheet.level ? <span className="ml-2 text-sm font-normal text-fg-muted">level {sheet.level}</span> : null}</>} action={sheet.base_locked ? <StatusBadge tone="warning">Base layer locked</StatusBadge> : <span className="admin-panel-note">{sheet.blueprint_revisions.length} revision{sheet.blueprint_revisions.length === 1 ? "" : "s"}</span>}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Revision</th><th>Uploaded</th><th>By</th><th>File</th><th>Size</th><th>What changed</th><th /></tr></thead>
                <tbody>
                  {sheet.blueprint_revisions.map((revision, index) => (
                    <tr key={revision.id}>
                      <td className="is-strong">Rev {revision.revision} {index === 0 ? <StatusBadge tone="success">Current</StatusBadge> : null}</td>
                      <td className="is-muted">{formatStamp(revision.created_at)}</td>
                      <td>{(revision.uploaded_by && names.get(revision.uploaded_by)) || "—"}</td>
                      <td className="is-muted">{revision.file_name}</td>
                      <td className="is-muted">{size(revision.size_bytes)}</td>
                      <td className="max-w-xs break-words text-xs">{revision.notes || "—"}</td>
                      <td><button type="button" className="rounded-md border border-line px-2.5 py-1 text-xs font-bold hover:bg-surface-muted disabled:opacity-60" disabled={busy === revision.id} onClick={() => void download(revision)}>{busy === revision.id ? "Opening..." : "Download"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}
    </div>
  )
}

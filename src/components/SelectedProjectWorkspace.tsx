import { useState } from "react"
import BlueprintEditor from "./editor/BlueprintEditor"
import type { EditorRole } from "./editor/Inspector"
import { Skeleton, SkeletonCardGrid } from "./ui/Skeleton"
import { getSelectedProjectId, disciplineLabels, useProject } from "../lib/projects"
import { useBlueprints, useSignedUrl, type Blueprint } from "../lib/blueprints"

function SheetCard({ blueprint, index, onOpen }: { blueprint: Blueprint; index: number; onOpen: () => void }) {
  const revision = blueprint.blueprint_revisions[0]
  const { url, failed } = useSignedUrl("blueprints", revision ? (revision.thumb_path ?? revision.preview_path) : null)
  return (
    <button type="button" onClick={onOpen} className="group overflow-hidden rounded-xl border border-line bg-surface text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
      <div className="aspect-[4/3] w-full bg-white">
        {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" /> : failed || !revision ? <div className="flex h-full items-center justify-center bg-surface-muted text-xs text-fg-muted">{revision ? "No preview" : "No file yet"}</div> : <Skeleton className="h-full w-full rounded-none" />}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-bold text-fg">Sheet {String(index + 1).padStart(2, "0")} - {blueprint.title}</p>
        <p className="truncate text-xs text-fg-muted">{[blueprint.level, blueprint.discipline ? disciplineLabels[blueprint.discipline] : null, revision ? `Rev ${revision.revision}` : null].filter(Boolean).join(" • ")}</p>
      </div>
    </button>
  )
}

// Sheets of the selected project with an "Open editor" button. The editor itself fills the whole window.
export default function SelectedProjectWorkspace({ role, canEdit }: { role: EditorRole; canEdit: boolean }) {
  const projectId = getSelectedProjectId()
  const { project, loading, notFound } = useProject(projectId)
  const { blueprints, loading: sheetsLoading, error, reload } = useBlueprints(project ? project.id : null)
  const [open, setOpen] = useState(false)

  if (!projectId || notFound) return null // ProjectContextBar above already explains it
  if (loading || !project) return <SkeletonCardGrid count={3} label="Loading sheets" />

  return (
    <section className="mb-6 space-y-3 text-fg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="border-l-4 border-accent pl-3 text-lg font-extrabold text-brand-strong">Sheets and pins ({blueprints.length})</h2>
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover">
          {canEdit ? "Open the editor" : "Open the plan"}
        </button>
      </div>
      {error ? <p className="flex items-center gap-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}<button className="font-bold underline" onClick={() => void reload()}>Retry</button></p> : null}
      {sheetsLoading ? <SkeletonCardGrid count={3} label="Loading sheets" /> : blueprints.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-fg-muted">{canEdit ? "No sheet has been uploaded yet. Open the editor and use the Sheet button to upload the first plan." : "No sheet has been uploaded for this project yet."}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {blueprints.map((bp, index) => <SheetCard key={bp.id} blueprint={bp} index={index} onOpen={() => setOpen(true)} />)}
        </div>
      )}
      {open ? <BlueprintEditor projectId={project.id} role={role} canEdit={canEdit} onExit={() => { setOpen(false); void reload() }} /> : null}
    </section>
  )
}

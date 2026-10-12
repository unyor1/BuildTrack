import PhotoGallery from "../../components/PhotoGallery"
import ProjectContextBar from "../../components/ProjectContextBar"
import { PageHead } from "../../components/ui/PageParts"
import { getSelectedProjectId } from "../../lib/projects"
import { useProjectWork } from "../../lib/projectWork"
import type { ForemanPageProps } from "./types"

// Evidence of the work: every photo the team attached to a pin. New photos are added from the pin's Report dialog.
export default function ForemanPhotoDocumentation({ onNavigate }: ForemanPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  return (
    <div className="foreman-page">
      <ProjectContextBar listPath="/foreman/dashboard" listLabel="My projects" />
      <PageHead
        eyebrow="Evidence"
        title="Photo documentation"
        description="All photos of the work. To add one, open the work item on your dashboard, press Report and add the photo there. It is saved with that item's timeline."
        actions={<button type="button" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover" onClick={() => onNavigate("dashboard")}>Go to my work</button>}
      />
      {projectId ? <PhotoGallery projectId={projectId} pins={work.pins} loading={work.loading} emptyHint="No photos have been added to this project yet." /> : null}
    </div>
  )
}

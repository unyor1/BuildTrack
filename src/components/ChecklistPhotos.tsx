import { useEffect, useMemo, useState } from "react"
import { PhotoGrid } from "./PhotoGallery"
import WorkFilters from "./WorkFilters"
import { useBlueprints, useProjectPins, type Pin } from "../lib/blueprints"
import { useEvidencePhotos, useProjectWorkItems } from "../lib/dailyPhotos"
import { changePhotoScope, emptyPhotoScope, type PhotoScope } from "../lib/photoGalleryModel"
import { useProjectTeam } from "../lib/projects"

const startScope = (pin: Pin): PhotoScope => ({ sheet: pin.blueprint_id, pin: pin.id, item: "" })

// A pin's photos are the photos of its checklist (work) items. Same filter bar as Photo documentation, starting on this pin;
// photos are added on each item in the Checklist tab (Upload photos / Take photo).
export default function ChecklistPhotos({ pin }: { pin: Pin }) {
  const [scope, setScope] = useState<PhotoScope>(() => startScope(pin))
  useEffect(() => { setScope(startScope(pin)) }, [pin.id, pin.blueprint_id]) // eslint-disable-line react-hooks/exhaustive-deps
  const { blueprints } = useBlueprints(pin.project_id)
  const { pins } = useProjectPins(pin.project_id)
  const items = useProjectWorkItems(pin.project_id, true)
  const { team } = useProjectTeam(pin.project_id)
  const { photos, loading, error, reload } = useEvidencePhotos(pin.project_id, "checklist", undefined, undefined, scope)
  const sheetOfPin = useMemo(() => new Map(pins.map((row) => [row.id, row.blueprint_id])), [pins])

  return (
    <div className="space-y-3">
      <WorkFilters label="Filter photos" sheets={blueprints} pins={pins} items={items} scope={scope}
        onChange={(key, value) => setScope((current) => changePhotoScope(current, key, value, (id) => sheetOfPin.get(id)))} onClear={() => setScope(emptyPhotoScope)} />
      {error ? <p role="alert" className="text-sm text-danger-fg">{error} <button type="button" className="min-h-6 underline" onClick={() => void reload()}>Retry</button></p>
        : <PhotoGrid key={`${scope.sheet}:${scope.pin}:${scope.item}`} variant="tiles" bucket="pin-photos" loading={loading}
            photos={photos.map((photo) => ({ ...photo, uploaderName: team.find((person) => person.user_id === photo.uploaded_by)?.full_name }))}
            emptyHint={scope.pin ? "No checklist photos yet. Add them on each item in the Checklist tab." : "No checklist photos match these filters."} />}
      <p className="text-xs text-fg-muted">{loading || error ? "" : `${photos.length} photo${photos.length === 1 ? "" : "s"} · `}Tap a tile to open it; use ‹ › to move between photos. Photos are added per checklist item in the Checklist tab.</p>
    </div>
  )
}

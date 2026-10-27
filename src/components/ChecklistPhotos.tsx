import { useEffect, useMemo, useState } from "react"
import { PhotoGrid } from "./PhotoGallery"
import WorkFilters from "./WorkFilters"
import DateRangeFilter from "./ui/DateRangeFilter"
import { useBlueprints, useProjectPins, type Pin } from "../lib/blueprints"
import { useEvidencePhotos, useProjectWorkItems } from "../lib/dailyPhotos"
import { changePhotoScope, emptyPhotoScope, type PhotoScope, type PhotoDates } from "../lib/photoGalleryModel"
import { useProjectTeam } from "../lib/projects"
import { pastPresets, presetRange, rangeText } from "../lib/dateRangeModel"
import { manilaToday } from "../lib/progress"

const startScope = (pin: Pin): PhotoScope => ({ sheet: pin.blueprint_id, pin: pin.id, item: "" })

// A pin's photos are the photos of its checklist (work) items. Same filter bar as Photo documentation, starting on this pin;
// photos are added on each item in the Checklist tab (Upload photos / Take photo). Original submission evidence and correction
// evidence (photos of a resubmission, qa_attempt_id) are shown apart and never mixed.
export default function ChecklistPhotos({ pin }: { pin: Pin }) {
  const [scope, setScope] = useState<PhotoScope>(() => startScope(pin))
  const today = manilaToday()
  const [dates, setDates] = useState<PhotoDates>(() => presetRange("today", today))
  useEffect(() => { setScope(startScope(pin)); setDates(presetRange("today", manilaToday())) }, [pin.id, pin.blueprint_id]) // eslint-disable-line react-hooks/exhaustive-deps
  const { blueprints } = useBlueprints(pin.project_id)
  const { pins } = useProjectPins(pin.project_id)
  const items = useProjectWorkItems(pin.project_id, true)
  const { team } = useProjectTeam(pin.project_id)
  const sheetOfPin = useMemo(() => new Map(pins.map((row) => [row.id, row.blueprint_id])), [pins])
  const key = `${pin.project_id}:${scope.sheet}:${scope.pin}:${scope.item}:${dates.from}:${dates.to}`

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-surface-muted/40 p-3">
        <DateRangeFilter label="Photo upload date" range={dates} presets={pastPresets} today={today} onChange={setDates} />
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">Showing uploads for {rangeText(dates)} (Philippine time). This tab opens on today only. Pick dates to see older evidence.</p>
      </div>
      <WorkFilters label="Filter photos" sheets={blueprints} pins={pins} items={items} scope={scope}
        onChange={(key, value) => setScope((current) => changePhotoScope(current, key, value, (id) => sheetOfPin.get(id)))} onClear={() => setScope(emptyPhotoScope)} />
      <PinPhotoResults key={key} projectId={pin.project_id} scope={scope} dates={dates} team={team} />
    </div>
  )
}

// A new filter mounts a fresh result list and viewer, so neither stale photos nor a previous slideshow can flash on screen.
function PinPhotoResults({ projectId, scope, dates, team }: { projectId: string; scope: PhotoScope; dates: PhotoDates; team: Array<{ user_id: string; full_name: string }> }) {
  const { photos, loading, error, reload } = useEvidencePhotos(projectId, "checklist", undefined, dates, scope)
  const named = photos.map((photo) => ({ ...photo, uploaderName: team.find((person) => person.user_id === photo.uploaded_by)?.full_name }))
  const original = named.filter((photo) => !photo.qa_attempt_id)
  const corrections = named.filter((photo) => photo.qa_attempt_id)
  return <div className="space-y-4">
      {error ? <p role="alert" className="text-sm text-danger-fg">{error} <button type="button" className="min-h-6 underline" onClick={() => void reload()}>Retry</button></p>
        : <>
            <section aria-label="Original submission evidence" className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">Original submission evidence{loading ? "" : ` (${original.length})`}</h4>
              <PhotoGrid variant="details" bucket="pin-photos" loading={loading} photos={original}
                emptyHint="No checklist photos match the selected dates and work filters. Choose another date, or add photos on the checklist item." />
            </section>
            {!loading && corrections.length ? (
              <section aria-label="Correction evidence" className="space-y-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-fg-muted">Correction evidence ({corrections.length})</h4>
                <PhotoGrid variant="details" bucket="pin-photos" loading={false} photos={corrections} emptyHint="" />
              </section>
            ) : null}
          </>}
      <p className="text-xs text-fg-muted">{loading || error ? "" : `${photos.length} photo${photos.length === 1 ? "" : "s"} · `}Open a photo to view full details and browse the filtered slideshow. Photos are added per checklist item in the Checklist tab.</p>
    </div>
}

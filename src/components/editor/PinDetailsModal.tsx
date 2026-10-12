import { useState } from "react"
import Modal from "../Modal"
import { PinDetailsTab, type InspectorProps } from "./Inspector"
import { PinChecklist, PinFields, PinPhotos, PinTimeline } from "./PinParts"
import { statusChip, statusDot, statusLabels, type Pin } from "../../lib/blueprints"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-text">{title}</h3>
      {children}
    </section>
  )
}

// The roomy view of one pin: every field, large photos, the whole checklist, the timeline with comments.
// The inspector next to the sheet only shows a summary of this.
export default function PinDetailsModal({ pin, inspector, onClose, onDelete }: { pin: Pin; inspector: InspectorProps; onClose: () => void; onDelete: () => void }) {
  const [refresh, setRefresh] = useState(0)
  const changed = () => {
    inspector.onPinChanged()
    setRefresh((value) => value + 1)
  }
  return (
    <Modal
      title={`${inspector.numberOf(pin)}. ${pin.title}`}
      description={`Pin on ${inspector.blueprint?.title ?? "the sheet"}`}
      size="2xl"
      onClose={onClose}
      footer={
        <>
          {inspector.canEdit ? <button type="button" onClick={onDelete} className="mr-auto rounded-lg border border-line px-4 py-2 text-sm font-semibold text-danger-fg hover:bg-danger-soft">Delete pin</button> : null}
          <button type="button" onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover">Done</button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: statusDot[pin.status] }}>{inspector.numberOf(pin)}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChip[pin.status]}`}>{statusLabels[pin.status]}</span>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Section title="Progress">
            <PinDetailsTab {...inspector} pin={pin} inDialog />
          </Section>
          {inspector.canEdit ? (
            <Section title="Edit details">
              <PinFields pin={pin} team={inspector.team} onSaved={changed} idPrefix="dialog-pin" />
            </Section>
          ) : null}
          <Section title="Photos">
            <PinPhotos pin={pin} canAdd={inspector.canReport} canRemoveAny={inspector.canEdit} meId={inspector.meId} columns={3} onChanged={changed} />
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Checklist">
            <PinChecklist pinId={pin.id} canEdit={inspector.canEdit} canTick={inspector.canReport} onChange={undefined} />
          </Section>
          {inspector.role !== "client" ? (
            <Section title="Timeline and comments">
              <PinTimeline pinId={pin.id} canComment={inspector.canReport} refreshKey={refresh} />
            </Section>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}

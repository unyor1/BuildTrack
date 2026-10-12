import { useState, type FormEvent } from "react"
import Modal from "../Modal"
import { buttonPrimary, buttonSecondary, inputClass } from "../ui/PageParts"
import { annotationKindLabels, type Annotation } from "../../lib/blueprints"

export const labelKinds: Annotation["kind"][] = ["shape", "note", "text", "image", "arrow", "cloud"]

// A short note or label for an item: the words of a note or text box, a caption for a picture (also read out as its alternative
// text), a label on a shape, arrow or revision cloud.
export default function LabelDialog({ annotation, onSave, onClose }: { annotation: Annotation; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(annotation.text ?? "")
  const [error, setError] = useState("")
  const content = annotation.kind === "note" || annotation.kind === "text"
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = text.trim()
    if (content && !value) return setError("A note or text box needs some text.")
    if (value.length > 500) return setError("Keep it under 500 characters.")
    onSave(value)
  }
  return (
    <Modal
      title={content ? "Edit the text" : annotation.kind === "image" ? "Caption and alternative text" : "Label"}
      description={annotationKindLabels[annotation.kind]}
      size="sm"
      onClose={onClose}
      footer={<><button type="button" className={buttonSecondary} onClick={onClose}>Cancel</button><button type="submit" form="label-form" className={buttonPrimary}>Save</button></>}
    >
      <form id="label-form" noValidate onSubmit={submit}>
        <label className="block text-sm font-semibold">
          {annotation.kind === "image" ? "Describe the picture" : "Text"}
          <textarea className={`${inputClass} mt-1`} rows={4} maxLength={500} autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder={annotation.kind === "image" ? "e.g. Cracked column C4, north face" : "A short note"} />
        </label>
        {error ? <p role="alert" className="mt-2 text-sm text-danger-fg">{error}</p> : null}
        <p className="mt-2 text-xs text-fg-muted">{annotation.kind === "image" ? "Shown under the picture on the sheet and used as its description for screen readers." : "Appears on the sheet and in the exported drawing."}</p>
      </form>
    </Modal>
  )
}

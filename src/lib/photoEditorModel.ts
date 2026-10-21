import { withRotation, type IssueMarkup, type MarkupTool } from "./issueMarkup.ts"

// Pure rules of the shared photo markup editor: several photos per session, each with its own markup, caption and
// undo / redo history, so switching photos never loses work. Tested in `pnpm test:lib`.

export const HISTORY_LIMIT = 30
export type MarkupPhoto = { id: string; src: string; annotations: IssueMarkup[]; caption: string }
export type MarkupChange = { id: string; annotations: IssueMarkup[]; caption: string }
export type PhotoDoc = { items: IssueMarkup[]; past: IssueMarkup[][]; future: IssueMarkup[][]; note: string }
export type MarkupStyle = Partial<Pick<IssueMarkup, "color" | "stroke" | "fontSize" | "text" | "rotation">>
export type PhotoTool = MarkupTool | "pan"

export const shapeTools = ["line", "arrow", "rectangle", "ellipse", "draw"] as const satisfies readonly MarkupTool[]
export const toolLabels: Record<PhotoTool, string> = { select: "Select", pan: "Pan", text: "Text", line: "Line", arrow: "Arrow", rectangle: "Rectangle", ellipse: "Ellipse", draw: "Freehand" }
export const toolShortcuts: Record<PhotoTool, string> = { select: "V", pan: "H", text: "T", line: "L", arrow: "A", rectangle: "R", ellipse: "E", draw: "D" }
export const ROTATE_STEP = 15
export const NUDGE_STEP = 0.5 // percent of the photo; Shift = 10x
export const toolByKey: Record<string, PhotoTool> = Object.fromEntries(Object.entries(toolShortcuts).map(([tool, key]) => [key.toLowerCase(), tool as PhotoTool]))
// Values stay inside valid_issue_markup: 6-digit colours, text 12-72.
export const markupColors = [
  { name: "Red", value: "#d93a3a" }, { name: "Orange", value: "#f18b00" }, { name: "Yellow", value: "#facc15" }, { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" }, { name: "Magenta", value: "#9e1f93" }, { name: "White", value: "#ffffff" }, { name: "Black", value: "#111111" },
]
export const textSizes = [{ label: "S", value: 18 }, { label: "M", value: 30 }, { label: "L", value: 48 }, { label: "XL", value: 72 }]

export const sameMarkup = (a: IssueMarkup[], b: IssueMarkup[]) => a === b || JSON.stringify(a) === JSON.stringify(b)
export const newDoc = (photo: MarkupPhoto): PhotoDoc => ({ items: photo.annotations, past: [], future: [], note: photo.caption })
export const openDocs = (photos: MarkupPhoto[]): Record<string, PhotoDoc> => Object.fromEntries(photos.map((photo) => [photo.id, newDoc(photo)]))

// A finished edit: `before` goes on the undo stack (the oldest drops off past the limit) and redo is cleared.
export function recordEdit(doc: PhotoDoc, items: IssueMarkup[], before: IssueMarkup[] = doc.items): PhotoDoc {
  if (sameMarkup(items, before)) return { ...doc, items }
  return { ...doc, items, past: [...doc.past, before].slice(-HISTORY_LIMIT), future: [] }
}
export const undoEdit = (doc: PhotoDoc): PhotoDoc =>
  doc.past.length ? { ...doc, items: doc.past[doc.past.length - 1], past: doc.past.slice(0, -1), future: [doc.items, ...doc.future] } : doc
export const redoEdit = (doc: PhotoDoc): PhotoDoc =>
  doc.future.length ? { ...doc, items: doc.future[0], past: [...doc.past, doc.items].slice(-HISTORY_LIMIT), future: doc.future.slice(1) } : doc
export const removeMark = (doc: PhotoDoc, id: string): PhotoDoc => recordEdit(doc, doc.items.filter((item) => item.id !== id))

// Changes one mark. While the same change keeps going (a slider drag, typing, nudging with the arrow keys) the caller passes
// `continuing`, so the whole run is one undo step.
export function changeMark(doc: PhotoDoc, id: string, change: (item: IssueMarkup) => IssueMarkup, continuing: boolean): PhotoDoc {
  const target = doc.items.find((item) => item.id === id)
  if (!target) return doc
  const next = change(target)
  if (next === target) return doc
  const items = doc.items.map((item) => (item.id === id ? next : item))
  return continuing ? { ...doc, items } : recordEdit(doc, items)
}
// Style of one mark. Text only applies to text marks and never becomes blank; rotation is normalised (see withRotation).
export function restyleMark(doc: PhotoDoc, id: string, style: MarkupStyle, continuing: boolean): PhotoDoc {
  return changeMark(doc, id, (target) => {
    let next: IssueMarkup = { ...target, ...style, text: target.kind === "text" ? (style.text ?? target.text) : target.text }
    if (style.rotation !== undefined) next = withRotation(next, style.rotation)
    return target.kind === "text" && !next.text.trim() ? target : next
  }, continuing)
}

export const docChanged = (doc: PhotoDoc | undefined, photo: MarkupPhoto) => Boolean(doc) && (!sameMarkup(doc!.items, photo.annotations) || doc!.note !== photo.caption)
export const markupChanges = (photos: MarkupPhoto[], docs: Record<string, PhotoDoc>): MarkupChange[] =>
  photos.flatMap((photo) => (docChanged(docs[photo.id], photo) ? [{ id: photo.id, annotations: docs[photo.id].items, caption: docs[photo.id].note }] : []))
export const applyMarkupChanges = <T extends { id: string; annotations: IssueMarkup[]; caption: string }>(rows: T[], changes: MarkupChange[]): T[] =>
  rows.map((row) => {
    const change = changes.find((entry) => entry.id === row.id)
    return change ? { ...row, annotations: change.annotations, caption: change.caption } : row
  })

// Manual slideshow: no wrapping and no automatic advance, so the ends are obvious.
export const stepPhoto = (index: number, delta: number, count: number) => Math.max(0, Math.min(Math.max(0, count - 1), index + delta))
export const photoCounter = (index: number, count: number) => `Image ${index + 1} of ${count}`

import { useEffect, useRef, useState } from "react"
import Modal from "../Modal"
import { downloadBlob, exportPdf, exportPng, safeFileName, type ExportOptions } from "../../lib/exportSheet"

type Format = "png" | "pdf"
export type ExportRequest = Pick<ExportOptions, "show" | "titleBlock" | "legend">

const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text disabled:opacity-60"
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#9e1f93] to-[#b4329f] px-4 py-2 text-sm font-bold text-white shadow-[0_8px_18px_-10px_rgba(158,31,147,0.85)] hover:from-[#8a1a80] hover:to-[#a52a92] disabled:opacity-60"

// Export one sheet, exactly as drawn, as a PNG picture or a PDF. A small live preview follows the options.
export default function ExportDialog({
  sheetName,
  revisionLabel,
  initialShow,
  render,
  onClose,
  onDone,
}: {
  sheetName: string
  revisionLabel: string
  initialShow: ExportRequest["show"]
  render: (request: ExportRequest, maxSide?: number) => Promise<HTMLCanvasElement>
  onClose: () => void
  onDone: (filename: string) => void
}) {
  const [format, setFormat] = useState<Format>("pdf")
  const [show, setShow] = useState(initialShow)
  const [titleBlock, setTitleBlock] = useState(true)
  const [legend, setLegend] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState("")
  const [previewing, setPreviewing] = useState(true)
  const token = useRef(0)

  useEffect(() => {
    const mine = ++token.current
    setPreviewing(true)
    const timer = setTimeout(async () => {
      try {
        const canvas = await render({ show, titleBlock, legend }, 900)
        if (mine === token.current) {
          setPreview(canvas.toDataURL("image/jpeg", 0.8))
          setError("")
        }
      } catch (problem) {
        if (mine === token.current) setError(problem instanceof Error ? problem.message : "Could not draw the preview.")
      }
      if (mine === token.current) setPreviewing(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [render, show, titleBlock, legend])

  const submit = async () => {
    setBusy(true)
    setError("")
    try {
      const canvas = await render({ show, titleBlock, legend })
      const base = `${safeFileName(sheetName)}-${safeFileName(revisionLabel)}`
      const blob = format === "png" ? await exportPng(canvas) : await exportPdf(canvas, `${sheetName} ${revisionLabel}`)
      const filename = `${base}.${format}`
      downloadBlob(blob, filename)
      onDone(filename)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The export failed. Please try again.")
    }
    setBusy(false)
  }

  const toggle = (key: keyof ExportRequest["show"], label: string) => (
    <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[#9e1f93]" checked={show[key]} onChange={(event) => setShow({ ...show, [key]: event.target.checked })} />
      {label}
    </label>
  )

  return (
    <Modal title="Export sheet" description={`${sheetName} • ${revisionLabel}`} size="xl" onClose={busy ? () => undefined : onClose} footer={<><button type="button" className={secondary} onClick={onClose} disabled={busy}>Cancel</button><button type="button" className={primary} onClick={() => void submit()} disabled={busy || previewing}>{busy ? "Preparing..." : `Download ${format.toUpperCase()}`}</button></>}>
      <div className="grid gap-5 md:grid-cols-[15rem_1fr]">
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Format</legend>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Format">
              {(["pdf", "png"] as Format[]).map((value) => (
                <button key={value} type="button" role="radio" aria-checked={format === value} onClick={() => setFormat(value)} className={`rounded-lg border px-3 py-2 text-left transition ${format === value ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-muted"}`}>
                  <span className="block text-sm font-extrabold uppercase">{value}</span>
                  <span className="block text-[11px] text-fg-muted">{value === "pdf" ? "to print or send" : "picture"}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-fg-muted">Include</legend>
            {toggle("pins", "Pins")}
            {toggle("drawings", "Drawings and measurements")}
            {toggle("notes", "Notes and text")}
            {toggle("shapes", "Highlighted shapes")}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#9e1f93]" checked={titleBlock} onChange={(event) => setTitleBlock(event.target.checked)} />
              Title block (project, sheet, revision, date)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-[#9e1f93]" checked={legend} onChange={(event) => setLegend(event.target.checked)} />
              Status legend
            </label>
          </fieldset>
        </div>
        <div className="flex min-h-[14rem] items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-muted p-2">
          {preview ? <img src={preview} alt="Preview of the export" className={`max-h-[55vh] w-auto max-w-full rounded shadow-lg transition ${previewing ? "opacity-50" : ""}`} /> : error ? null : <div role="status" aria-label="Drawing the preview" className="h-56 w-full max-w-md animate-pulse rounded bg-surface" />}
        </div>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{error}</p> : null}
    </Modal>
  )
}

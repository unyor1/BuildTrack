import { useMemo } from "react"
import Modal from "../Modal"
import { buttonPrimary, buttonSecondary } from "../ui/PageParts"
import type { Pin } from "../../lib/blueprints"
import { escapeHtml, printHtml } from "../../lib/printReport"
import { pinLink, qrSvg } from "../../lib/qr"
import { useToast } from "../../lib/toast"

// A QR label for one pin: print it, stick it where the work is, and anyone on the team opens the pin by scanning it.
export default function PinQr({ pin, sheet, project, onClose }: { pin: Pin; sheet: string; project: string; onClose: () => void }) {
  const toast = useToast()
  const link = pinLink(window.location.origin, pin.project_id, pin.id)
  const svg = useMemo(() => qrSvg(link, { modulePx: 5, level: "M" }), [link])

  const print = () => {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pin label</title><style>
@page { size: 100mm 120mm; margin: 6mm; }
body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; text-align: center; color: #111; }
.brand { color: #9e1f93; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { font-size: 18px; margin: 4px 0 2px; line-height: 1.2; }
p { margin: 0; font-size: 11px; color: #444; }
svg { width: 78mm; height: 78mm; margin: 6px 0; }
.hint { margin-top: 4px; font-size: 10px; color: #666; }
</style></head><body>
<div class="brand">Valencia Construction Services - BuildTrack</div>
<h1>${escapeHtml(pin.title)}</h1>
<p>${escapeHtml(project)} • ${escapeHtml(sheet)}</p>
${svg}
<p class="hint">Scan with your phone's camera to open this pin</p>
</body></html>`
    if (!printHtml(html)) toast.error("Could not open the print dialog")
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success("Link copied")
    } catch {
      toast.info("Copy this link", link)
    }
  }

  return (
    <Modal title="QR label" description={`${pin.title} • ${sheet}`} size="sm" onClose={onClose} footer={<><button type="button" className={buttonSecondary} onClick={() => void copy()}>Copy link</button><button type="button" className={buttonPrimary} onClick={print}>Print label</button></>}>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-line bg-white p-2 [&>svg]:h-56 [&>svg]:w-56" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="max-w-xs text-center text-xs text-fg-muted">Anyone on the project who scans this code and signs in lands on this pin. The code carries no private data, only a link.</p>
      </div>
    </Modal>
  )
}

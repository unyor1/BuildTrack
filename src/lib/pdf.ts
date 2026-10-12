// Minimal single-page PDF writer: one JPEG image per page. No dependencies, no DOM, so it can be unit tested.
// The page is the image size at 96 dpi (px * 0.75 pt) and every byte offset in the xref table is exact.
const ascii = (text: string) => text.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1").slice(0, 120)

export function buildPdf(jpeg: Uint8Array, width: number, height: number, title = "BuildTrack sheet"): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data
    chunks.push(bytes)
    length += bytes.length
  }
  const object = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length
    push(`${id} 0 obj\n`)
    if (typeof body === "string") push(body)
    else body.forEach(push)
    push("\nendobj\n")
  }

  const pageW = Math.round(width * 0.75 * 100) / 100
  const pageH = Math.round(height * 0.75 * 100) / 100
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`

  push("%PDF-1.4\n")
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])) // binary marker so tools treat the file as binary
  object(1, "<< /Type /Catalog /Pages 2 0 R >>")
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  object(4, [
    encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    encoder.encode("\nendstream"),
  ])
  object(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  object(6, `<< /Title (${ascii(title)}) /Producer (BuildTrack) >>`)

  const xref = length
  push(`xref\n0 7\n0000000000 65535 f \n`)
  for (let id = 1; id <= 6; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`)
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}

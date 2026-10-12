import qrcode from "qrcode-generator"

// QR codes for pins: a printed label on site that opens the pin when scanned with the phone's camera. The encoder is the small
// `qrcode-generator` library; this file only builds the link and the picture.

export function qrMatrix(text: string, level: "L" | "M" | "Q" | "H" = "M"): boolean[][] {
  const code = qrcode(0, level) // 0 = pick the smallest version that fits
  code.addData(text)
  code.make()
  const size = code.getModuleCount()
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => code.isDark(row, column)))
}

// Crisp vector picture (one path, no anti-aliasing seams), with the quiet zone QR readers need.
export function qrSvg(text: string, options: { modulePx?: number; margin?: number; level?: "L" | "M" | "Q" | "H"; color?: string } = {}): string {
  const matrix = qrMatrix(text, options.level ?? "M")
  const margin = options.margin ?? 4
  const total = matrix.length + margin * 2
  const px = options.modulePx ?? 6
  const cells: string[] = []
  matrix.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x += 1
        continue
      }
      let end = x
      while (end < row.length && row[end]) end += 1
      cells.push(`M${x + margin} ${y + margin}h${end - x}v1h-${end - x}z`)
      x = end
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * px}" height="${total * px}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${total}" height="${total}" fill="#fff"/><path d="${cells.join("")}" fill="${options.color ?? "#000"}"/></svg>`
}

// The link inside a pin's QR code: /pin sends each person to the right screen for their role after sign-in.
export const pinLink = (origin: string, projectId: string, pinId: string) => `${origin.replace(/\/$/, "")}/pin?project=${encodeURIComponent(projectId)}&pin=${encodeURIComponent(pinId)}`

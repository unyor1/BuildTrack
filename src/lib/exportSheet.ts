// Renders a sheet with everything drawn on it (pins, drawings, text, symbols, measurements) to a canvas, then to PNG or PDF.
// The drawing code mirrors StageCanvas on purpose: same geometry helpers, same colours, same layer order.
import { canvasFont, displayLines, resolveFormat, type Resolved } from "./textFormat"
import {
  annotationColors,
  formatMeters,
  statusDot,
  statusLabels,
  type Annotation,
  type Pin,
  type PinStatus,
} from "./blueprints"
import { areaSquareMeters, centroid, formatArea, lengthMeters, pointsToPath, polygonAreaPx, polylineLengthPx, type Pt } from "./geometry"
import { itemBox } from "./arrange"
import { sortByLayer } from "./layers"
import { buildPdf } from "./pdf"
import { arrowHeadPx, cloudPath, dimensionTickPx } from "./shapes"
import { symbolByKey, type SymbolKey } from "./symbols"

export type ExportInfo = { project: string; sheet: string; revision: string; level?: string | null; author?: string }

export type ExportOptions = {
  image: CanvasImageSource
  width: number
  height: number
  annotations: Annotation[]
  pins: Pin[]
  numberOf: (pin: Pin) => number
  show: { pins: boolean; notes: boolean; shapes: boolean; drawings: boolean }
  scaleWidthM: number | null
  info: ExportInfo
  titleBlock: boolean
  legend: boolean
  maxSide?: number // longest side of the picture in pixels (small for the preview)
  showBase?: boolean // false hides the blueprint itself and leaves a white page
  images?: Map<string, CanvasImageSource> // pictures dropped on the sheet, by storage path
}

const MAX_SIDE = 4200
const FONT = '"Manrope", "Segoe UI", Arial, sans-serif'

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split("\n")) {
    let line = ""
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line)
        line = word
      } else line = test
    }
    lines.push(line)
  }
  return lines
}

function halo(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.lineWidth = size * 0.28
  ctx.strokeStyle = "#fff"
  ctx.lineJoin = "round"
  ctx.strokeText(text, x, y)
  ctx.fillText(text, x, y)
}

// Draws already wrapped lines with the text format: alignment (justify spreads the words), letter spacing, underline and strike.
function paintLines(ctx: CanvasRenderingContext2D, lines: string[], f: Resolved, x: number, y: number, boxW: number, px: number, paint: (text: string, tx: number, ty: number) => void) {
  const lineH = px * f.line_height
  const thickness = Math.max(1, px / 14)
  lines.forEach((line, index) => {
    const ty = y + index * lineH
    const natural = ctx.measureText(line).width
    let tx = x
    if (f.align === "center") tx = x + (boxW - natural) / 2
    else if (f.align === "right") tx = x + boxW - natural
    const words = line.split(" ")
    const justify = f.align === "justify" && index < lines.length - 1 && words.length > 1
    let drawn = natural
    if (justify) {
      const widths = words.map((word) => ctx.measureText(word).width)
      const gap = (boxW - widths.reduce((sum, w) => sum + w, 0)) / (words.length - 1)
      let cursor = x
      words.forEach((word, i) => {
        paint(word, cursor, ty)
        cursor += widths[i] + gap
      })
      drawn = boxW
    } else paint(line, tx, ty)
    if (f.underline || f.strike) {
      const left = justify ? x : tx
      ctx.save()
      if (f.underline) ctx.fillRect(left, ty + px * 1.02, drawn, thickness)
      if (f.strike) ctx.fillRect(left, ty + px * 0.55, drawn, thickness)
      ctx.restore()
    }
  })
}

const applySpacing = (ctx: CanvasRenderingContext2D, f: Resolved, px: number) => {
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${f.letter_spacing * px}px`
}

export async function renderSheet(options: ExportOptions): Promise<HTMLCanvasElement> {
  const { width, height, annotations, pins, show, scaleWidthM } = options
  if (document.fonts?.ready) await document.fonts.ready
  const factor = Math.min(1, (options.maxSide ?? MAX_SIDE) / Math.max(width, height))
  const u = Math.max(1, width / 1200) // one "screen unit" in sheet pixels, so markers stay readable on any sheet size
  const bandHeight = options.titleBlock || options.legend ? Math.round(86 * u) : 0

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * factor)
  canvas.height = Math.round((height + bandHeight) * factor)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Your browser cannot draw the export.")
  ctx.scale(factor, factor)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height + bandHeight)
  if (options.showBase !== false) ctx.drawImage(options.image, 0, 0, width, height)

  const px = (p: Pt): Pt => [(p[0] / 100) * width, (p[1] / 100) * height]
  const lengthLabel = (points: Pt[], closed = false) => {
    const len = polylineLengthPx(points, width, height, closed)
    const meters = lengthMeters(len, width, scaleWidthM)
    return meters !== null ? formatMeters(meters) : `${Math.round(len)} px`
  }
  const areaLabel = (points: Pt[]) => {
    const a = polygonAreaPx(points, width, height)
    const m2 = areaSquareMeters(a, width, scaleWidthM)
    return m2 !== null ? formatArea(m2) : `${Math.round(a).toLocaleString("en-PH")} px²`
  }
  const label = (text: string, x: number, y: number, size = 14 * u) => {
    ctx.font = `700 ${size}px ${FONT}`
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = "#111"
    halo(ctx, text, x, y, size)
  }

  for (const a of sortByLayer(annotations)) {
    const visible = a.kind === "shape" ? show.shapes : a.kind === "note" || a.kind === "text" ? show.notes : show.drawings
    if (!visible) continue
    const hex = annotationColors[a.color]
    ctx.save()
    ctx.globalAlpha = a.opacity
    ctx.strokeStyle = hex
    ctx.fillStyle = hex
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const strokePx = ((a.stroke ?? 0.2) / 100) * width

    // Shapes, text boxes, symbols and pictures can be turned: rotate the page around the item's centre while drawing it.
    if (a.rotation && (a.kind === "shape" || a.kind === "text" || a.kind === "symbol" || a.kind === "image")) {
      const box = itemBox({ id: a.id, kind: a.kind, x: a.x, y: a.y, w: a.w, h: a.h, points: null, text: a.text, font_size: a.font_size }, { width, height })
      const cx = ((box.x + box.w / 2) / 100) * width
      const cy = ((box.y + box.h / 2) / 100) * height
      ctx.translate(cx, cy)
      ctx.rotate((a.rotation * Math.PI) / 180)
      ctx.translate(-cx, -cy)
    }

    if (a.kind === "image") {
      const bitmap = a.image_path ? options.images?.get(a.image_path) : undefined
      const x = (a.x / 100) * width
      const y = (a.y / 100) * height
      const w = ((a.w ?? 10) / 100) * width
      const h = ((a.h ?? 10) / 100) * height
      ctx.shadowColor = "rgba(0,0,0,0.3)"
      ctx.shadowBlur = 8 * u
      ctx.shadowOffsetY = 2 * u
      if (bitmap) ctx.drawImage(bitmap, x, y, w, h)
      else {
        ctx.fillStyle = "#e5e7eb"
        ctx.fillRect(x, y, w, h)
      }
      ctx.shadowColor = "transparent"
    } else if (a.kind === "shape" && a.w !== null && a.h !== null) {
      const x = (a.x / 100) * width
      const y = (a.y / 100) * height
      const w = (a.w / 100) * width
      const h = (a.h / 100) * height
      ctx.lineWidth = 2 * u
      ctx.beginPath()
      if (a.shape === "ellipse") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      else ctx.rect(x, y, w, h)
      ctx.save()
      ctx.globalAlpha = a.opacity * 0.18
      ctx.fill()
      ctx.restore()
      ctx.stroke()
      if (a.text) {
        ctx.font = `700 ${12 * u}px ${FONT}`
        const tw = ctx.measureText(a.text).width + 10 * u
        ctx.fillStyle = hex
        ctx.fillRect(x, y, tw, 18 * u)
        ctx.fillStyle = a.color === "yellow" ? "#111" : "#fff"
        ctx.textAlign = "left"
        ctx.textBaseline = "middle"
        ctx.fillText(a.text, x + 5 * u, y + 9 * u)
      }
    } else if (a.kind === "note") {
      const [x, y] = px([a.x, a.y])
      const look = resolveFormat("note", a.format)
      ctx.font = canvasFont(look, 12 * u)
      applySpacing(ctx, look, 12 * u)
      const boxW = 176 * u
      const lines = displayLines(a.text, look).flatMap((line) => wrap(ctx, line, boxW - 18 * u)).slice(0, 4)
      const lineH = 12 * u * look.line_height
      const boxH = lines.length * lineH + 12 * u
      const top = y - boxH - 7 * u
      ctx.fillStyle = "#fff"
      ctx.shadowColor = "rgba(0,0,0,0.3)"
      ctx.shadowBlur = 6 * u
      ctx.fillRect(x, top, boxW, boxH)
      ctx.shadowColor = "transparent"
      ctx.lineWidth = 1 * u
      ctx.strokeRect(x, top, boxW, boxH)
      ctx.fillStyle = hex
      ctx.fillRect(x, top, 5 * u, boxH)
      ctx.beginPath()
      ctx.moveTo(x + 8 * u, top + boxH)
      ctx.lineTo(x + 16 * u, top + boxH)
      ctx.lineTo(x + 10 * u, y)
      ctx.closePath()
      ctx.fillStyle = "#fff"
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = "#1d1d1f"
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      paintLines(ctx, lines, look, x + 12 * u, top + 6 * u, boxW - 18 * u, 12 * u, (text, tx, ty) => ctx.fillText(text, tx, ty))
      applySpacing(ctx, { ...look, letter_spacing: 0 }, 12 * u)
    } else if (a.kind === "text") {
      const fontPx = ((a.font_size ?? 1.6) / 100) * width
      const [x, y] = px([a.x, a.y])
      const look = resolveFormat("text", a.format)
      ctx.font = canvasFont(look, fontPx)
      applySpacing(ctx, look, fontPx)
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      const boxW = ((a.w ?? 25) / 100) * width
      const lines = displayLines(a.text, look).flatMap((line) => wrap(ctx, line, boxW))
      ctx.fillStyle = hex
      ctx.lineWidth = fontPx * 0.2
      ctx.strokeStyle = "#fff"
      paintLines(ctx, lines, look, x, y, boxW, fontPx, (text, tx, ty) => {
        ctx.strokeText(text, tx, ty)
        ctx.fillText(text, tx, ty)
      })
      applySpacing(ctx, { ...look, letter_spacing: 0 }, fontPx)
    } else if (a.kind === "symbol" && a.symbol) {
      const def = symbolByKey[a.symbol as SymbolKey]
      if (def) {
        const size = ((a.w ?? 4) / 100) * width
        const [x, y] = px([a.x, a.y])
        ctx.translate(x, y)
        ctx.scale(size / 24, size / 24)
        ctx.lineWidth = 2
        ctx.fillStyle = "rgba(255,255,255,0.85)"
        ctx.fillRect(0, 0, 24, 24)
        ctx.fillStyle = hex
        for (const path of def.paths) {
          const p = new Path2D(path.d)
          if (path.fill) ctx.fill(p)
          ctx.stroke(p)
        }
      }
    } else if (a.points && a.points.length >= 2) {
      const pts = a.points
      if (a.kind === "cloud") {
        const p = new Path2D(cloudPath(pts, width, height, Math.max(14 * u, strokePx * 6)))
        ctx.lineWidth = Math.max(strokePx, 1.5 * u)
        ctx.save()
        ctx.globalAlpha = a.opacity * 0.12
        ctx.fill(p)
        ctx.restore()
        ctx.stroke(p)
        if (a.text) {
          const [cx, cy] = px(centroid(pts))
          label(a.text, cx, cy)
        }
      } else if (a.kind === "arrow") {
        const [from, to] = [px(pts[0]), px(pts[1])]
        ctx.lineWidth = Math.max(strokePx, 1.5 * u)
        ctx.beginPath()
        ctx.moveTo(from[0], from[1])
        ctx.lineTo(to[0], to[1])
        ctx.stroke()
        const head = arrowHeadPx(pts[0], pts[1], width, height, Math.max(strokePx * 5, 12 * u))
        ctx.beginPath()
        ctx.moveTo(head[0][0], head[0][1])
        ctx.lineTo(head[1][0], head[1][1])
        ctx.lineTo(head[2][0], head[2][1])
        ctx.closePath()
        ctx.fill()
        if (a.text) label(a.text, from[0], from[1] - 8 * u)
      } else if (a.kind === "dimension") {
        const [from, to] = [px(pts[0]), px(pts[1])]
        ctx.lineWidth = Math.max(strokePx, 1.2 * u)
        ctx.beginPath()
        ctx.moveTo(from[0], from[1])
        ctx.lineTo(to[0], to[1])
        for (const end of ["a", "b"] as const) {
          const [t1, t2] = dimensionTickPx(pts[0], pts[1], end, width, height, 7 * u)
          ctx.moveTo(t1[0], t1[1])
          ctx.lineTo(t2[0], t2[1])
        }
        ctx.stroke()
        label(lengthLabel(pts), (from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 8 * u)
      } else {
        const closed = a.kind === "area"
        const p = new Path2D(pointsToPath(pts, width, height, closed))
        ctx.lineWidth = strokePx
        ctx.lineCap = a.kind === "highlight" ? "butt" : "round"
        if (a.kind === "polyline" || closed) ctx.setLineDash([strokePx * 3, strokePx * 2])
        if (closed) {
          ctx.save()
          ctx.globalAlpha = a.opacity * 0.2
          ctx.fill(p)
          ctx.restore()
        }
        ctx.stroke(p)
        ctx.setLineDash([])
        if (a.kind === "polyline") {
          const [ex, ey] = px(pts[pts.length - 1])
          label(lengthLabel(pts), ex, ey - 8 * u)
        } else if (closed) {
          const [cx, cy] = px(centroid(pts))
          label(areaLabel(pts), cx, cy)
        }
      }
    }
    ctx.restore()
  }

  if (show.pins) {
    for (const pin of pins) {
      const [x, y] = px([pin.x, pin.y])
      ctx.beginPath()
      ctx.arc(x, y, 12 * u, 0, Math.PI * 2)
      ctx.fillStyle = statusDot[pin.status]
      ctx.shadowColor = "rgba(0,0,0,0.35)"
      ctx.shadowBlur = 5 * u
      ctx.fill()
      ctx.shadowColor = "transparent"
      ctx.lineWidth = 2.2 * u
      ctx.strokeStyle = "#fff"
      ctx.stroke()
      ctx.fillStyle = "#fff"
      ctx.font = `700 ${11 * u}px ${FONT}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(String(options.numberOf(pin)), x, y + 0.5 * u)
    }
  }

  if (bandHeight) {
    const top = height
    ctx.fillStyle = "#211f20"
    ctx.fillRect(0, top, width, bandHeight)
    ctx.fillStyle = "#f18b00"
    ctx.fillRect(0, top, width, 3 * u)
    ctx.textBaseline = "alphabetic"
    if (options.titleBlock) {
      ctx.textAlign = "left"
      ctx.fillStyle = "#f6d6f2"
      ctx.font = `800 ${11 * u}px ${FONT}`
      ctx.fillText(options.info.project.toUpperCase().slice(0, 70), 18 * u, top + 28 * u)
      ctx.fillStyle = "#ffffff"
      ctx.font = `800 ${20 * u}px ${FONT}`
      ctx.fillText(options.info.sheet.slice(0, 60), 18 * u, top + 54 * u)
      ctx.fillStyle = "#c9c4c7"
      ctx.font = `600 ${11.5 * u}px ${FONT}`
      const date = new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" })
      const scale = scaleWidthM ? `sheet width ${formatMeters(scaleWidthM)}` : "scale not set"
      ctx.fillText(`${options.info.revision}${options.info.level ? ` • ${options.info.level}` : ""} • ${scale} • exported ${date} • BuildTrack`, 18 * u, top + 75 * u)
    }
    if (options.legend) {
      const statuses = Object.keys(statusLabels) as PinStatus[]
      ctx.font = `700 ${11.5 * u}px ${FONT}`
      ctx.textAlign = "left"
      let x = width - 18 * u
      for (const status of [...statuses].reverse()) {
        const text = statusLabels[status]
        x -= ctx.measureText(text).width + 30 * u
        ctx.fillStyle = statusDot[status]
        ctx.beginPath()
        ctx.arc(x + 6 * u, top + 45 * u, 6 * u, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#ffffff"
        ctx.fillText(text, x + 18 * u, top + 49 * u)
      }
      const counts = annotations.length
      if (counts) {
        ctx.textAlign = "right"
        ctx.fillStyle = "#c9c4c7"
        ctx.fillText(`${pins.length} pin${pins.length === 1 ? "" : "s"} • ${counts} drawn item${counts === 1 ? "" : "s"}`, width - 18 * u, top + 24 * u)
      }
    }
  }
  return canvas
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the file."))), type, quality))

export const exportPng = (canvas: HTMLCanvasElement) => toBlob(canvas, "image/png")

export async function exportPdf(canvas: HTMLCanvasElement, title: string): Promise<Blob> {
  const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.92)).arrayBuffer())
  return new Blob([buildPdf(jpeg, canvas.width, canvas.height, title) as BlobPart], { type: "application/pdf" })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const safeFileName = (name: string) => name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "sheet"

// The image needs to come from a blob (not a cross-origin <img>) or the canvas is "tainted" and cannot be exported.
export async function loadSheetImage(url: string): Promise<CanvasImageSource> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Could not download the sheet image.")
  const blob = await response.blob()
  try {
    return await createImageBitmap(blob)
  } catch {
    // Some formats (SVG) cannot become a bitmap directly; decode them through an image element instead.
    const image = new Image()
    const objectUrl = URL.createObjectURL(blob)
    image.src = objectUrl
    try {
      await image.decode()
    } catch {
      throw new Error("The sheet image could not be read for the export.")
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
    }
    return image
  }
}


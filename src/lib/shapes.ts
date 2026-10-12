// Geometry for lines, arrows, dimension lines and revision clouds, in sheet pixels.
// Pure and import-light so the on-screen SVG and the PNG / PDF export draw exactly the same thing.
import type { Pt } from "./geometry.ts"

const round3 = (value: number) => Math.round(value * 1000) / 1000
const toPx = (p: Pt, width: number, height: number): Pt => [(p[0] / 100) * width, (p[1] / 100) * height]
const toPct = (p: Pt, width: number, height: number): Pt => [round3((p[0] / width) * 100), round3((p[1] / height) * 100)]

// Snaps the end of a segment to the nearest multiple of `stepDeg` around its start (hold Shift while drawing).
export function constrainAngle(from: Pt, to: Pt, width: number, height: number, stepDeg = 15): Pt {
  const [ax, ay] = toPx(from, width, height)
  const [bx, by] = toPx(to, width, height)
  const length = Math.hypot(bx - ax, by - ay)
  if (length === 0) return to
  const step = (stepDeg * Math.PI) / 180
  const angle = Math.round(Math.atan2(by - ay, bx - ax) / step) * step
  const end = toPct([ax + Math.cos(angle) * length, ay + Math.sin(angle) * length], width, height)
  return [Math.min(100, Math.max(0, end[0])), Math.min(100, Math.max(0, end[1]))]
}

// Triangle head at `b` for a line from `a`, as three pixel points (left, tip, right).
export function arrowHeadPx(a: Pt, b: Pt, width: number, height: number, sizePx: number): [Pt, Pt, Pt] {
  const [ax, ay] = toPx(a, width, height)
  const [bx, by] = toPx(b, width, height)
  const angle = Math.atan2(by - ay, bx - ax)
  const spread = Math.PI / 7
  return [
    [bx - Math.cos(angle - spread) * sizePx, by - Math.sin(angle - spread) * sizePx],
    [bx, by],
    [bx - Math.cos(angle + spread) * sizePx, by - Math.sin(angle + spread) * sizePx],
  ]
}

// Short perpendicular tick at one end of a dimension line.
export function dimensionTickPx(a: Pt, b: Pt, at: "a" | "b", width: number, height: number, sizePx: number): [Pt, Pt] {
  const [ax, ay] = toPx(a, width, height)
  const [bx, by] = toPx(b, width, height)
  const angle = Math.atan2(by - ay, bx - ax) + Math.PI / 2
  const [cx, cy] = at === "a" ? [ax, ay] : [bx, by]
  return [
    [cx - Math.cos(angle) * sizePx, cy - Math.sin(angle) * sizePx],
    [cx + Math.cos(angle) * sizePx, cy + Math.sin(angle) * sizePx],
  ]
}

// Revision cloud: every edge of the polygon becomes a row of outward arcs (the drafting convention for "this changed").
export function cloudPath(points: Pt[], width: number, height: number, bumpPx: number): string {
  if (points.length < 3) return ""
  const px = points.map((p) => toPx(p, width, height))
  let area = 0
  for (let i = 0; i < px.length; i++) {
    const [ax, ay] = px[i]
    const [bx, by] = px[(i + 1) % px.length]
    area += ax * by - bx * ay
  }
  const sweep = area > 0 ? 1 : 0 // bulge away from the inside whatever the drawing direction
  let d = `M${px[0][0].toFixed(1)} ${px[0][1].toFixed(1)}`
  for (let i = 0; i < px.length; i++) {
    const [ax, ay] = px[i]
    const [bx, by] = px[(i + 1) % px.length]
    const length = Math.hypot(bx - ax, by - ay)
    const count = Math.max(1, Math.round(length / Math.max(1, bumpPx)))
    const radius = length / count / 2
    for (let k = 1; k <= count; k++) {
      d += ` A${radius.toFixed(1)} ${radius.toFixed(1)} 0 0 ${sweep} ${(ax + ((bx - ax) * k) / count).toFixed(1)} ${(ay + ((by - ay) * k) / count).toFixed(1)}`
    }
  }
  return d + " Z"
}

// Rectangle corners from two opposite points (used by the cloud tool's drag-a-box gesture).
export function rectCorners(a: Pt, b: Pt): Pt[] {
  const x1 = Math.min(a[0], b[0])
  const x2 = Math.max(a[0], b[0])
  const y1 = Math.min(a[1], b[1])
  const y2 = Math.max(a[1], b[1])
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
}

// ---- Rotation ----
// Angles are degrees, 0 = unrotated, positive = clockwise on screen (like CSS rotate()).
export function normalizeAngle(deg: number): number {
  let value = ((deg % 360) + 360) % 360
  if (value > 180) value -= 360
  return Math.round(value * 100) / 100
}

// Angle of the rotate handle when the pointer is at (px, py) and the item's centre is (cx, cy): straight above = 0.
export function angleFromCenter(cx: number, cy: number, px: number, py: number): number {
  return normalizeAngle((Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90)
}

export const snapAngle = (deg: number, step = 15) => normalizeAngle(Math.round(deg / step) * step)

// A pointer movement expressed in the item's own (rotated) axes, so a resize handle follows the mouse on a tilted item.
export function toLocalAxes(dx: number, dy: number, rotationDeg: number): { x: number; y: number } {
  const t = (rotationDeg * Math.PI) / 180
  return { x: dx * Math.cos(t) + dy * Math.sin(t), y: -dx * Math.sin(t) + dy * Math.cos(t) }
}

// Where the floating action capsule goes: centred above the selected item's box, kept inside the stage, and moved below the box
// when there is no room above. Pure maths (screen pixels), tested with `pnpm test:lib`.

export type Rect = { x: number; y: number; w: number; h: number }
export type View = { scale: number; tx: number; ty: number }

// The smallest upright rectangle around a (possibly rotated) box, rotated about its centre.
export function rotatedBounds(box: Rect, rotationDeg: number): Rect {
  if (!rotationDeg) return box
  const t = (rotationDeg * Math.PI) / 180
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const xs: number[] = []
  const ys: number[] = []
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const u = (dx * box.w) / 2
    const v = (dy * box.h) / 2
    xs.push(cx + u * Math.cos(t) - v * Math.sin(t))
    ys.push(cy + u * Math.sin(t) + v * Math.cos(t))
  }
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

export function capsulePlacement(
  sheetBox: Rect, // in sheet pixels (already rotated bounds)
  view: View,
  stage: { width: number; height: number },
  capsule: { width: number; height: number },
  options: { gap?: number; lift?: number } = {},
): { left: number; top: number; below: boolean } {
  const gap = options.gap ?? 12
  const lift = options.lift ?? 0 // extra room above the box, in screen pixels (notes draw a callout above their anchor point)
  const sx = view.tx + sheetBox.x * view.scale
  const sy = view.ty + sheetBox.y * view.scale
  const sw = sheetBox.w * view.scale
  const sh = sheetBox.h * view.scale
  const half = capsule.width / 2
  const left = Math.min(Math.max(sx + sw / 2, half + 8), Math.max(half + 8, stage.width - half - 8))
  const above = sy - lift - gap - capsule.height
  if (above >= 8) return { left, top: above, below: false }
  const below = sy + sh + gap
  return { left, top: Math.min(below, Math.max(8, stage.height - capsule.height - 8)), below: true }
}

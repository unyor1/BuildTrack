// Pure helpers for drawings on a sheet. Points are [x, y] in percent of the sheet (0-100); the sheet is `width` x `height`
// pixels, so one percent of x is not the same length as one percent of y. No imports: tested with `pnpm test:lib`.
export type Pt = [number, number]

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const roundPct = (value: number) => Math.round(value * 1000) / 1000

export function bbox(points: Pt[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Move a drawing by (dx, dy) percent, never past the edges of the sheet (the whole drawing stays inside 0-100).
export function translatePoints(points: Pt[], dx: number, dy: number): Pt[] {
  const box = bbox(points)
  const sx = clamp(dx, -box.x, 100 - (box.x + box.w))
  const sy = clamp(dy, -box.y, 100 - (box.y + box.h))
  return points.map(([x, y]) => [roundPct(x + sx), roundPct(y + sy)])
}

// Ramer-Douglas-Peucker in sheet pixels, so a hand-drawn stroke of hundreds of samples is stored with a few dozen points.
export function simplify(points: Pt[], tolerancePx: number, width: number, height: number): Pt[] {
  if (points.length <= 2) return points
  const px = points.map(([x, y]) => [(x / 100) * width, (y / 100) * height] as Pt)
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = keep[points.length - 1] = true
  const stack: Array<[number, number]> = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    let worst = 0
    let index = -1
    const [ax, ay] = px[start]
    const [bx, by] = px[end]
    const len = Math.hypot(bx - ax, by - ay)
    for (let i = start + 1; i < end; i++) {
      const [x, y] = px[i]
      const distance = len === 0 ? Math.hypot(x - ax, y - ay) : Math.abs((by - ay) * x - (bx - ax) * y + bx * ay - by * ax) / len
      if (distance > worst) {
        worst = distance
        index = i
      }
    }
    if (index !== -1 && worst > tolerancePx) {
      keep[index] = true
      stack.push([start, index], [index, end])
    }
  }
  return points.filter((_, i) => keep[i])
}

// Keeps at most `max` points (evenly thinned, first and last always kept) for very long strokes.
export function limitPoints(points: Pt[], max: number): Pt[] {
  if (points.length <= max) return points
  const result: Pt[] = []
  for (let i = 0; i < max; i++) result.push(points[Math.round((i * (points.length - 1)) / (max - 1))])
  return result
}

export function polylineLengthPx(points: Pt[], width: number, height: number, closed = false) {
  let total = 0
  const count = closed ? points.length : points.length - 1
  for (let i = 0; i < count; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[(i + 1) % points.length]
    total += Math.hypot(((bx - ax) / 100) * width, ((by - ay) / 100) * height)
  }
  return total
}

// Shoelace formula in sheet pixels (always positive).
export function polygonAreaPx(points: Pt[], width: number, height: number) {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]
    const [bx, by] = points[(i + 1) % points.length]
    sum += ((ax / 100) * width) * ((by / 100) * height) - ((bx / 100) * width) * ((ay / 100) * height)
  }
  return Math.abs(sum) / 2
}

// `scaleWidthM` is the real width of the whole sheet in metres; null when the sheet is not calibrated.
export const lengthMeters = (px: number, width: number, scaleWidthM: number | null) => (scaleWidthM ? (px / width) * scaleWidthM : null)
export const areaSquareMeters = (px2: number, width: number, scaleWidthM: number | null) => (scaleWidthM ? px2 * (scaleWidthM / width) ** 2 : null)

export const formatArea = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : m2 >= 100 ? `${m2.toFixed(0)} m²` : m2 >= 1 ? `${m2.toFixed(1)} m²` : `${(m2 * 10000).toFixed(0)} cm²`)

export const pointsToPath = (points: Pt[], width: number, height: number, closed = false) =>
  points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${((x / 100) * width).toFixed(1)} ${((y / 100) * height).toFixed(1)}`).join(" ") + (closed ? " Z" : "")

export const centroid = (points: Pt[]): Pt => {
  const box = bbox(points)
  return [box.x + box.w / 2, box.y + box.h / 2]
}

// jsonb comes back as arrays of numbers; make sure every entry is a real [number, number].
export function asPoints(value: unknown): Pt[] {
  if (!Array.isArray(value)) return []
  const result: Pt[] = []
  for (const entry of value) {
    if (Array.isArray(entry) && entry.length === 2 && Number.isFinite(Number(entry[0])) && Number.isFinite(Number(entry[1]))) result.push([Number(entry[0]), Number(entry[1])])
  }
  return result
}

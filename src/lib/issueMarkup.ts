export const ISSUE_PHOTO_LIMIT = 40
export const MARKUP_LIMIT = 150
export const MARKUP_POINT_LIMIT = 500
export const markupTools = ["select", "text", "line", "arrow", "rectangle", "ellipse", "draw"] as const
export type MarkupTool = typeof markupTools[number]
export type MarkupPoint = { x: number; y: number }
export type IssueMarkup = {
  id: string; kind: Exclude<MarkupTool, "select">; x: number; y: number; x2: number; y2: number
  color: string; stroke: number; fontSize: number; text: string; points: MarkupPoint[]
}

export const clampCoordinate = (value: number) => Math.max(0, Math.min(100, value))
const coordinate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
export function markupProblem(value: unknown): string {
  if (!Array.isArray(value) || value.length > MARKUP_LIMIT) return `Use at most ${MARKUP_LIMIT} annotations per photo.`
  const ids = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "color,fontSize,id,kind,points,stroke,text,x,x2,y,y2") return "Invalid annotation fields."
    if (typeof item.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(item.id) || ids.has(item.id)) return "Invalid or duplicate annotation ID."
    ids.add(item.id)
    if (!markupTools.slice(1).includes(item.kind) || ![item.x, item.y, item.x2, item.y2].every(coordinate)) return "Invalid annotation coordinates or type."
    if (typeof item.color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(item.color)) return "Choose a valid annotation color."
    if (!Number.isFinite(item.stroke) || item.stroke < 1 || item.stroke > 12 || !Number.isFinite(item.fontSize) || item.fontSize < 12 || item.fontSize > 72) return "Invalid annotation size."
    if (typeof item.text !== "string" || item.text.length > 300 || (item.kind === "text" && !item.text.trim())) return "Text needs 1 to 300 characters."
    if (!Array.isArray(item.points) || item.points.length > MARKUP_POINT_LIMIT || (item.kind === "draw" && item.points.length < 2) || item.points.some((p: MarkupPoint) => !p || Object.keys(p).sort().join(",") !== "x,y" || !coordinate(p.x) || !coordinate(p.y))) return "Invalid drawing points."
  }
  return ""
}

// Move without clipping any part of the geometry; normalized coordinates work on portrait and landscape photos.
export function moveMarkup(item: IssueMarkup, dx: number, dy: number): IssueMarkup {
  const points = [{ x: item.x, y: item.y }, { x: item.x2, y: item.y2 }, ...item.points]
  const x = Math.max(-Math.min(...points.map(p => p.x)), Math.min(100 - Math.max(...points.map(p => p.x)), dx))
  const y = Math.max(-Math.min(...points.map(p => p.y)), Math.min(100 - Math.max(...points.map(p => p.y)), dy))
  return { ...item, x: item.x + x, y: item.y + y, x2: item.x2 + x, y2: item.y2 + y, points: item.points.map(p => ({ x: p.x + x, y: p.y + y })) }
}

export function issuePhotoProblem(file: Pick<File, "type" | "size">): string {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Use JPEG, PNG or WebP photos."
  if (!file.size || file.size > 8 * 1024 * 1024) return "Each photo must be between 1 byte and 8 MB."
  return ""
}

export const issueTab = (status: string) => status === "verified" ? "resolved" : status === "issue" ? "open" : "following_up"
export const zonePlanPath = (role: "engineer" | "foreman", project: string, sheet: string) => `/${role}/${role === "engineer" ? "annotation" : "daily-work"}?project=${encodeURIComponent(project)}&sheet=${encodeURIComponent(sheet)}`

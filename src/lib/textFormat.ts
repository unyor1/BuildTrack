// Text formatting for text boxes and notes (font, bold, italic, underline, strike, case, alignment, list, spacing).
// Pure helpers shared by the stage (CSS), the export (canvas) and the toolbar. The database validates the same keys (0024).

export const fontFamilies = [
  { name: "Manrope", stack: '"Manrope", "Segoe UI", Arial, sans-serif' },
  { name: "Poppins", stack: '"Poppins", "Segoe UI", Arial, sans-serif' },
  { name: "Inter", stack: '"Inter", "Segoe UI", Arial, sans-serif' },
  { name: "Roboto", stack: '"Roboto", "Segoe UI", Arial, sans-serif' },
  { name: "Playfair Display", stack: '"Playfair Display", Georgia, serif' },
  { name: "Roboto Mono", stack: '"Roboto Mono", "Courier New", monospace' },
  { name: "Georgia", stack: "Georgia, serif" },
  { name: "Arial", stack: "Arial, Helvetica, sans-serif" },
] as const
export type FontName = (typeof fontFamilies)[number]["name"]

export type TextAlign = "left" | "center" | "right" | "justify"
export type TextTransform = "none" | "uppercase" | "lowercase" | "capitalize"
export type ListStyle = "none" | "bullet" | "number"

export type TextFormat = {
  family?: FontName
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  transform?: TextTransform
  align?: TextAlign
  list?: ListStyle
  line_height?: number // multiple of the font size
  letter_spacing?: number // in em
}

export const FORMAT_KINDS = ["text", "note"] as const
export const canFormat = (kind: string) => (FORMAT_KINDS as readonly string[]).includes(kind)

export type Resolved = Required<TextFormat>

// Text boxes have always been bold; notes are regular. A stored format only has to hold what differs.
export function resolveFormat(kind: string, format: TextFormat | null | undefined): Resolved {
  const f = format ?? {}
  return {
    family: f.family ?? "Manrope",
    bold: f.bold ?? kind === "text",
    italic: f.italic ?? false,
    underline: f.underline ?? false,
    strike: f.strike ?? false,
    transform: f.transform ?? "none",
    align: f.align ?? "left",
    list: f.list ?? "none",
    line_height: f.line_height ?? 1.25,
    letter_spacing: f.letter_spacing ?? 0,
  }
}

const isFont = (value: unknown): value is FontName => fontFamilies.some((font) => font.name === value)
const oneOf = <T extends string>(value: unknown, list: readonly T[]): value is T => typeof value === "string" && (list as readonly string[]).includes(value)
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max

// Keeps only what the database would accept (anything else in the stored object is ignored, never rendered).
export function sanitizeFormat(raw: unknown): TextFormat {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const f = raw as Record<string, unknown>
  const out: TextFormat = {}
  if (isFont(f.family)) out.family = f.family
  for (const key of ["bold", "italic", "underline", "strike"] as const) if (typeof f[key] === "boolean") out[key] = f[key] as boolean
  if (oneOf(f.transform, ["none", "uppercase", "lowercase", "capitalize"] as const)) out.transform = f.transform
  if (oneOf(f.align, ["left", "center", "right", "justify"] as const)) out.align = f.align
  if (oneOf(f.list, ["none", "bullet", "number"] as const)) out.list = f.list
  if (inRange(f.line_height, 0.8, 3)) out.line_height = f.line_height
  if (inRange(f.letter_spacing, -0.1, 0.5)) out.letter_spacing = f.letter_spacing
  return out
}

// New format after one change; a key set to undefined goes back to its default.
export function mergeFormat(current: TextFormat | null | undefined, patch: TextFormat): TextFormat {
  const next: Record<string, unknown> = { ...sanitizeFormat(current), ...patch }
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key]
  return sanitizeFormat(next)
}

const capitalize = (text: string) => text.replace(/(^|[\s(\-/])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase())

export function transformText(text: string, transform: TextTransform): string {
  if (transform === "uppercase") return text.toUpperCase()
  if (transform === "lowercase") return text.toLowerCase()
  if (transform === "capitalize") return capitalize(text.toLowerCase())
  return text
}

// The text as it is shown: case applied and list markers added (one marker per non-empty line; numbers count up).
export function displayLines(text: string | null | undefined, f: Resolved): string[] {
  let n = 0
  return transformText(text ?? "", f.transform)
    .split("\n")
    .map((line) => {
      if (f.list === "none" || !line.trim()) return line
      n += 1
      return f.list === "bullet" ? `• ${line}` : `${n}. ${line}`
    })
}

export const decorations = (f: Resolved) => [f.underline ? "underline" : "", f.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none"

export function cssFont(f: Resolved): { fontFamily: string; fontWeight: number; fontStyle: string; textDecoration: string; textAlign: TextAlign; lineHeight: number; letterSpacing: string } {
  const stack = fontFamilies.find((font) => font.name === f.family)?.stack ?? fontFamilies[0].stack
  return { fontFamily: stack, fontWeight: f.bold ? 700 : 500, fontStyle: f.italic ? "italic" : "normal", textDecoration: decorations(f), textAlign: f.align, lineHeight: f.line_height, letterSpacing: `${f.letter_spacing}em` }
}

export const canvasFont = (f: Resolved, px: number) => `${f.italic ? "italic " : ""}${f.bold ? 700 : 500} ${px}px ${fontFamilies.find((font) => font.name === f.family)?.stack ?? fontFamilies[0].stack}`

// Font size is stored as percent of the sheet width; the toolbar shows it as a friendly number (1.6 % = 16).
export const sizeToLabel = (percent: number) => Math.round(percent * 100) / 10
export const labelToSize = (label: number) => Math.min(12, Math.max(0.3, Math.round(label * 10) / 100))

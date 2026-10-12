// Construction symbol library. Each symbol is drawn in a 24 x 24 box with strokes (and optional fills) in one colour,
// so the same data renders on screen (SVG) and in the PNG / PDF export (canvas Path2D). No imports.
export type SymbolKey = "north_arrow" | "hazard" | "inspect" | "check" | "cross" | "equipment" | "crane" | "exit" | "fire_ext" | "first_aid" | "ppe" | "no_entry"
export type SymbolDef = { key: SymbolKey; label: string; group: "Site" | "Safety" | "Inspection"; paths: Array<{ d: string; fill?: boolean }> }

export const symbolLibrary: SymbolDef[] = [
  { key: "north_arrow", label: "North arrow", group: "Site", paths: [{ d: "M12 2l6 19-6-4-6 4z", fill: true }, { d: "M12 17V9" }] },
  { key: "equipment", label: "Equipment", group: "Site", paths: [{ d: "M2 16V8h11v8" }, { d: "M13 11h5l3 3v2h-8" }, { d: "M7 20a2 2 0 100-4 2 2 0 000 4z" }, { d: "M17 20a2 2 0 100-4 2 2 0 000 4z" }] },
  { key: "crane", label: "Crane", group: "Site", paths: [{ d: "M12 22V4M4 4h16M16 4v5M15 9h2v2h-2zM12 4L6 8M7 22h10" }] },
  { key: "exit", label: "Exit", group: "Site", paths: [{ d: "M5 21V4h10v17M5 21h14" }, { d: "M15 12h6M18 9l3 3-3 3" }] },
  { key: "hazard", label: "Hazard", group: "Safety", paths: [{ d: "M12 3L22 20H2z" }, { d: "M12 9v5M12 17h.01" }] },
  { key: "no_entry", label: "No entry", group: "Safety", paths: [{ d: "M12 3a9 9 0 100 18 9 9 0 000-18z" }, { d: "M7 12h10" }] },
  { key: "fire_ext", label: "Fire extinguisher", group: "Safety", paths: [{ d: "M9 8h6v13H9z" }, { d: "M10 8V5h4l2 2M14 5V3" }] },
  { key: "first_aid", label: "First aid", group: "Safety", paths: [{ d: "M4 4h16v16H4z" }, { d: "M12 8v8M8 12h8" }] },
  { key: "ppe", label: "PPE required", group: "Safety", paths: [{ d: "M4 16a8 8 0 0116 0z" }, { d: "M2 16h20M12 8V5" }] },
  { key: "inspect", label: "Inspect here", group: "Inspection", paths: [{ d: "M10 4a6 6 0 100 12 6 6 0 000-12z" }, { d: "M15 15l6 6" }] },
  { key: "check", label: "Passed", group: "Inspection", paths: [{ d: "M12 3a9 9 0 100 18 9 9 0 000-18z" }, { d: "M8 12l3 3 5-6" }] },
  { key: "cross", label: "Failed", group: "Inspection", paths: [{ d: "M12 3a9 9 0 100 18 9 9 0 000-18z" }, { d: "M9 9l6 6M15 9l-6 6" }] },
]

export const symbolByKey = Object.fromEntries(symbolLibrary.map((symbol) => [symbol.key, symbol])) as Record<SymbolKey, SymbolDef>
export const symbolGroups = ["Site", "Safety", "Inspection"] as const

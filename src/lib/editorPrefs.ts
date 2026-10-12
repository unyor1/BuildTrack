import { useCallback, useState } from "react"

// How the workspace is laid out for this person. Stored in the browser only (a convenience, never needed for correctness).
export type EditorPrefs = {
  sheets: boolean // left strip with the sheet thumbnails (desktop)
  filmstrip: boolean // pages bar under the sheet (can be shown together with the left strip)
  inspector: "docked" | "floating" | "hidden"
  tools: "bar" | "palette"
  palette: { x: number; y: number; collapsed: boolean }
  panel: { x: number; y: number }
  boxSelect: boolean // drag on empty space draws a selection box instead of panning
}

const KEY = "buildtrack.editor.ui"
export const defaultPrefs: EditorPrefs = {
  sheets: true,
  filmstrip: false,
  inspector: "docked",
  tools: "bar",
  palette: { x: 24, y: 150, collapsed: false },
  panel: { x: 120, y: 120 },
  boxSelect: false,
}

function load(): EditorPrefs {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return defaultPrefs
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>
    return {
      sheets: typeof parsed.sheets === "boolean" ? parsed.sheets : defaultPrefs.sheets,
      filmstrip: typeof parsed.filmstrip === "boolean" ? parsed.filmstrip : defaultPrefs.filmstrip,
      inspector: parsed.inspector === "floating" || parsed.inspector === "hidden" ? parsed.inspector : "docked",
      tools: parsed.tools === "palette" ? "palette" : "bar",
      palette: { ...defaultPrefs.palette, ...(parsed.palette ?? {}) },
      panel: { ...defaultPrefs.panel, ...(parsed.panel ?? {}) },
      boxSelect: Boolean(parsed.boxSelect),
    }
  } catch {
    return defaultPrefs
  }
}

export function useEditorPrefs() {
  const [prefs, setPrefs] = useState<EditorPrefs>(load)
  const update = useCallback((patch: Partial<EditorPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch }
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // storage can be blocked (private window): the layout simply is not remembered
      }
      return next
    })
  }, [])
  const reset = useCallback(() => update(defaultPrefs), [update])
  return { prefs, update, reset }
}

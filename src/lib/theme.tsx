import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type ThemeMode = "light" | "dark" | "system"

type ThemeContextValue = {
  mode: ThemeMode
  resolved: "light" | "dark"
  setMode: (mode: ThemeMode) => void
}

const STORAGE_KEY = "buildtrack.theme"
const ThemeContext = createContext<ThemeContextValue | null>(null)

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches

const readStored = (): ThemeMode => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === "light" || value === "dark" || value === "system" ? value : "system"
  } catch {
    return "system"
  }
}

// Single source of truth for the theme. Stores the user's choice (light / dark / system) in localStorage
// and mirrors the result as the `dark` class on <html>. index.html sets the same class before first paint.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStored)
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  const resolved = mode === "system" ? (prefersDark ? "dark" : "light") : mode

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark")
  }, [resolved])

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setModeState(readStored())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage blocked (private mode): the choice still applies for this session.
    }
  }, [])

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside <ThemeProvider>")
  return context
}

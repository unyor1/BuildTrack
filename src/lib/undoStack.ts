import { useCallback, useRef, useState } from "react"

// One reversible edit. `undo` / `redo` talk to the database and return false when it refuses (for example the item is
// locked or was deleted by someone else); a refused step is dropped from the stack so the user is never stuck on it.
export type UndoEntry = { label: string; undo: () => Promise<boolean>; redo: () => Promise<boolean> }

export function useUndoStack(limit = 100) {
  const past = useRef<UndoEntry[]>([])
  const future = useRef<UndoEntry[]>([])
  const [version, setVersion] = useState(0)
  const busy = useRef(false)
  const bump = () => setVersion((value) => value + 1)

  const push = useCallback((entry: UndoEntry) => {
    past.current.push(entry)
    if (past.current.length > limit) past.current.shift()
    future.current = [] // a new edit ends the redo branch
    bump()
  }, [limit])

  const clear = useCallback(() => {
    past.current = []
    future.current = []
    bump()
  }, [])

  const run = useCallback(async (direction: "undo" | "redo"): Promise<{ ok: boolean; label: string } | null> => {
    if (busy.current) return null
    const from = direction === "undo" ? past : future
    const to = direction === "undo" ? future : past
    const entry = from.current.pop()
    if (!entry) return null
    busy.current = true
    bump()
    let ok = false
    try {
      ok = await (direction === "undo" ? entry.undo() : entry.redo())
    } catch {
      ok = false
    }
    if (ok) to.current.push(entry)
    busy.current = false
    bump()
    return { ok, label: entry.label }
  }, [])

  return {
    push,
    clear,
    undo: () => run("undo"),
    redo: () => run("redo"),
    canUndo: past.current.length > 0 && !busy.current,
    canRedo: future.current.length > 0 && !busy.current,
    undoLabel: past.current[past.current.length - 1]?.label ?? "",
    redoLabel: future.current[future.current.length - 1]?.label ?? "",
    version,
  }
}

import { useRef, type Dispatch, type SetStateAction } from "react"
import { dbMessage } from "./PinParts"
import { annotationKindLabels, normalizeAnnotation, type Annotation } from "../../lib/blueprints"
import { alignMoves, distributeMoves, isNoop, shiftedTogether, withGroupMembers, type AlignMode, type ArrangeItem, type Move } from "../../lib/arrange"
import { bbox } from "../../lib/geometry"
import { layerChanges, sortByLayer, type LayerAction } from "../../lib/layers"
import { supabase } from "../../lib/supabase"
import type { useConfirm } from "../../lib/confirm"
import type { useToast } from "../../lib/toast"
import type { useUndoStack } from "../../lib/undoStack"

// Columns that describe an item completely (used to re-create it for undo, redo, copy and paste).
const SNAPSHOT_KEYS = ["kind", "shape", "x", "y", "w", "h", "text", "color", "points", "stroke", "opacity", "font_size", "symbol", "group_id", "image_path", "rotation"] as const
const STYLE_KEYS = ["color", "opacity", "stroke", "font_size"] as const
const CLIPBOARD_KEY = "buildtrack.editor.clipboard"

type Deps = {
  projectId: string
  blueprintId: string | null
  annotations: Annotation[]
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>
  reload: () => Promise<void>
  undo: ReturnType<typeof useUndoStack>
  toast: ReturnType<typeof useToast>
  confirm: ReturnType<typeof useConfirm>
  touched: () => void
  sheet: { width: number; height: number }
}

type Snapshot = Record<string, unknown>
export const snapshotOf = (a: Annotation, withId = true): Snapshot => {
  const out: Snapshot = withId ? { id: a.id } : {}
  for (const key of SNAPSHOT_KEYS) out[key] = a[key]
  return out
}
export const toArrange = (a: Annotation): ArrangeItem => ({ id: a.id, kind: a.kind, x: a.x, y: a.y, w: a.w, h: a.h, points: a.points, text: a.text, font_size: a.font_size })

const label = (items: Annotation[], verb: string) => (items.length === 1 ? `${verb} ${annotationKindLabels[items[0].kind].toLowerCase()}` : `${verb} ${items.length} items`)

// Every change to drawn items goes through here: optimistic update, one database call, an undo step, a toast on failure.
export function useAnnotationOps(deps: Deps) {
  const ref = useRef(deps)
  ref.current = deps
  const pastes = useRef(0)

  const byIds = (ids: string[]) => ref.current.annotations.filter((a) => ids.includes(a.id))
  const fail = (title: string, locked: boolean, detail?: string) => ref.current.toast.error(title, detail ?? (locked ? "An item is locked. Unlock it first." : "You may not be allowed to edit it."))

  // ---------- Create ----------
  async function insert(rows: Snapshot[], undoLabel: string): Promise<{ created: Annotation[]; failure: string }> {
    const { projectId, blueprintId, setAnnotations, undo, touched } = ref.current
    if (!blueprintId) return { created: [], failure: "No sheet is open." }
    const { data, error } = await supabase.from("blueprint_annotations").insert(rows.map((row) => ({ project_id: projectId, blueprint_id: blueprintId, ...row }))).select("*")
    if (error || !data) return { created: [], failure: error?.code === "42501" ? "You are not allowed to draw on this sheet." : error ? dbMessage(error) : "Could not save it." }
    const created = (data as Array<Record<string, unknown>>).map(normalizeAnnotation)
    setAnnotations((current) => [...current, ...created])
    const snapshots = created.map((a) => snapshotOf(a))
    undo.push({
      label: undoLabel,
      undo: async () => {
        const { data: removed, error: removeError } = await supabase.from("blueprint_annotations").delete().in("id", created.map((a) => a.id)).select("id")
        await ref.current.reload()
        return !removeError && (removed?.length ?? 0) === created.length
      },
      redo: async () => {
        const { error: redoError } = await supabase.from("blueprint_annotations").insert(snapshots.map((row) => ({ project_id: ref.current.projectId, blueprint_id: ref.current.blueprintId, ...row })))
        await ref.current.reload()
        return !redoError
      },
    })
    touched()
    return { created, failure: "" }
  }

  // ---------- Edit ----------
  // Different fields per item (style painter, align, etc.). One request per item, one undo step.
  async function patchEach(entries: Array<{ id: string; patch: Snapshot }>, failureTitle: string, undoLabel: string, local?: (a: Annotation) => Partial<Annotation>) {
    const { setAnnotations, undo, touched } = ref.current
    const items = byIds(entries.map((e) => e.id))
    if (!entries.length || !items.length) return false
    // A locked item accepts no edits except the lock itself. Refused here, before anything changes on screen.
    if (entries.some((e) => items.find((a) => a.id === e.id)?.locked && Object.keys(e.patch).some((key) => key !== "locked"))) {
      ref.current.toast.error(failureTitle, "This item is locked. Unlock it first.")
      return false
    }
    const previous = entries.map((e) => {
      const item = items.find((a) => a.id === e.id)!
      return { id: e.id, patch: Object.fromEntries(Object.keys(e.patch).map((key) => [key, item[key as keyof Annotation]])) as Snapshot }
    })
    setAnnotations((current) => current.map((a) => {
      const entry = entries.find((e) => e.id === a.id)
      return entry ? ({ ...a, ...entry.patch, ...(local ? local(a) : {}) } as Annotation) : a
    }))
    const write = async (list: Array<{ id: string; patch: Snapshot }>) => {
      const results = await Promise.all(list.map(async (e) => {
        const { data, error } = await supabase.from("blueprint_annotations").update(e.patch).eq("id", e.id).select("id")
        return !error && Boolean(data?.length)
      }))
      return results.every(Boolean)
    }
    if (!(await write(entries))) {
      await ref.current.reload()
      fail(failureTitle, items.some((a) => a.locked))
      return false
    }
    undo.push({
      label: undoLabel,
      undo: async () => {
        const ok = await write(previous)
        await ref.current.reload()
        return ok
      },
      redo: async () => {
        const ok = await write(entries)
        await ref.current.reload()
        return ok
      },
    })
    touched()
    return true
  }

  const patchMany = (ids: string[], patch: Snapshot, failureTitle: string, undoLabel: string) => patchEach(ids.map((id) => ({ id, patch })), failureTitle, undoLabel)

  // Many items to new places in ONE transaction (the database refuses the whole batch if any item is locked).
  async function applyMoves(moves: Move[], failureTitle: string, undoLabel: string) {
    const { setAnnotations, undo, touched } = ref.current
    const items = byIds(moves.map((m) => m.id))
    if (items.some((a) => a.locked)) {
      fail(failureTitle, true) // a locked item never moves, not even on screen
      return false
    }
    if (!moves.length || !items.length) return false
    if (isNoop(items.map(toArrange), moves)) return true
    const previous: Move[] = items.map((a) => (a.points ? { id: a.id, points: a.points } : { id: a.id, x: a.x, y: a.y }))
    const apply = (list: Move[]) =>
      setAnnotations((current) => current.map((a) => {
        const move = list.find((m) => m.id === a.id)
        if (!move) return a
        if (move.points) {
          const b = bbox(move.points)
          return { ...a, points: move.points, x: b.x, y: b.y }
        }
        return { ...a, x: move.x ?? a.x, y: move.y ?? a.y }
      }))
    const send = async (list: Move[]) => {
      const { error } = await supabase.rpc("move_annotations", { p_moves: list })
      return !error
    }
    apply(moves)
    if (!(await send(moves))) {
      await ref.current.reload()
      fail(failureTitle, items.some((a) => a.locked))
      return false
    }
    undo.push({
      label: undoLabel,
      undo: async () => {
        const ok = await send(previous)
        await ref.current.reload()
        return ok
      },
      redo: async () => {
        const ok = await send(moves)
        await ref.current.reload()
        return ok
      },
    })
    touched()
    return true
  }

  const moveBy = (ids: string[], dx: number, dy: number, undoLabel?: string) => {
    const items = byIds(ids)
    return applyMoves(shiftedTogether(items.map(toArrange), dx, dy, ref.current.sheet), "The items could not be moved", undoLabel ?? label(items, "Move"))
  }
  const align = (ids: string[], mode: AlignMode) => applyMoves(alignMoves(byIds(ids).map(toArrange), mode, ref.current.sheet), "Could not align the items", `Align ${mode}`)
  const distribute = (ids: string[], axis: "horizontal" | "vertical") => applyMoves(distributeMoves(byIds(ids).map(toArrange), axis, ref.current.sheet), "Could not distribute the items", `Distribute ${axis}ly`)

  // ---------- Delete ----------
  async function remove(ids: string[]) {
    const { setAnnotations, undo, touched, toast, confirm } = ref.current
    const items = byIds(ids)
    if (!items.length) return false
    if (items.some((a) => a.locked)) {
      toast.error(items.length === 1 ? "This item is locked" : "Some items are locked", "Unlock them first, then delete.")
      return false
    }
    const noun = items.length === 1 ? `this ${annotationKindLabels[items[0].kind].toLowerCase()}` : `${items.length} items`
    if (!(await confirm({ title: `Delete ${noun}?`, message: "You can bring it back with Undo (Ctrl+Z).", confirmLabel: "Delete", tone: "danger" }))) return false
    const { data, error } = await supabase.from("blueprint_annotations").delete().in("id", ids).select("id")
    if (error || (data?.length ?? 0) !== items.length) {
      await ref.current.reload()
      toast.error("Could not delete", error ? dbMessage(error) : "You may not be allowed to.")
      return false
    }
    setAnnotations((current) => current.filter((a) => !ids.includes(a.id)))
    const snapshots = items.map((a) => snapshotOf(a))
    undo.push({
      label: label(items, "Delete"),
      undo: async () => {
        const { error: restoreError } = await supabase.from("blueprint_annotations").insert(snapshots.map((row) => ({ project_id: ref.current.projectId, blueprint_id: ref.current.blueprintId, ...row })))
        await ref.current.reload()
        return !restoreError
      },
      redo: async () => {
        const { data: removed } = await supabase.from("blueprint_annotations").delete().in("id", ids).select("id")
        await ref.current.reload()
        return (removed?.length ?? 0) === ids.length
      },
    })
    toast.success(items.length === 1 ? "Deleted" : `Deleted ${items.length} items`, "Press Ctrl+Z to undo.")
    touched()
    return true
  }

  // ---------- Layers ----------
  async function layer(ids: string[], action: LayerAction) {
    const { setAnnotations, undo, touched, toast } = ref.current
    const items = sortByLayer(byIds(ids))
    if (!items.length) return
    // Several items: only front / back make sense. Keep their relative order by sending the right one first.
    const order = action === "front" ? items : action === "back" ? [...items].reverse() : action === "forward" ? [...items].reverse() : items
    const before = new Map(ref.current.annotations.map((a) => [a.id, a.z_index]))
    let working = ref.current.annotations
    for (const item of order) {
      const changes = layerChanges(working, item.id, action)
      working = working.map((a) => ({ ...a, z_index: changes.find((c) => c.id === a.id)?.z_index ?? a.z_index }))
    }
    const changed = working.filter((a) => before.get(a.id) !== a.z_index)
    if (!changed.length) return
    setAnnotations(working)
    const run = async () => {
      for (const item of order) {
        const { error } = await supabase.rpc("move_annotation_layer", { p_id: item.id, p_action: action })
        if (error) return error.message
      }
      return ""
    }
    const failure = await run()
    if (failure) {
      await ref.current.reload()
      return toast.error("The layer order was not changed", failure.replace(/^.*?(You are not allowed[^"]*)/i, "$1"))
    }
    undo.push({
      label: "Change layer order",
      undo: async () => {
        const results = await Promise.all(changed.map(async (a) => {
          const { data, error } = await supabase.from("blueprint_annotations").update({ z_index: before.get(a.id) }).eq("id", a.id).select("id")
          return !error && Boolean(data?.length)
        }))
        await ref.current.reload()
        return results.every(Boolean)
      },
      redo: async () => {
        const again = await run()
        await ref.current.reload()
        return !again
      },
    })
    touched()
  }

  // Drag and drop in the Layers panel: the complete order of the sheet, bottom first, in one transaction.
  async function reorder(orderedIds: string[]) {
    const { setAnnotations, undo, touched, toast, blueprintId } = ref.current
    if (!blueprintId) return false
    const current = sortByLayer(ref.current.annotations).map((a) => a.id)
    if (current.length !== orderedIds.length || current.join() === orderedIds.join()) return false
    const apply = (list: string[]) => setAnnotations((all) => all.map((a) => ({ ...a, z_index: list.indexOf(a.id) })))
    const send = async (list: string[]) => {
      const { error } = await supabase.rpc("reorder_annotations", { p_blueprint: blueprintId, p_ids: list })
      return error ? error.message : ""
    }
    apply(orderedIds)
    const failure = await send(orderedIds)
    if (failure) {
      await ref.current.reload()
      toast.error("The layer order was not changed", failure.replace(/^.*?(You are not allowed[^"]*|The list of items[^"]*)/i, "$1"))
      return false
    }
    undo.push({
      label: "Change layer order",
      undo: async () => {
        const again = await send(current)
        await ref.current.reload()
        return !again
      },
      redo: async () => {
        const again = await send(orderedIds)
        await ref.current.reload()
        return !again
      },
    })
    touched()
    return true
  }

  // ---------- Locks and groups ----------
  const setLocked = (ids: string[], locked: boolean) => patchMany(ids, { locked }, "Could not change the lock", locked ? "Lock" : "Unlock")
  const group = (ids: string[]) => {
    if (ids.length < 2) return Promise.resolve(false)
    return patchMany(ids, { group_id: crypto.randomUUID() }, "Could not group the items", "Group")
  }
  const ungroup = (ids: string[]) => {
    const all = ref.current.annotations
    const members = withGroupMembers(all, ids).filter((id) => all.find((a) => a.id === id)?.group_id)
    return members.length ? patchMany(members, { group_id: null }, "Could not ungroup the items", "Ungroup") : Promise.resolve(false)
  }

  // ---------- Clipboard ----------
  const readClipboard = (): Snapshot[] => {
    try {
      const raw = window.sessionStorage.getItem(CLIPBOARD_KEY)
      return raw ? (JSON.parse(raw) as Snapshot[]) : []
    } catch {
      return []
    }
  }
  const copy = (ids: string[]) => {
    const items = sortByLayer(byIds(withGroupMembers(ref.current.annotations, ids)))
    if (!items.length) return 0
    try {
      window.sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(items.map((a) => snapshotOf(a, false))))
    } catch {
      ref.current.toast.error("Could not copy", "The browser blocked temporary storage.")
      return 0
    }
    pastes.current = 0
    return items.length
  }
  async function paste(): Promise<Annotation[]> {
    const stored = readClipboard()
    if (!stored.length) return []
    pastes.current += 1
    const step = 2 * pastes.current
    const groups = new Map<string, string>()
    const base = stored.map((row, index) => ({ ...row, id: `clip-${index}` })) as unknown as Annotation[]
    const moves = shiftedTogether(base.map((a) => toArrange(a)), step, step, ref.current.sheet)
    const rows = stored.map((row, index) => {
      const next: Snapshot = { ...row }
      const move = moves[index]
      if (move.points) next.points = move.points
      else {
        next.x = move.x
        next.y = move.y
      }
      if (typeof row.group_id === "string") {
        if (!groups.has(row.group_id)) groups.set(row.group_id, crypto.randomUUID())
        next.group_id = groups.get(row.group_id)
      }
      return next
    })
    const { created, failure } = await insert(rows, rows.length === 1 ? "Paste" : `Paste ${rows.length} items`)
    if (failure) ref.current.toast.error("Could not paste", failure)
    return created
  }
  async function duplicate(ids: string[]) {
    if (!copy(ids)) return []
    return paste()
  }

  // ---------- Style painter ----------
  const styleOf = (a: Annotation): Snapshot => {
    const style: Snapshot = {}
    for (const key of STYLE_KEYS) if (a[key] !== null && a[key] !== undefined) style[key] = a[key]
    return style
  }
  async function applyStyle(ids: string[], style: Snapshot, label = "Apply style") {
    const entries = byIds(ids).map((a) => {
      const patch: Snapshot = {}
      if (style.color !== undefined) patch.color = style.color
      if (style.opacity !== undefined) patch.opacity = style.opacity
      if (style.stroke !== undefined && ["draw", "highlight", "polyline", "area", "arrow", "dimension", "cloud"].includes(a.kind)) patch.stroke = style.stroke
      if (style.font_size !== undefined && a.kind === "text") patch.font_size = style.font_size
      return { id: a.id, patch }
    }).filter((entry) => Object.keys(entry.patch).length)
    return patchEach(entries, "Could not apply the style", label)
  }

  return { insert, patchEach, patchMany, applyMoves, moveBy, align, distribute, remove, layer, reorder, setLocked, group, ungroup, copy, paste, duplicate, styleOf, applyStyle, hasClipboard: () => readClipboard().length > 0 }
}

// Pure layering helpers (the same rules as the database function move_annotation_layer, so the screen updates
// instantly and the database result always agrees). No imports: tested with `pnpm test:lib`.
export type LayerAction = "front" | "back" | "forward" | "backward"
export type Layered = { id: string; z_index: number; created_at?: string }

// Bottom first. Ties (which the database never produces) are broken by creation time, then id, like the database does.
export function sortByLayer<T extends Layered>(items: T[]): T[] {
  return [...items].sort((a, b) => a.z_index - b.z_index || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id))
}

// New order of ids (bottom first) after applying an action to one item.
export function reorderIds(orderedIds: string[], id: string, action: LayerAction): string[] {
  const pos = orderedIds.indexOf(id)
  if (pos === -1) return orderedIds
  const n = orderedIds.length
  const target = action === "front" ? n : action === "back" ? 1 : action === "forward" ? Math.min(pos + 2, n) : Math.max(pos, 1)
  const rest = orderedIds.filter((value) => value !== id)
  return [...rest.slice(0, target - 1), id, ...rest.slice(target - 1)]
}

export const canMoveLayer = (orderedIds: string[], id: string, action: LayerAction) => {
  const pos = orderedIds.indexOf(id)
  if (pos === -1) return false
  return action === "front" || action === "forward" ? pos < orderedIds.length - 1 : pos > 0
}

// Renumber 0..n-1 after an action; returns only the items whose z_index changes.
export function layerChanges<T extends Layered>(items: T[], id: string, action: LayerAction): Array<{ id: string; z_index: number }> {
  const ordered = sortByLayer(items)
  const next = reorderIds(ordered.map((item) => item.id), id, action)
  const current = new Map(ordered.map((item) => [item.id, item.z_index]))
  return next.map((value, index) => ({ id: value, z_index: index })).filter((entry) => current.get(entry.id) !== entry.z_index)
}

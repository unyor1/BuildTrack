export function timelineWindow<T>(entries: T[], expanded: boolean, limit = 5): T[] {
  return expanded ? entries : entries.slice(0, Math.max(1, limit))
}

export function selectedVerification<T extends { id: string; project_id: string }>(pins: T[], projectId: string | null, selectedId: string | null): T | null {
  return selectedId && projectId ? pins.find(pin => pin.id === selectedId && pin.project_id === projectId) ?? null : null
}

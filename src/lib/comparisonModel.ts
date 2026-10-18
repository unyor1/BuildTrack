export const comparisonWasDragged = (start: { x: number; y: number }, end: { x: number; y: number }) =>
  Math.hypot(end.x - start.x, end.y - start.y) >= 6

export const comparisonFitWidth = (width: number, height: number) => Math.max(0, Math.min(width, height * 4 / 3))

export const MIN_PANEL_WIDTH = 320
export const MAX_PANEL_WIDTH = 760
export const DEFAULT_PANEL_WIDTH = 480

export function panelWidth(value: number, maximum = MAX_PANEL_WIDTH): number {
  const max = Number.isFinite(maximum) ? Math.max(0, Math.min(MAX_PANEL_WIDTH, maximum)) : MAX_PANEL_WIDTH
  return Math.round(Math.min(max, Math.max(Math.min(MIN_PANEL_WIDTH, max), Number.isFinite(value) ? value : DEFAULT_PANEL_WIDTH)))
}

export const dockedPanelMaximum = (viewport: number) => Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, viewport - 520))

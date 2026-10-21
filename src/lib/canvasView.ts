export type CanvasView = { scale: number; tx: number; ty: number }
export type CanvasPoint = { x: number; y: number }
export type CanvasSize = { width: number; height: number }
export const MIN_CANVAS_SCALE = 0.05
export const MAX_CANVAS_SCALE = 10
export const CANVAS_ZOOM_STEP = 1.3
export const canvasWheelFactor = (deltaY: number) => Math.exp(-deltaY * 0.0015)
const clampScale = (scale: number) => Math.min(MAX_CANVAS_SCALE,Math.max(MIN_CANVAS_SCALE,scale))

export function fitCanvasView(image: CanvasSize, viewport: CanvasSize, mode: "fit" | "fill" = "fit"): CanvasView {
  const padding = mode === "fit" ? 24 : 0
  const x = (viewport.width-padding)/image.width, y = (viewport.height-padding)/image.height
  const scale = clampScale(mode === "fit" ? Math.min(x,y) : Math.max(x,y))
  return {scale,tx:(viewport.width-image.width*scale)/2,ty:(viewport.height-image.height*scale)/2}
}

// Keep the same image coordinate beneath the cursor / viewport center.
export function zoomCanvasView(view: CanvasView, factor: number, anchor: CanvasPoint): CanvasView {
  const scale = clampScale(view.scale*factor), ratio = scale/view.scale
  return {scale,tx:anchor.x-(anchor.x-view.tx)*ratio,ty:anchor.y-(anchor.y-view.ty)*ratio}
}

export function pinchCanvasView(view: CanvasView, factor: number, start: CanvasPoint, current: CanvasPoint): CanvasView {
  const zoomed = zoomCanvasView(view,factor,start)
  return {...zoomed,tx:zoomed.tx+current.x-start.x,ty:zoomed.ty+current.y-start.y}
}

import type { ReactNode, Ref } from "react"
import Popover from "../ui/Popover"
import { Icon } from "../editor/EditorToolbar"
import type { IssueMarkup } from "../../lib/issueMarkup"
import { ROTATE_STEP, markupColors, photoCounter, shapeTools, textSizes, toolLabels, toolShortcuts, type PhotoTool } from "../../lib/photoEditorModel"

// The photo editor's controls in the blueprint editor's look (ContextBar / EditorToolbar): icon buttons with tooltips, the
// active tool filled in brand colour, shape tools grouped in one dropdown and a zoom group. Presentational only.
const control = "flex h-9 min-w-9 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
const look = (active = false) => `${control} ${active ? "bg-brand text-white shadow-sm" : "text-fg hover:bg-surface-muted"}`
const toggled = (on: boolean) => `${control} ${on ? "bg-surface text-brand-text ring-1 ring-brand" : "text-fg hover:bg-surface"}`

// Extra glyphs the blueprint icon set has no need for; everything else comes from its Icon.
const glyphs: Record<string, ReactNode> = {
  line: <path d="M5 19L19 5" />,
  rectangle: <rect x="4" y="6" width="16" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6" />,
  pan: <><path d="M8 13V5.5a1.5 1.5 0 013 0V11" /><path d="M11 10.5V4a1.5 1.5 0 013 0v6.5" /><path d="M14 10.5V5.5a1.5 1.5 0 013 0V13" /><path d="M17 11.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1.5a6 6 0 01-4.6-2.2L4 15.5a1.6 1.6 0 012.4-2L8 15" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 5.1A9.6 9.6 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.4 9.4 0 005.4-1.6" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></>,
  fill: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity=".45" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  collapse: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  rotateLeft: <><path d="M4 12a8 8 0 1 1 2.5 5.8" /><path d="M4 5v5h5" /></>,
}
export function Glyph({ name, size = 18 }: { name: string; size?: number }) {
  if (!glyphs[name]) return <Icon name={name} size={size} />
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyphs[name]}</svg>
}
const toolIcon: Record<PhotoTool, string> = { select: "select", pan: "pan", text: "text", line: "line", arrow: "arrow", rectangle: "rectangle", ellipse: "ellipse", draw: "pen" }
const isShape = (tool: PhotoTool): tool is (typeof shapeTools)[number] => (shapeTools as readonly string[]).includes(tool)

function Divider() {
  return <span className="mx-0.5 h-6 w-px flex-none bg-line" aria-hidden="true" />
}

function IconButton({ icon, label, shortcut, onClick, active, disabled = false, danger = false, text }: { icon: string; label: string; shortcut?: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean; text?: string }) {
  return (
    <button type="button" disabled={disabled} aria-pressed={active} aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} onClick={onClick} className={danger ? `${control} text-danger-fg hover:bg-danger-soft` : look(active)}>
      <Glyph name={icon} />
      {text ? <span className="hidden lg:inline">{text}</span> : null}
    </button>
  )
}

export type SlideControls = { index: number; count: number; open: boolean; onToggle: () => void; onPrev: () => void; onNext: () => void }

export default function PhotoEditorToolbar({
  readOnly, active, onTool, busy, canUndo, canRedo, onUndo, onRedo, original, onOriginal,
  scale, canZoomIn, canZoomOut, onZoomIn, onZoomOut, sizing, onFit, onFill, fullscreen, onFullscreen, slides,
}: {
  readOnly: boolean; active: PhotoTool; onTool: (tool: PhotoTool) => void; busy: boolean
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; original: boolean; onOriginal: () => void
  scale: number; canZoomIn: boolean; canZoomOut: boolean; onZoomIn: () => void; onZoomOut: () => void
  sizing: "fit" | "fill" | "manual"; onFit: () => void; onFill: () => void; fullscreen: boolean; onFullscreen: () => void
  slides?: SlideControls
}) {
  const shape = isShape(active) ? active : null
  const tool = (key: PhotoTool, disabled = false) => (
    <IconButton key={key} icon={toolIcon[key]} label={toolLabels[key]} shortcut={toolShortcuts[key]} active={active === key} disabled={disabled} onClick={() => onTool(key)} text={key === "select" || key === "pan" ? undefined : toolLabels[key]} />
  )
  return (
    <div role="toolbar" aria-label="Photo tools" className="flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-line bg-surface px-1.5 py-1 shadow-sm">
      {slides ? (
        <>
          <IconButton icon="sheets" label={slides.open ? "Hide photo thumbnails" : "Show photo thumbnails"} active={slides.open} onClick={slides.onToggle} />
          <IconButton icon="prev" label="Previous photo" shortcut="Page Up" disabled={busy || slides.index === 0} onClick={slides.onPrev} />
          <span className="min-w-[6.5rem] px-1 text-center text-sm font-bold tabular-nums" aria-live="polite">{photoCounter(slides.index, slides.count)}</span>
          <IconButton icon="next" label="Next photo" shortcut="Page Down" disabled={busy || slides.index >= slides.count - 1} onClick={slides.onNext} />
          <Divider />
        </>
      ) : null}
      {tool("select", busy)}
      {tool("pan", busy)}
      {!readOnly ? (
        <>
          <Divider />
          {tool("text", busy || original)}
          <Popover
            label="Shapes: line, arrow, rectangle, ellipse, freehand"
            width={236}
            disabled={busy || original}
            className={look(Boolean(shape))}
            trigger={<><Glyph name={shape ? toolIcon[shape] : "rectangle"} /><span className="hidden sm:inline">{shape ? toolLabels[shape] : "Shapes"}</span><Icon name="chevron" size={14} /></>}
          >
            {(close) => (
              <div className="p-1.5" role="group" aria-label="Shape tools">
                {shapeTools.map((key) => (
                  <button key={key} type="button" aria-pressed={active === key} onClick={() => { onTool(key); close() }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${active === key ? "bg-brand text-white" : "hover:bg-surface-muted"}`}>
                    <Glyph name={toolIcon[key]} size={16} />
                    <span className="flex-1">{toolLabels[key]}</span>
                    <kbd className={`rounded border px-1.5 text-[11px] font-bold ${active === key ? "border-white/40 text-white/90" : "border-line text-fg-muted"}`}>{toolShortcuts[key]}</kbd>
                  </button>
                ))}
              </div>
            )}
          </Popover>
          <Divider />
          <IconButton icon="undo" label="Undo" shortcut="Ctrl+Z" disabled={busy || !canUndo} onClick={onUndo} />
          <IconButton icon="redo" label="Redo" shortcut="Ctrl+Shift+Z" disabled={busy || !canRedo} onClick={onRedo} />
        </>
      ) : null}
      <Divider />
      <IconButton icon={original ? "eyeOff" : "eye"} label={original ? "Show markup" : "View original"} active={original} onClick={onOriginal} text={original ? "Show markup" : "Original"} />
      <div className="ml-auto flex flex-none items-center gap-0.5 rounded-xl border border-line bg-surface-muted/60 p-0.5" role="group" aria-label="Zoom">
        <IconButton icon="zoomOut" label="Zoom out photo" shortcut="-" disabled={busy || !canZoomOut} onClick={onZoomOut} />
        <span className="w-12 text-center text-sm font-bold tabular-nums" role="status" aria-live="polite" title="Photo scale">{`${Math.round(scale * 100)}%`}</span>
        <IconButton icon="zoomIn" label="Zoom in photo" shortcut="+" disabled={busy || !canZoomIn} onClick={onZoomIn} />
        <button type="button" aria-label="Fit" aria-pressed={sizing === "fit"} title="Fit: the whole photo, nothing cropped (0)" disabled={busy} onClick={onFit} className={toggled(sizing === "fit")}><Icon name="fit" /><span className="hidden xl:inline">Fit</span></button>
        <button type="button" aria-label="Fill" aria-pressed={sizing === "fill"} title="Fill: cover the canvas (edges may be cut off)" disabled={busy} onClick={onFill} className={toggled(sizing === "fill")}><Glyph name="fill" /><span className="hidden xl:inline">Fill</span></button>
      </div>
      <IconButton icon={fullscreen ? "collapse" : "expand"} label={fullscreen ? "Exit fullscreen photo editor" : "Enter fullscreen photo editor"} shortcut={fullscreen ? "Esc" : undefined} active={fullscreen} onClick={onFullscreen} />
    </div>
  )
}

// Shown while a drawing tool is active or a mark is selected. With a mark selected every change applies to it straight away.
export function MarkupProperties({ mark, tool, color, stroke, fontSize, text, textRef, disabled, onColor, onStroke, onFontSize, onText, onDelete, rotation = 0, onRotate, onRotateBy }: {
  mark: IssueMarkup | null; tool: PhotoTool; color: string; stroke: number; fontSize: number; text: string; textRef?: Ref<HTMLInputElement>; disabled: boolean
  onColor: (color: string, live: boolean) => void; onStroke: (stroke: number) => void; onFontSize: (size: number) => void; onText: (text: string) => void; onDelete: () => void
  rotation?: number; onRotate?: (degrees: number, live: boolean) => void; onRotateBy?: (delta: number) => void
}) {
  const kind = mark?.kind ?? tool
  const isText = kind === "text"
  return (
    <div role="toolbar" aria-label={mark ? "Selected mark" : `${toolLabels[tool]} options`} className="flex shrink-0 flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-muted/60 px-2 py-1">
      <span className="px-1 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{mark ? `Selected ${toolLabels[mark.kind].toLowerCase()}` : toolLabels[tool]}</span>
      <Divider />
      <Popover label="Color" width={244} disabled={disabled} className={look()} trigger={<><span className="h-5 w-5 rounded-full border-2 border-line" style={{ background: color }} /><span className="hidden sm:inline">Color</span></>}>
        {(close) => (
          <div className="space-y-2 p-3">
            <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Color">
              {markupColors.map((swatch) => (
                <button key={swatch.value} type="button" role="radio" aria-checked={color.toLowerCase() === swatch.value} aria-label={swatch.name} title={swatch.name} onClick={() => { onColor(swatch.value, false); close() }} className={`h-6 w-6 rounded-full border-2 transition ${color.toLowerCase() === swatch.value ? "scale-110 border-fg shadow" : "border-line hover:scale-105"}`} style={{ background: swatch.value }} />
              ))}
            </div>
            <label className="flex items-center justify-between gap-2 text-xs font-semibold">Custom colour<input type="color" aria-label="Custom color" value={color} onChange={(event) => onColor(event.target.value, true)} className="h-8 w-12 cursor-pointer rounded border border-line bg-surface" /></label>
          </div>
        )}
      </Popover>
      {isText ? (
        <span className="flex items-center rounded-lg border border-line bg-surface p-0.5" role="radiogroup" aria-label="Text size">
          {textSizes.map((size) => (
            <button key={size.label} type="button" role="radio" aria-checked={fontSize === size.value} disabled={disabled} title={`Text size ${size.label} (${size.value})`} onClick={() => onFontSize(size.value)} className={`h-8 min-w-8 rounded-md px-1.5 text-xs font-bold transition disabled:opacity-40 ${fontSize === size.value ? "bg-brand text-white" : "text-fg hover:bg-surface-muted"}`}>{size.label}</button>
          ))}
        </span>
      ) : (
        <Popover label="Line width" width={232} disabled={disabled} className={look()} trigger={<><Icon name="stroke" /><span className="hidden sm:inline tabular-nums">{stroke}px</span></>}>
          {() => (
            <div className="space-y-2 p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">Line width</p>
              <input type="range" min={1} max={12} value={stroke} aria-label="Annotation line width" onChange={(event) => onStroke(Number(event.target.value))} className="w-full accent-[#9e1f93]" />
              <span className="block rounded-full" style={{ height: stroke, background: color }} aria-hidden="true" />
            </div>
          )}
        </Popover>
      )}
      {isText ? <input ref={textRef} aria-label="Annotation text" disabled={disabled} maxLength={300} placeholder={mark ? "Text of the selected mark" : "Type the text, then click the photo"} value={text} onChange={(event) => onText(event.target.value)} className="h-9 min-w-[12rem] flex-1 rounded-lg border border-line bg-surface px-2.5 text-sm sm:max-w-sm" /> : null}
      {mark && onRotate && onRotateBy ? (
        <span className="flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Rotation">
          <IconButton icon="rotateLeft" label={`Rotate left ${ROTATE_STEP}°`} shortcut="[" disabled={disabled} onClick={() => onRotateBy(-ROTATE_STEP)} />
          <input type="number" min={-180} max={180} step={1} aria-label="Rotation in degrees" title="Rotation in degrees (or drag the round handle above the mark)" disabled={disabled} value={Math.round(rotation)} onChange={(event) => onRotate(Number(event.target.value) || 0, true)} className="h-8 w-16 rounded-md border border-line bg-surface px-1.5 text-right text-sm tabular-nums" />
          <span className="pr-0.5 text-xs text-fg-muted" aria-hidden="true">°</span>
          <IconButton icon="rotate" label={`Rotate right ${ROTATE_STEP}°`} shortcut="]" disabled={disabled} onClick={() => onRotateBy(ROTATE_STEP)} />
        </span>
      ) : null}
      {mark ? <><Divider /><IconButton icon="trash" label="Delete selected" shortcut="Del" danger disabled={disabled} onClick={onDelete} /></> : null}
    </div>
  )
}

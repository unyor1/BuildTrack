import { useEffect, useState, type ReactNode } from "react"
import Menu, { type MenuItem } from "../ui/Menu"
import Popover from "../ui/Popover"
import { Icon, ToolOptionsRow, allowedTool, toolDefs, type ToolDef, type ToolOptions } from "./EditorToolbar"
import LayerStack, { describe, type LayerStackProps } from "./LayerStack"
import type { SelectionActions } from "./Inspector"
import { annotationColors, statusDot, statusLabels, type Annotation, type AnnotationColor, type EditorTool, type Pin, type PinStatus } from "../../lib/blueprints"
import type { AlignMode } from "../../lib/arrange"
import { canFormat, fontFamilies, labelToSize, resolveFormat, sizeToLabel, type FontName, type ListStyle, type TextAlign, type TextFormat, type TextTransform } from "../../lib/textFormat"
import { canMoveLayer, sortByLayer } from "../../lib/layers"
import { clientPinStatus } from "../../lib/clientPortalModel"

export type StylePatch = { color?: AnnotationColor; opacity?: number; stroke?: number; font_size?: number; rotation?: number }

export type ContextBarProps = {
  tool: EditorTool
  onTool: (tool: EditorTool) => void
  canEdit: boolean
  canStamp: boolean
  toolsInBar: boolean // false when the tools live in the floating palette
  options: ToolOptions
  pin: Pin | null
  pinNumber: number | null
  annotations: Annotation[]
  actions: SelectionActions
  onStyle: (patch: StylePatch, label: string) => void
  onFormat: (patch: TextFormat, label: string) => void
  pinStatuses: PinStatus[]
  onSetPinStatus: (pin: Pin, status: PinStatus) => void
  onTogglePinLock: (pin: Pin) => void
  onOpenPinDetails: () => void
  onDeletePin: () => void
  onPinQr?: () => void
  layerProps: LayerStackProps
}

const control = "flex h-9 min-w-9 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
const quiet = `${control} text-fg hover:bg-surface-muted`
const strokeKinds = ["draw", "highlight", "polyline", "area", "arrow", "dimension", "cloud"]
const rotatable = ["image", "shape", "text", "symbol"]
const primaryTools: EditorTool[] = ["select", "pin", "note", "shape", "measure", "image"]
const textSizes = [{ label: "S", value: 1 }, { label: "M", value: 1.6 }, { label: "L", value: 2.4 }, { label: "XL", value: 3.6 }]
const alignButtons: Array<{ mode: AlignMode; icon: string; label: string }> = [
  { mode: "left", icon: "alignLeft", label: "Left" },
  { mode: "center", icon: "alignCenter", label: "Center" },
  { mode: "right", icon: "alignRight", label: "Right" },
  { mode: "top", icon: "alignTop", label: "Top" },
  { mode: "middle", icon: "alignMiddle", label: "Middle" },
  { mode: "bottom", icon: "alignBottom", label: "Bottom" },
]

function Divider() {
  return <span className="mx-1 h-6 w-px flex-none bg-line" aria-hidden="true" />
}

function IconButton({ icon, label, shortcut, onClick, active = false, disabled = false, danger = false, text }: { icon: string; label: string; shortcut?: string; onClick: () => void; active?: boolean; disabled?: boolean; danger?: boolean; text?: string }) {
  return (
    <button type="button" disabled={disabled} aria-pressed={active || undefined} aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} onClick={onClick} className={`${control} ${active ? "bg-brand text-white shadow-sm" : danger ? "text-danger-fg hover:bg-danger-soft" : "text-fg hover:bg-surface-muted"}`}>
      <Icon name={icon} size={18} />
      {text ? <span className="hidden xl:inline">{text}</span> : null}
    </button>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-fg-muted">{children}</p>
}

// ---- Position flyout: Arrange (order, align, rotation) and Layers (the full stack) ----
function PositionPanel({ annotations, actions, onStyle, layerProps, locked, canEdit }: { annotations: Annotation[]; actions: SelectionActions; onStyle: ContextBarProps["onStyle"]; layerProps: LayerStackProps; locked: boolean; canEdit: boolean }) {
  const [tab, setTab] = useState<"arrange" | "layers">("arrange")
  const ids = annotations.map((item) => item.id)
  const orderedIds = sortByLayer(layerProps.annotations).map((item) => item.id)
  const can = (action: "forward" | "backward" | "front" | "back") => canEdit && ids.length > 0 && ids.some((id) => canMoveLayer(orderedIds, id, action))
  const single = annotations.length === 1 ? annotations[0] : null
  const [turn, setTurn] = useState(String(single?.rotation ?? 0))
  useEffect(() => setTurn(String(single?.rotation ?? 0)), [single?.id, single?.rotation])
  const commitTurn = () => {
    if (!single) return
    const value = Number(turn)
    if (!Number.isFinite(value)) return setTurn(String(single.rotation ?? 0))
    const normalised = Math.max(-360, Math.min(360, Math.round(value * 10) / 10))
    if (normalised !== (single.rotation ?? 0)) onStyle({ rotation: normalised }, "Rotate")
  }
  const orderButtons: Array<{ action: "forward" | "backward" | "front" | "back"; icon: string; label: string; shortcut?: string }> = [
    { action: "forward", icon: "forward", label: "Forward" },
    { action: "backward", icon: "backward", label: "Backward" },
    { action: "front", icon: "front", label: "To front", shortcut: "Ctrl+]" },
    { action: "back", icon: "sendBack", label: "To back", shortcut: "Ctrl+[" },
  ]
  return (
    <div>
      <div role="tablist" aria-label="Position" className="flex border-b border-line">
        {(["arrange", "layers"] as const).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`flex-1 border-b-2 px-3 py-2.5 text-sm font-bold transition ${tab === key ? "border-brand text-brand-text" : "border-transparent text-fg-muted hover:text-fg"}`}>
            {key === "arrange" ? "Arrange" : "Layers"}
          </button>
        ))}
      </div>
      {tab === "arrange" ? (
        <div className="space-y-4 p-3">
          <div>
            <SectionTitle>Order</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {orderButtons.map((item) => (
                <button key={item.action} type="button" disabled={!can(item.action)} onClick={() => actions.layer(item.action)} title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label} className="flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40">
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <SectionTitle>{annotations.length > 1 ? "Align the selection" : "Align to the sheet"}</SectionTitle>
            <div className="grid grid-cols-6 gap-1">
              {alignButtons.map((item) => (
                <button key={item.mode} type="button" disabled={!canEdit || locked} onClick={() => (annotations.length > 1 ? actions.align(item.mode) : actions.alignToSheet(item.mode))} title={`Align ${item.label.toLowerCase()}`} aria-label={`Align ${item.label.toLowerCase()}`} className="flex h-10 items-center justify-center rounded-lg border border-line transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40">
                  <Icon name={item.icon} size={18} />
                </button>
              ))}
            </div>
            {annotations.length > 2 ? (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <button type="button" disabled={!canEdit || locked} onClick={() => actions.distribute("horizontal")} className="flex h-9 items-center justify-center gap-2 rounded-lg border border-line text-xs font-semibold hover:bg-surface-muted disabled:opacity-40"><Icon name="distH" size={16} />Spread across</button>
                <button type="button" disabled={!canEdit || locked} onClick={() => actions.distribute("vertical")} className="flex h-9 items-center justify-center gap-2 rounded-lg border border-line text-xs font-semibold hover:bg-surface-muted disabled:opacity-40"><Icon name="distV" size={16} />Spread down</button>
              </div>
            ) : null}
          </div>
          {single && rotatable.includes(single.kind) ? (
            <label className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span className="flex items-center gap-2"><Icon name="rotate" size={16} />Rotation</span>
              <span className="flex items-center gap-1">
                <input type="number" min={-360} max={360} step={1} value={turn} disabled={!canEdit || locked} onChange={(event) => setTurn(event.target.value)} onBlur={commitTurn} onKeyDown={(event) => event.key === "Enter" && commitTurn()} className="h-9 w-20 rounded-lg border border-line bg-surface px-2 text-right text-sm disabled:opacity-50" aria-label="Rotation in degrees" />
                <span className="text-xs text-fg-muted">deg</span>
              </span>
            </label>
          ) : null}
          {locked ? <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-fg-muted">This selection is locked. The stacking order can still change; unlock it to move, align or rotate.</p> : null}
        </div>
      ) : (
        <div className="max-h-[22rem] overflow-y-auto p-3">
          <LayerStack {...layerProps} selectedIds={ids} />
        </div>
      )}
    </div>
  )
}

function OpacityPanel({ value, onCommit }: { value: number; onCommit: (opacity: number) => void }) {
  const [percent, setPercent] = useState(Math.round(value * 100))
  const commit = (next: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(next) ? next : 100)))
    setPercent(clamped)
    if (clamped !== Math.round(value * 100)) onCommit(clamped / 100)
  }
  return (
    <div className="space-y-2 p-3">
      <SectionTitle>Transparency</SectionTitle>
      <div className="flex items-center gap-3">
        <input type="range" min={0} max={100} step={1} value={percent} aria-label="Opacity" onChange={(event) => setPercent(Number(event.target.value))} onPointerUp={() => commit(percent)} onKeyUp={() => commit(percent)} onBlur={() => commit(percent)} className="h-2 flex-1 accent-[#9e1f93]" />
        <span className="flex items-center gap-1">
          <input type="number" min={0} max={100} value={percent} aria-label="Opacity percent" onChange={(event) => setPercent(Number(event.target.value))} onBlur={() => commit(percent)} onKeyDown={(event) => event.key === "Enter" && commit(percent)} className="h-9 w-16 rounded-lg border border-line bg-surface px-2 text-right text-sm" />
          <span className="text-xs text-fg-muted">%</span>
        </span>
      </div>
    </div>
  )
}

function ColorPanel({ value, onPick }: { value: AnnotationColor; onPick: (color: AnnotationColor) => void }) {
  return (
    <div className="p-3">
      <SectionTitle>Color</SectionTitle>
      <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Color">
        {(Object.keys(annotationColors) as AnnotationColor[]).map((name) => (
          <button key={name} type="button" role="radio" aria-checked={value === name} aria-label={name} title={name} onClick={() => onPick(name)} className={`h-8 w-8 rounded-full border-2 transition ${value === name ? "scale-110 border-fg shadow" : "border-line hover:scale-105"}`} style={{ background: annotationColors[name] }} />
        ))}
      </div>
    </div>
  )
}

function StrokePanel({ value, onCommit }: { value: number; onCommit: (stroke: number) => void }) {
  const [size, setSize] = useState(value)
  const commit = () => size !== value && onCommit(size)
  return (
    <div className="space-y-2 p-3">
      <SectionTitle>Line thickness</SectionTitle>
      <input type="range" min={0.05} max={3} step={0.05} value={size} aria-label="Line thickness" onChange={(event) => setSize(Number(event.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} className="w-full accent-[#9e1f93]" />
      <span className="block rounded-full bg-fg" style={{ height: Math.max(2, Math.min(18, size * 8)), opacity: 0.8 }} aria-hidden="true" />
    </div>
  )
}

// ---- Text formatting (text boxes and notes): font, size, colour, bold / italic / underline / strike, case, alignment, list, spacing ----
function TextFormatBar({ annotations, disabled, onStyle, onFormat }: { annotations: Annotation[]; disabled: boolean; onStyle: ContextBarProps["onStyle"]; onFormat: ContextBarProps["onFormat"] }) {
  const looks = annotations.map((a) => resolveFormat(a.kind, a.format))
  const first = looks[0]
  const all = (test: (look: (typeof looks)[number]) => boolean) => looks.every(test)
  const hasText = annotations.some((a) => a.kind === "text")
  const sizeNow = annotations.find((a) => a.kind === "text")?.font_size ?? 1.6
  const [size, setSize] = useState(String(sizeToLabel(sizeNow)))
  useEffect(() => setSize(String(sizeToLabel(sizeNow))), [sizeNow])
  const commitSize = (label: number) => {
    if (!Number.isFinite(label)) return setSize(String(sizeToLabel(sizeNow)))
    const next = labelToSize(label)
    setSize(String(sizeToLabel(next)))
    if (next !== sizeNow) onStyle({ font_size: next }, "Change text size")
  }
  const toggle = (key: "bold" | "italic" | "underline" | "strike", label: string, glyph: ReactNode, shortcut?: string) => {
    const on = all((look) => look[key])
    return (
      <button key={key} type="button" disabled={disabled} aria-pressed={on} aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} onClick={() => onFormat({ [key]: !on }, label)} className={`${control} !w-9 !px-0 text-[15px] ${on ? "bg-brand text-white shadow-sm" : "text-fg hover:bg-surface-muted"}`}>
        {glyph}
      </button>
    )
  }
  const choose = <T extends string>(options: Array<{ value: T; label: string; icon?: string }>, current: T, apply: (value: T) => void): MenuItem[] => options.map((option) => ({ label: option.label, checked: current === option.value, icon: option.icon ? <Icon name={option.icon} size={14} /> : undefined, onClick: () => apply(option.value) }))
  const colorNow = annotations[0]?.color ?? "black"
  const alignIcon = ({ left: "textLeft", center: "textCenter", right: "textRight", justify: "textJustify" } as const)[first.align]
  const listIcon = first.list === "number" ? "listNumber" : "listBullet"
  return (
    <>
      <select aria-label="Font" title="Font" disabled={disabled} value={all((look) => look.family === first.family) ? first.family : ""} onChange={(event) => onFormat({ family: event.target.value as FontName }, "Change font")} className="h-9 w-32 flex-none rounded-lg border border-line bg-surface px-2 text-sm font-semibold text-fg disabled:opacity-40" style={{ fontFamily: fontFamilies.find((font) => font.name === first.family)?.stack }}>
        {all((look) => look.family === first.family) ? null : <option value="">Mixed</option>}
        {fontFamilies.map((font) => <option key={font.name} value={font.name} style={{ fontFamily: font.stack }}>{font.name}</option>)}
      </select>
      {hasText ? (
        <span className="flex h-9 flex-none items-center rounded-lg border border-line" role="group" aria-label="Font size">
          <button type="button" disabled={disabled} aria-label="Smaller" title="Smaller" onClick={() => commitSize(Number(size) - 1)} className="flex h-9 w-8 items-center justify-center rounded-l-lg text-lg font-bold hover:bg-surface-muted disabled:opacity-40">−</button>
          <input aria-label="Font size" inputMode="decimal" disabled={disabled} value={size} onChange={(event) => setSize(event.target.value)} onBlur={() => commitSize(Number(size))} onKeyDown={(event) => event.key === "Enter" && commitSize(Number(size))} className="h-9 w-12 border-x border-line bg-transparent text-center text-sm font-bold tabular-nums disabled:opacity-40" />
          <button type="button" disabled={disabled} aria-label="Larger" title="Larger" onClick={() => commitSize(Number(size) + 1)} className="flex h-9 w-8 items-center justify-center rounded-r-lg text-lg font-bold hover:bg-surface-muted disabled:opacity-40">+</button>
        </span>
      ) : null}
      <Popover label="Text color" width={296} disabled={disabled} className={`${control} !px-2`} trigger={<span className="flex flex-col items-center leading-none"><span className="text-[17px] font-extrabold">A</span><span className="mt-0.5 h-1 w-5 rounded-full" style={{ background: annotationColors[colorNow] }} /></span>}>
        {(close) => <ColorPanel value={colorNow} onPick={(color) => { onStyle({ color }, "Change color"); close() }} />}
      </Popover>
      {toggle("bold", "Bold", <b>B</b>, "Ctrl+B")}
      {toggle("italic", "Italic", <i className="font-serif">I</i>, "Ctrl+I")}
      {toggle("underline", "Underline", <u>U</u>, "Ctrl+U")}
      {toggle("strike", "Strikethrough", <s>S</s>)}
      <Menu label="Text case" items={choose<TextTransform>([{ value: "none", label: "As typed" }, { value: "uppercase", label: "UPPERCASE" }, { value: "lowercase", label: "lowercase" }, { value: "capitalize", label: "Capitalize Each Word" }], all((look) => look.transform === first.transform) ? first.transform : "none", (value) => onFormat({ transform: value }, "Change text case"))} className={`${control} ${first.transform !== "none" ? "bg-brand-soft text-brand-text" : "text-fg hover:bg-surface-muted"}`}>
        <span className="text-[15px] font-bold">aA</span>
      </Menu>
      <Menu label="Alignment" items={choose<TextAlign>([{ value: "left", label: "Left", icon: "textLeft" }, { value: "center", label: "Center", icon: "textCenter" }, { value: "right", label: "Right", icon: "textRight" }, { value: "justify", label: "Justify", icon: "textJustify" }], first.align, (value) => onFormat({ align: value }, "Change alignment"))} className={`${control} text-fg hover:bg-surface-muted`}>
        <Icon name={alignIcon} size={18} />
      </Menu>
      <Menu label="List" items={choose<ListStyle>([{ value: "none", label: "No list" }, { value: "bullet", label: "Bullets", icon: "listBullet" }, { value: "number", label: "Numbers", icon: "listNumber" }], first.list, (value) => onFormat({ list: value }, "Change list style"))} className={`${control} ${first.list !== "none" ? "bg-brand-soft text-brand-text" : "text-fg hover:bg-surface-muted"}`}>
        <Icon name={listIcon} size={18} />
      </Menu>
      <Popover label="Line and letter spacing" width={280} disabled={disabled} className={`${control} text-fg hover:bg-surface-muted`} trigger={<Icon name="spacing" size={18} />}>
        {() => <SpacingPanel lineHeight={first.line_height} letterSpacing={first.letter_spacing} onCommit={(patch) => onFormat(patch, "Change spacing")} />}
      </Popover>
    </>
  )
}

function SpacingPanel({ lineHeight, letterSpacing, onCommit }: { lineHeight: number; letterSpacing: number; onCommit: (patch: TextFormat) => void }) {
  const [line, setLine] = useState(lineHeight)
  const [letter, setLetter] = useState(letterSpacing)
  return (
    <div className="space-y-4 p-3">
      <label className="block text-sm font-semibold">
        <span className="flex justify-between"><span>Line spacing</span><span className="tabular-nums text-fg-muted">{line.toFixed(2)}</span></span>
        <input type="range" min={0.8} max={3} step={0.05} value={line} aria-label="Line spacing" onChange={(event) => setLine(Number(event.target.value))} onPointerUp={() => line !== lineHeight && onCommit({ line_height: line })} onKeyUp={() => line !== lineHeight && onCommit({ line_height: line })} className="mt-1 w-full accent-[#9e1f93]" />
      </label>
      <label className="block text-sm font-semibold">
        <span className="flex justify-between"><span>Letter spacing</span><span className="tabular-nums text-fg-muted">{Math.round(letter * 100)}</span></span>
        <input type="range" min={-0.1} max={0.5} step={0.01} value={letter} aria-label="Letter spacing" onChange={(event) => setLetter(Number(event.target.value))} onPointerUp={() => letter !== letterSpacing && onCommit({ letter_spacing: Math.round(letter * 100) / 100 })} onKeyUp={() => letter !== letterSpacing && onCommit({ letter_spacing: Math.round(letter * 100) / 100 })} className="mt-1 w-full accent-[#9e1f93]" />
      </label>
    </div>
  )
}

export default function ContextBar(props: ContextBarProps) {
  const { tool, onTool, canEdit, canStamp, pin, annotations, actions } = props
  const selecting = tool === "select" && (Boolean(pin) || annotations.length > 0)
  const toolItems = (list: ToolDef[]): MenuItem[] => list.map((def) => ({ label: def.label, hint: def.key, icon: <Icon name={def.tool} size={14} />, checked: tool === def.tool, disabled: !allowedTool(def.tool, canEdit, canStamp), onClick: () => onTool(def.tool) }))
  const toolsMenu = (
    <Menu label="Add or draw something" items={[{ heading: "Tools" }, ...toolItems(toolDefs)]} className={`${control} border border-line text-fg hover:bg-surface-muted`}>
      <Icon name="shape" size={18} />
      <span className="hidden lg:inline">Tools</span>
      <Icon name="chevron" size={14} />
    </Menu>
  )

  // ---- Nothing selected (or a drawing tool is active): the creation tools ----
  if (!selecting) {
    if (!props.toolsInBar) {
      return tool === "select" ? (
        <div className="flex h-10 items-center border-t border-line px-4 text-xs text-fg-muted">Click an item on the sheet to edit it. The tools are in the floating palette.</div>
      ) : (
        <ToolOptionsRow tool={tool} options={props.options} />
      )
    }
    const primary = primaryTools.map((key) => toolDefs.find((def) => def.tool === key)).filter((def): def is ToolDef => Boolean(def))
    const more = toolDefs.filter((def) => !primaryTools.includes(def.tool))
    const moreActive = more.some((def) => def.tool === tool)
    return (
      <div className="border-t border-line">
        <div className="flex min-h-12 items-center gap-1 overflow-x-auto [scrollbar-width:none] px-3 py-1.5" role="toolbar" aria-label="Tools">
          {primary.map((def) => {
            const ok = allowedTool(def.tool, canEdit, canStamp)
            const active = tool === def.tool
            return (
              <button key={def.tool} type="button" disabled={!ok} aria-pressed={active} title={`${def.hint} (${def.key})${ok ? "" : ", not available for your role"}`} onClick={() => onTool(def.tool)} className={`${control} ${active ? "bg-brand text-white shadow-sm" : "text-fg hover:bg-surface-muted"}`}>
                <Icon name={def.tool} size={18} />
                <span className="hidden md:inline">{def.tool === "shape" ? "Draw shape" : def.tool === "image" ? "Upload image" : def.tool === "pin" ? "Add pin" : def.tool === "note" ? "Add note" : def.label}</span>
              </button>
            )
          })}
          <Divider />
          <Menu label="More tools" items={[{ heading: "More tools" }, ...toolItems(more)]} className={`${control} ${moreActive ? "bg-brand text-white shadow-sm" : "text-fg hover:bg-surface-muted"}`}>
            <Icon name="more" size={18} />
            <span className="hidden md:inline">{moreActive ? more.find((def) => def.tool === tool)?.label : "More"}</span>
            <Icon name="chevron" size={14} />
          </Menu>
          <span className="ml-auto hidden pl-3 text-xs text-fg-muted xl:block">Click an item on the sheet to edit it</span>
        </div>
        <ToolOptionsRow tool={tool} options={props.options} />
      </div>
    )
  }

  // ---- A pin is selected ----
  if (pin) {
    const statusItems: MenuItem[] = props.pinStatuses.filter(status => status !== "for_review").map((status) => ({ label: statusLabels[status], checked: clientPinStatus(pin.status) === status, onClick: () => props.onSetPinStatus(pin, status) }))
    return (
      <div className="flex min-h-12 flex-wrap items-center gap-x-1 gap-y-1 border-t border-line px-3 py-1.5" role="toolbar" aria-label="Pin controls">
        {toolsMenu}
        <Divider />
        <span className="flex max-w-[16rem] items-center gap-2 px-1 text-sm font-extrabold">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] text-white" style={{ background: statusDot[clientPinStatus(pin.status)] }}>{props.pinNumber ?? ""}</span>
          <span className="truncate">{pin.title}</span>
        </span>
        <Divider />
        {props.pinStatuses.length ? (
          <Menu label="Change the status" items={statusItems} className={`${control} border border-line text-fg hover:bg-surface-muted`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: statusDot[clientPinStatus(pin.status)] }} />
            {statusLabels[clientPinStatus(pin.status)]}
            <Icon name="chevron" size={14} />
          </Menu>
        ) : null}
        {canEdit ? <IconButton icon={pin.locked ? "lock" : "unlock"} label={pin.locked ? "Unlock this pin" : "Lock this pin"} shortcut="Ctrl+L" active={pin.locked} text={pin.locked ? "Locked" : "Lock"} onClick={() => props.onTogglePinLock(pin)} /> : null}
        <button type="button" onClick={props.onOpenPinDetails} className={`${quiet} border border-line`} title="Open the full details of this pin">Details</button>
        {props.onPinQr ? <IconButton icon="qr" label="QR label: print a code that opens this pin" onClick={props.onPinQr} text="QR" /> : null}
        {canEdit ? <><Divider /><IconButton icon="trash" label="Delete this pin" shortcut="Del" danger disabled={pin.locked} onClick={props.onDeletePin} /></> : null}
      </div>
    )
  }

  // ---- One or more drawn items / images are selected ----
  const anyLocked = annotations.some((a) => a.locked)
  const allLocked = annotations.every((a) => a.locked)
  const first = annotations[0]
  const many = annotations.length > 1
  const editable = canEdit && !anyLocked
  const hasColor = annotations.some((a) => a.kind !== "image")
  const hasStroke = annotations.some((a) => strokeKinds.includes(a.kind))
  const allText = annotations.every((a) => a.kind === "text")
  const formattable = canEdit && annotations.every((a) => canFormat(a.kind))
  const grouped = annotations.some((a) => a.group_id)
  const label = many ? `${annotations.length} items selected` : describe(first)
  const moreItems: MenuItem[] = [
    { label: "Copy", hint: "Ctrl C", icon: <Icon name="copy" size={14} />, onClick: actions.copy },
    { label: "Paste", hint: "Ctrl V", icon: <Icon name="paste" size={14} />, disabled: !canEdit || !actions.hasClipboard, onClick: actions.paste },
    { separator: true },
    ...(many ? [{ label: "Group", hint: "Ctrl G", icon: <Icon name="group" size={14} />, disabled: !editable, onClick: actions.group } as MenuItem] : []),
    ...(grouped ? [{ label: "Ungroup", hint: "Ctrl Shift G", disabled: !editable, onClick: actions.ungroup } as MenuItem] : []),
    { label: "Copy style", icon: <Icon name="brush" size={14} />, onClick: actions.copyStyle },
    { label: "Apply copied style", disabled: !editable || !actions.hasStyle, onClick: actions.applyStyle },
  ]

  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-1 gap-y-1 border-t border-line px-3 py-1.5" role="toolbar" aria-label="Selection controls">
      {toolsMenu}
      <Divider />
      {formattable ? null : <><span className="flex max-w-[14rem] items-center gap-2 px-1 text-sm font-extrabold" title={label}><span className="truncate">{label}</span></span><Divider /></>}
      {formattable ? <><TextFormatBar annotations={annotations} disabled={!editable} onStyle={props.onStyle} onFormat={props.onFormat} /><Divider /></> : null}
      <Popover label="Position: order, align and layers" width={340} className={`${control} border border-line text-fg hover:bg-surface-muted`} trigger={<><Icon name="layers" size={18} /><span className="hidden lg:inline">Position</span><Icon name="chevron" size={14} /></>}>
        {() => <PositionPanel annotations={annotations} actions={actions} onStyle={props.onStyle} layerProps={props.layerProps} locked={anyLocked} canEdit={canEdit} />}
      </Popover>
      {canEdit ? <IconButton icon={allLocked ? "lock" : "unlock"} label={allLocked ? "Unlock (items can be moved and edited again)" : "Lock (no moving, resizing or deleting)"} shortcut="Ctrl+L" active={allLocked} text={allLocked ? "Locked" : "Lock"} onClick={() => actions.setLocked(!allLocked)} /> : null}
      {canEdit ? (
        <>
          <Divider />
          {hasColor && !formattable ? (
            <Popover label="Color" width={296} disabled={!editable} className={quiet} trigger={<><span className="h-5 w-5 rounded-full border-2 border-line" style={{ background: annotationColors[annotations.find((a) => a.kind !== "image")?.color ?? "orange"] }} /><span className="hidden xl:inline">Color</span></>}>
              {(close) => <ColorPanel value={annotations.find((a) => a.kind !== "image")?.color ?? "orange"} onPick={(color) => { props.onStyle({ color }, "Change color"); close() }} />}
            </Popover>
          ) : null}
          {hasStroke ? (
            <Popover label="Line thickness" width={240} disabled={!editable} className={quiet} trigger={<><Icon name="stroke" size={18} /><span className="hidden xl:inline">Thickness</span></>}>
              {() => <StrokePanel value={annotations.find((a) => a.stroke !== null)?.stroke ?? 0.2} onCommit={(stroke) => props.onStyle({ stroke }, "Change thickness")} />}
            </Popover>
          ) : null}
          {allText && !formattable ? (
            <span className="flex items-center rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Text size">
              {textSizes.map((size) => (
                <button key={size.label} type="button" role="radio" aria-checked={(first.font_size ?? 1.6) === size.value} disabled={!editable} title={`Text size ${size.label}`} onClick={() => props.onStyle({ font_size: size.value }, "Change text size")} className={`h-8 min-w-8 rounded-md px-1.5 text-xs font-bold transition disabled:opacity-40 ${(first.font_size ?? 1.6) === size.value ? "bg-brand text-white" : "text-fg hover:bg-surface-muted"}`}>{size.label}</button>
              ))}
            </span>
          ) : null}
          <Popover label="Transparency" width={280} disabled={!editable} className={quiet} trigger={<><Icon name="opacity" size={18} /><span className="hidden xl:inline">{Math.round((first.opacity ?? 1) * 100)}%</span></>}>
            {() => <OpacityPanel value={first.opacity ?? 1} onCommit={(opacity) => props.onStyle({ opacity }, "Change opacity")} />}
          </Popover>
          <Divider />
          <IconButton icon="copy" label="Duplicate" shortcut="Ctrl+D" onClick={actions.duplicate} />
          <IconButton icon="trash" label={anyLocked ? "Unlock before deleting" : "Delete"} shortcut="Del" danger disabled={anyLocked} onClick={actions.remove} />
        </>
      ) : null}
      <Menu label="More actions" items={moreItems} align="end" className={quiet}>
        <Icon name="more" size={18} />
      </Menu>
      {anyLocked ? <span className="ml-1 hidden flex-none items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-fg-muted xl:flex"><Icon name="lock" size={12} />Locked: unlock to edit</span> : null}
    </div>
  )
}

import Modal from "../Modal"

const sections: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: "Tools",
    rows: [["Select / move", "V"], ["Pin", "P"], ["Stamp status", "K"], ["Pen", "D"], ["Highlighter", "H"], ["Shape", "S"], ["Arrow", "R"], ["Revision cloud", "C"], ["Text box", "T"], ["Note", "N"], ["Symbol", "Y"], ["Dimension line", "E"], ["Polyline", "L"], ["Area", "A"], ["Measuring tape", "M"]],
  },
  {
    title: "Selecting",
    rows: [["Select several", "Shift + click"], ["Box select", "Shift + drag"], ["Select everything", "Ctrl A"], ["Deselect", "Esc"], ["Nudge", "Arrow keys"], ["Nudge farther", "Shift + arrows"]],
  },
  {
    title: "Editing",
    rows: [["Undo", "Ctrl Z"], ["Redo", "Ctrl Shift Z"], ["Copy / Cut / Paste", "Ctrl C / X / V"], ["Duplicate", "Ctrl D"], ["Bold / Italic / Underline", "Ctrl B / I / U"], ["Context menu", "Right-click"], ["Copy style / Apply style", "Ctrl Alt C / V"], ["Group / Ungroup", "Ctrl G / Ctrl Shift G"], ["Lock / Unlock", "Ctrl L / Alt Shift L"], ["Delete", "Delete"], ["Bring to front / Send to back", "Ctrl ] / Ctrl ["]],
  },
  {
    title: "View",
    rows: [["Fit the sheet", "0"], ["Focus mode", "F"], ["Presentation", "F5"], ["Command palette", "Ctrl K"], ["This list", "?"], ["Finish a polyline / area / cloud", "Enter"], ["Straight angles while drawing", "Hold Shift"]],
  },
]

export default function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" description="On a Mac use Cmd instead of Ctrl." size="xl" onClose={onClose} footer={<button type="button" onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-hover">Close</button>}>
      <div className="grid gap-6 sm:grid-cols-2">
        {sections.map((section) => (
          <section key={section.title}>
            <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-brand-text">{section.title}</h3>
            <dl className="divide-y divide-line rounded-xl border border-line">
              {section.rows.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                  <dt className="text-fg">{label}</dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {keys.split(" ").map((key, index) => (key === "/" || key === "+" ? <span key={index} className="text-fg-muted">{key}</span> : <kbd key={index} className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-sans text-[11px] font-bold text-fg-muted">{key}</kbd>))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}

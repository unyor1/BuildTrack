import { useState } from "react"
import { buttonSecondary, inputClass } from "./PageParts"
import { allDates, isFiltered, presetOf, presetRange, rangePresetLabels, rangeProblem, type DateRange, type RangePreset } from "../../lib/dateRangeModel"

const select = `${inputClass} mt-1 !py-1.5`
const label = "min-w-0 text-xs font-bold text-fg-muted"

// Calendar filter: quick choices (today, this week, this month...) or "Pick dates..." for any From / To. Same look as the
// photo documentation date filter. The caller owns the range (and usually keeps it in the address).
export default function DateRangeFilter({ label: name, range, presets, today, onChange }: { label: string; range: DateRange; presets: RangePreset[]; today: string; onChange: (range: DateRange) => void }) {
  const [picking, setPicking] = useState(false)
  const preset = presetOf(range, presets, today)
  const problem = rangeProblem(range)
  const pick = (value: RangePreset | "custom") => {
    if (value === "custom") return setPicking(true)
    setPicking(false)
    onChange(presetRange(value, today))
  }
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label={`${name} date filter`}>
      <label className={`${label} w-full sm:w-48`}>{name}
        <select className={select} value={picking ? "custom" : preset} onChange={(event) => pick(event.target.value as RangePreset | "custom")}>
          {presets.map((key) => <option key={key} value={key}>{rangePresetLabels[key]}</option>)}
          <option value="custom">Pick dates…</option>
        </select>
      </label>
      {picking || preset === "custom" ? (
        <>
          <label className={label}>From<input type="date" value={range.from} max={range.to || undefined} aria-invalid={Boolean(problem)} onChange={(event) => onChange({ ...range, from: event.target.value })} className={`${select} !w-auto`} /></label>
          <label className={label}>To<input type="date" value={range.to} min={range.from || undefined} aria-invalid={Boolean(problem)} onChange={(event) => onChange({ ...range, to: event.target.value })} className={`${select} !w-auto`} /></label>
        </>
      ) : null}
      {isFiltered(range) ? <button type="button" className={`${buttonSecondary} !min-h-9 !py-1.5`} onClick={() => { setPicking(false); onChange(allDates) }}>Clear dates</button> : null}
      {problem ? <p role="alert" className="w-full text-xs font-semibold text-danger-fg">{problem}</p> : null}
    </div>
  )
}

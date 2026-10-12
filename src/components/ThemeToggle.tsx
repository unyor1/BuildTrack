import { useTheme, type ThemeMode } from "../lib/theme"

const options: Array<{ mode: ThemeMode; label: string; icon: string }> = [
  { mode: "light", label: "Light", icon: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" },
  { mode: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" },
  { mode: "system", label: "Auto", icon: "M4 5h16v11H4zM8 20h8m-4-4v4" },
]

// Segmented Light / Dark / Auto switch. Sits on the dark sidebars, so it uses fixed light-on-dark styling.
export default function ThemeToggle() {
  const { mode, setMode } = useTheme()
  return (
    <div role="radiogroup" aria-label="Color theme" className="mb-3 flex gap-1 rounded-lg bg-white/10 p-1">
      {options.map((option) => {
        const active = mode === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${option.label} theme`}
            onClick={() => setMode(option.mode)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
              active ? "bg-[#f18b00] text-black" : "text-white/75 hover:bg-white/10 hover:text-white"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={option.icon} />
            </svg>
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

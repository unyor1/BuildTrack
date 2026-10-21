import { useEffect, useState } from "react"

import type { Page } from "../../App"

import Header from "../../components/Header"

import AttendanceBoard from "../../components/attendance/AttendanceBoard"

import { getSelectedProjectId, useProject } from "../../lib/projects"

export default function BiometricAttendancePage({
  navigate,
}: {
  navigate: (page: Page) => void
}) {
  // The Foreman's launch link carries the selected project; never fall back to another project.

  const projectId = getSelectedProjectId()

  const { project, loading } = useProject(projectId)

  const selectedProject = project?.id === projectId ? project : null

  const [fullscreenError, setFullscreenError] = useState("")

  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const syncFullscreen = () =>
      setFullscreen(Boolean(document.fullscreenElement))

    syncFullscreen()

    document.addEventListener("fullscreenchange", syncFullscreen)

    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen)
  }, [])

  const toggleFullscreen = async () => {
    setFullscreenError("")

    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen()
      else throw new Error("Unsupported")
    } catch {
      setFullscreenError(
        "Fullscreen is unavailable in this browser. You can use the browser’s fullscreen control.",
      )
    }
  }

  const fullscreenLabel = fullscreen ? "Exit fullscreen" : "Enter fullscreen"

  return (
    <div className="min-h-screen bg-surface-muted text-fg">
      <Header navigate={navigate} brandingOnly />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8 lg:py-10">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0" aria-label="Selected attendance project">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-fg-muted">
              Selected project
            </p>
            <p className="mb-1 break-words text-xl font-extrabold text-brand">
              {selectedProject?.name ?? (loading ? "Loading project…" : "No project selected")}
            </p>
            {selectedProject && <p className="mb-0 text-xs font-semibold text-fg-muted">{selectedProject.code}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface text-fg transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              aria-label={fullscreenLabel}
              title={fullscreenLabel}
              aria-pressed={fullscreen}
              onClick={() => void toggleFullscreen()}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path
                  d={
                    fullscreen
                      ? "M8 3v5H3m18 0h-5V3M3 16h5v5m8 0v-5h5"
                      : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"
                  }
                />
              </svg>
            </button>
            {fullscreenError && (
              <p
                className="mb-0 max-w-xs text-right text-xs text-fg-muted"
                role="status"
              >
                {fullscreenError}
              </p>
            )}
          </div>
        </div>
        {loading ? (
          <p role="status">Loading attendance project…</p>
        ) : selectedProject ? (
          <AttendanceBoard
            key={selectedProject.id}
            projectId={selectedProject.id}
            projectName={`${selectedProject.code} · ${selectedProject.name}`}
            displayOnly
          />
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center">
            <h1 className="text-xl font-bold">
              No selected attendance project
            </h1>
            <p className="mb-0 text-sm text-fg-muted">
              Open this screen from the selected project in the Foreman
              workspace. The project must be assigned to your account.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

import { useState } from "react"
import AdminProjectSelect, {
  useAdminProject,
} from "../../components/AdminProjectSelect"
import WorkerManagement from "../../components/attendance/WorkerManagement"
import DeviceManagement from "../../components/attendance/DeviceManagement"
import AttendanceSchedule from "../../components/attendance/AttendanceSchedule"
import BiometricAdminGuard from "../../components/attendance/BiometricAdminGuard"
import { PageIntro } from "./AdminShell"
import type { AdminPageProps } from "./types"

export default function BiometricsRegistration(_: AdminPageProps) {
  return (
    <BiometricAdminGuard>
      <AdminRegistration />
    </BiometricAdminGuard>
  )
}

function AdminRegistration() {
  const { projects, project, projectId, error, choose } = useAdminProject()
  const [tab, setTab] = useState<"register" | "profiles" | "devices" | "schedule">(
    "register",
  )
  return (
    <div className="admin-page">
      <PageIntro
        eyebrow="Biometric attendance / Worker identity"
        title="Worker biometric registration"
        description="Admin only: register workers, capture their portraits and enroll fingerprints through the connected ESP32 / AS608 sensor. Foremen can view attendance only."
      />
      <AdminProjectSelect
        projects={projects}
        value={projectId}
        onChange={choose}
      />
      {error && <p role="alert">{error}</p>}
      {project && projectId ? (
        <div className="space-y-6" key={projectId}>
          <div
            role="tablist"
            aria-label="Worker registration tabs"
            className="flex flex-wrap gap-2 border-b border-border pb-3"
          >
            {([
              ["register", "Register worker"],
              ["profiles", "Worker profiles"],
              ["devices", "Devices"],
              ["schedule", "Attendance schedule"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`biometric-tab-${key}`}
                aria-selected={tab === key}
                aria-controls="biometric-tab-panel"
                className={`min-h-11 rounded-xl px-5 text-sm font-bold ${
                  tab === key
                    ? "bg-brand text-white"
                    : "border border-border bg-surface"
                }`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id="biometric-tab-panel"
            role="tabpanel"
            aria-labelledby={`biometric-tab-${tab}`}
          >
            {tab === "devices" ? (
              <DeviceManagement projectId={projectId} />
            ) : tab === "schedule" ? (
              <AttendanceSchedule projectId={projectId} />
            ) : (
              <WorkerManagement
                projectId={projectId}
                view={tab}
                onRegister={() => setTab("register")}
              />
            )}
          </div>
          <details
            aria-labelledby="worker-registration-steps"
            className="rounded-xl border border-border bg-surface p-5"
          >
            <summary
              id="worker-registration-steps"
              className="mb-2 text-base font-bold"
            >
              Admin registration process
            </summary>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-muted">
              <li>
                Add the worker’s name, worker code and trade to the selected
                project, then use Open camera to capture their profile photo.
              </li>
              <li>
                Save the worker’s details, then click Register fingerprint and
                select the project device. The enrollment ID is assigned
                automatically.
              </li>
              <li>
                Have the worker place, lift and scan the same finger again on
                the AS608, then once more to confirm. Wait for Fingerprint
                registered and confirmed; saving the form alone does not enroll
                a fingerprint.
              </li>
              <li>
                Set the project's time in, time out, grace period and repeat-scan
                window in the Attendance schedule tab.
              </li>
              <li>
                Register the project’s ESP32 in the Devices tab, configure it
                with the updated enrollment firmware, then test a scan and check
                the worker’s name and photo on the attendance screen.
              </li>
            </ol>
            <p className="mt-3 text-xs text-fg-muted">
              Worker accounts are not required. Fingerprint capture happens on
              the physical device; fingerprint templates remain on the sensor.
              Enrollment setup: hardware/esp32-as608/README.md.
            </p>
          </details>
        </div>
      ) : (
        <p className="p-6 text-sm text-fg-muted">
          Select an accessible project to register or manage its workers.
        </p>
      )}
      <div className="mt-5 rounded-xl border border-border bg-surface p-5 text-sm text-fg-muted">
        Device integration required: the scanner sends each matched scan to the
        database, which decides Time IN or Time OUT and ignores repeat scans. No
        raw fingerprint images or biometric templates are stored by this page.
      </div>
    </div>
  )
}

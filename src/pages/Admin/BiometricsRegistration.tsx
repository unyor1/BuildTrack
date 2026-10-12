import { useState } from "react"
import {
  AdminButton,
  AdminSelect,
  PageIntro,
  Panel,
  StatusBadge,
} from "./AdminShell"
import AdminIcon from "./AdminIcon"
import type { AdminPageProps } from "./types"

const steps = [
  "Select User",
  "Register Fingerprint",
  "Verify Fingerprint",
  "Save Biometric Template",
  "Ready for Clock-in",
]

export default function BiometricsRegistration({ onNavigate }: AdminPageProps) {
  const [selected, setSelected] = useState("Ramon Santos (Foreman)")
  const [step, setStep] = useState(2)
  const [registered, setRegistered] = useState(true)

  return (
    <div className="admin-page">
      <PageIntro
        eyebrow="Workforce identity • Secure template storage"
        title="Fingerprint Biometrics Registration"
        description="Register an approved workforce member for secure biometric attendance. Raw fingerprint images are never displayed or stored here."
        action={
          <AdminButton
            variant="outline"
            onClick={() => onNavigate("user-management")}
          >
            Back to users
          </AdminButton>
        }
      />
      <Panel className="admin-toolbar-panel biometric-user-picker">
        <strong>Select Approved User:</strong>
        <AdminSelect label="Approved user" value={selected} onChange={setSelected}>
          <option>Ramon Santos (Foreman)</option>
          <option>Eduardo Santos (Foreman)</option>
          <option>Paolo Cruz (Foreman)</option>
        </AdminSelect>
        <StatusBadge tone="success">Approved account</StatusBadge>
      </Panel>
      <Panel title="Enroll for On-Site Workforce Attendance">
        <div className="biometric-steps">
          {steps.map((label, index) => (
            <div
              className={`biometric-step ${
                index + 1 <= step ? "is-complete" : ""
              } ${index + 1 === step ? "is-current" : ""}`}
              key={label}
            >
              <div className="biometric-step__line" />
              <span>
                {index + 1 === 1 ? (
                  <AdminIcon name="users" />
                ) : index + 1 === 2 ? (
                  <AdminIcon name="fingerprint" />
                ) : index + 1 === 3 ? (
                  <AdminIcon name="eye" />
                ) : index + 1 === 4 ? (
                  <AdminIcon name="lock" />
                ) : (
                  <AdminIcon name="check" />
                )}
              </span>
              <strong>Step {index + 1}</strong>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <div className="biometric-step-actions">
          <AdminButton
            variant="outline"
            onClick={() => setStep((current) => Math.max(1, current - 1))}
          >
            Previous step
          </AdminButton>
          <AdminButton
            onClick={() => {
              setStep((current) => Math.min(5, current + 1))
              if (step >= 4) setRegistered(true)
            }}
            icon={step >= 5 ? "check" : "fingerprint"}
          >
            {step >= 5 ? "Registration complete" : "Continue enrollment"}
          </AdminButton>
        </div>
      </Panel>
      <div className="admin-two-column biometric-columns">
        <Panel title="Foreman Attendance Profile">
          <div className="biometric-profile">
            <div className="profile-avatar">RS</div>
            <div>
              <h3>Ramon Santos</h3>
              <p>
                Role: Site Foreman <span>•</span> ID: BT-2026-089
              </p>
            </div>
          </div>
          <div className="profile-facts">
            <div>
              <span>Biometric Status</span>
              <strong className="fact-success">
                <i />
                {registered ? "Registered" : "Not registered"}
              </strong>
            </div>
            <div>
              <span>Project Assignment</span>
              <strong>VCB-024 • Valencia Commercial Building</strong>
            </div>
            <div>
              <span>Last Updated</span>
              <strong>September 30, 2026</strong>
            </div>
          </div>
        </Panel>
        <Panel title="Fingerprint Checklist">
          <div className="fingerprint-list">
            {[
              ["Left Thumb", true],
              ["Right Thumb", true],
              ["Left Index", false],
              ["Right Index", false],
            ].map(([finger, done]) => (
              <div key={finger as string}>
                <span>{finger}</span>
                <strong className={done ? "fact-success" : "fact-muted"}>
                  <AdminIcon name={done ? "check" : "close"} />
                  {done ? "Enrolled" : "Not Enrolled"}
                </strong>
              </div>
            ))}
          </div>
          <AdminButton
            className="admin-button--full"
            icon="fingerprint"
            onClick={() => {
              setRegistered(true)
              setStep(5)
            }}
          >
            Register biometrics
          </AdminButton>
        </Panel>
      </div>
    </div>
  )
}

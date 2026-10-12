import {
  AdminButton,
  AdminSelect,
  Panel,
  StatusBadge,
} from "../Admin/AdminShell"
import type { ForemanPageProps } from "./types"

const workers = [
  ["Juan Dela Cruz", "7:02 AM", "—", "Present On Site"],
  ["Pedro Santos", "6:55 AM", "—", "Present On Site"],
  ["Mark Santos", "—", "—", "Absent"],
  ["Luis Mendoza", "6:48 AM", "—", "Present On Site"],
  ["Ana Lopez", "7:18 AM", "—", "Present On Site • Late"],
  ["Carlo Reyes", "6:58 AM", "4:35 PM", "Clocked Out"],
  ["Miguel Reyes", "6:50 AM", "—", "Present On Site"],
  ["Pedro Ramos", "6:55 AM", "—", "Present On Site"],
]

export default function ForemanBiometricAttendance({
  onNavigate,
}: ForemanPageProps) {
  return (
    <div className="foreman-page">
      <div className="foreman-page-meta">
        <span>Foreman / Biometric attendance</span>
        <span>VCB-024 • Active Construction</span>
      </div>
      <div className="foreman-intro">
        <div>
          <h1>Biometric attendance</h1>
          <p>
            Biometric attendance feeds Workforce Management. Select currently
            present workers for recorded work; workers have no website accounts.
          </p>
        </div>
        <AdminButton variant="outline" icon="download">
          Export attendance PDF
        </AdminButton>
      </div>
      <div className="foreman-metric-grid foreman-metric-grid--four">
        <article>
          <span>Expected site workforce</span>
          <strong>32</strong>
          <small>Expected biometric-enrolled workers</small>
        </article>
        <article>
          <span>Clocked In today</span>
          <strong>21</strong>
          <small>First scan at 6:48 AM</small>
        </article>
        <article>
          <span>No Clock-in</span>
          <strong>11</strong>
          <small>Review absence exceptions</small>
        </article>
        <article>
          <span>Clocked Out</span>
          <strong>3</strong>
          <small>18 currently present</small>
        </article>
      </div>
      <Panel
        title={
          <>
            <span>Attendance records</span>
            <AdminButton variant="outline">Date: 06 Oct 2026</AdminButton>
          </>
        }
      >
        <p className="panel-subtitle">
          06 Oct 2026 • Valencia Commercial Building • 8 of 32 records shown
        </p>
        <div className="foreman-filter-grid">
          <label>
            Find worker
            <input placeholder="Search name or worker ID..." />
          </label>
          <label>
            Project
            <AdminSelect>
              <option>Valencia Commercial Building</option>
            </AdminSelect>
          </label>
          <label>
            Attendance status
            <AdminSelect>
              <option>All statuses</option>
              <option>Present On Site</option>
              <option>Absent</option>
            </AdminSelect>
          </label>
        </div>
        <div className="foreman-wide-table">
          <div className="foreman-table-head">
            <span>Worker</span>
            <span>Project</span>
            <span>Date</span>
            <span>Clock-in</span>
            <span>Clock-out</span>
            <span>Attendance Status</span>
          </div>
          {workers.map(([name, clockIn, clockOut, status]) => (
            <div className="foreman-table-row" key={name}>
              <span>{name}</span>
              <span>Valencia Commercial Building</span>
              <span>06 Oct 2026</span>
              <span>{clockIn}</span>
              <span>{clockOut}</span>
              <StatusBadge
                tone={
                  status === "Absent"
                    ? "danger"
                    : status.includes("Late")
                      ? "warning"
                      : status === "Clocked Out"
                        ? "info"
                        : "success"
                }
              >
                {status}
              </StatusBadge>
            </div>
          ))}
        </div>
        <div className="table-footer">
          Showing 1-8 of 32 workers{" "}
          <span>← Previous &nbsp; 1 &nbsp; 2 &nbsp; 3 &nbsp; Next →</span>
        </div>
      </Panel>
      <div className="foreman-alert foreman-alert--warning">
        <strong>ⓘ Attendance exceptions need review</strong>
        <span>
          32 expected: 21 attended, 18 present, 3 clocked out, 11 absent. Only
          clocked-in workers are selectable for work records.
        </span>
      </div>
    </div>
  )
}

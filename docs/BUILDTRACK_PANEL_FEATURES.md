# BuildTrack: Features worth adding (for the panel)

Notes from 2026-10-12. What to show, what to add, and what to leave as future work. Related: `BUILDTRACK_INTEGRITY_NOTES.md` (loopholes and anti-fraud features).

Status words: **Built** = works today. **To add** = not built yet.

**Update 2026-10-13: all five items in section 2 are built; also built from the follow-up list: weekly progress report, late-work alerts, photo time / place stamp, project search in Ctrl+K, defect trends. Not built: quantities on pins (needs partial progress per pin to be useful), client weekly email digest (needs the email secrets and cron).** (migrations 0033-0037, see `docs/audits/2026-10-13-panel-features.md`).

---

## 1. Already built: make these the stars of the demo

| Feature | How to show it |
|---|---|
| Pin to verify to client view | Foreman reports a pin on the phone, engineer verifies on the laptop, client percentage changes. One story, about 60 seconds. |
| Failed inspection creates an NCR | Fail a hold-point item; the NCR appears with a due date, assigned to the foreman. "The system enforces the rule." |
| Offline mode | Airplane mode on the phone, submit a daily report, airplane mode off, it syncs. |
| QR label on a pin | Print a pin QR, scan it, it opens that spot on the plan. |
| Four role workspaces | Log in as admin, engineer, foreman, client: four different workspaces, each with only its data. |
| Privacy built in | Consent records, ID verification, "Delete my data" (RA 10173). |

---

## 2. Worth adding before the presentation (high impact, low risk)

| Priority | Feature | Why it impresses | Where it would go | Effort |
|---|---|---|---|---|
| 1 | **Evidence lock** | Photos cannot be deleted after a pin is submitted or verified; removals are logged. Answers "can't they just erase it?" and backs the integrity story. | New migration: trigger on `pin_photos` delete + logged "withdrawn" state; SQL tests. | about 2 h |
| 2 | **Live updates** | Two screens side by side: the engineer verifies, the foreman's phone updates with no refresh. | Supabase Realtime on `pins`, `pin_events`, `qa_defects`, `notifications`; reload hooks in `lib/projectWork.ts`, `lib/qa.ts`, `lib/notifications.ts`. | a few h |
| 3 | **S-curve (planned vs verified progress)** | The classic construction progress chart; engineers on the panel recognise it at once. | Engineer Progress + Client Overview; data from `pins.verified_at`, project start / end dates (`lib/progress.ts`). | a few h |
| 4 | **Before / after photo slider** | Drag to compare the site before and after a fix. Very visual. | Pin details (`components/editor/PinParts.tsx`) and NCR detail (`components/qa/DefectDetail.tsx`). | about 2 h |
| 5 | **Load test numbers** | Answers "can it scale?" with a measured result instead of a guess. | Seed a large project (for example 50 sheets, 5,000 pins, 1,000 inspections) in the PGlite test harness or a test project; measure load times. Also fix the silent list limits (300 inspections, 500 NCRs, 120 daily reports, 1,000-row default) with paging. | about 2 h |

---

## 3. Bigger: strong if there is more time

| Feature | Why | Effort |
|---|---|---|
| **Live photo capture with GPS and time** limited to the project site (geofence) | Strongest anti-fraud feature; ties to the flood-control / ghost-project angle. See F1 and F2 in the integrity notes. | about 1 day |
| **Public transparency page** per project (location, budget, verified progress, photos), opened from a QR code on the site signboard | Strong public-works pitch; reuses the client portal. | about 1 day |

---

## 4. Future work: mention, do not build tonight

- AI: photo defect detection, auto-summarised daily reports (pitch with a plan; half-working AI hurts a demo).
- Biometric attendance (screens exist as sample data only).
- Scheduling (Gantt, dependencies), cost (bill of quantities, change orders, progress billing), RFIs / submittals, subcontractor companies, materials and equipment, safety (incidents, permits).
- BIM / 3D models.
- Drone or satellite imagery comparison.

---

## 5. Things that hurt with panels

- Demoing sample-data screens (Admin Biometrics, Foreman Attendance) as if they were real.
- Claiming features that are not built.
- A long feature tour with no story. Use one scenario all the way: a column fails inspection, the NCR goes to the foreman, the fix is photographed, the engineer verifies, the client sees the progress move.

---

## 6. Recommendation

Tonight: **evidence lock, then live updates, then the S-curve**. Integrity, a wow moment and a chart engineers recognise, all low risk.

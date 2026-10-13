# BuildTrack: Integrity loopholes, features and solutions

Notes from 2026-10-12. Question behind them: could BuildTrack help public works (for example flood control) avoid "ghost projects", meaning work that is paid for but never built, or built below spec?

Short answer: the principle fits ("only verified, evidenced work counts"), but today the system trusts the people who enter the data. This file lists what already helps, every loophole found, and what would close each one. Nothing here is built yet unless it says so.

---

## 1. What already supports integrity (built)

| Control | Where |
|---|---|
| Reported vs verified progress: the foreman reports, only the engineer verifies, and only verified work counts in progress numbers | `pins` status flow, `EngineerProgressVerification`, `lib/progress.ts` |
| Evidence tied to a spot on a specific plan revision | `pins` (x/y on a sheet), `pin_photos`, `blueprint_revisions` (immutable) |
| Server-side timestamps: upload and event times come from the database, not the phone | `created_at default now()` on `pin_photos`, `pin_events`, QA tables |
| Timeline of every pin change, written by the database | `pin_events` |
| QA that cannot be fudged: out-of-tolerance measurements fail by themselves, hold points and critical items fail the inspection, every failed item becomes an NCR with a due date, only the engineer closes, major/critical NCRs need a photo of the fix | QA module (0025, 0026), `lib/qaModel.ts` |
| Inspection checklists are copied and score / pass mark are snapshotted, so later edits never change a finished inspection | `qa_inspection_items`, `complete_inspection` |
| Audit log of admin, status and role actions | `audit_log`, `get_audit_log()` |
| Role separation: tables are read-only to the API and every write goes through checked functions; clients cannot see internal QA | RLS + RPCs |
| Owner view of honest progress | Client portal |

---

## 2. Loopholes

Severity: **High** = a ghost project or fake completion could pass; **Medium** = makes faking easier or hides it; **Low** = weakens the audit.

| # | Loophole | Severity | Current behaviour (checked in code) |
|---|---|---|---|
| L1 | **Collusion**: the contractor's foreman and the verifying engineer agree to fake progress | High | The system records whatever both confirm. No independent check exists. |
| L2 | **Photos are not proven to be live or on site** (MITIGATED 2026-10-13, 0039: time / GPS stamp checked against the site, flagged, never blocked; still fakeable by a determined person) | High | Pickers use `capture="environment"`, which is only a hint: a gallery photo, an old photo or one from another site can be uploaded. No GPS or device-time is recorded. |
| L3 | **Evidence can be deleted after verification** (FIXED 2026-10-13, 0033) | High | `pin_photos` delete policy: the uploader (any time) or an admin with `blueprints.manage`. Deletion is not logged and is not blocked after the pin is verified. |
| L4 | **The contractor controls the system** | High | BuildTrack is run by the construction company; its Super Admin can manage users and data. For public works the owner (government) or an independent body should host it. |
| L5 | **Progress is not tied to payment** | High | There is no billing or disbursement link, so money can be released whatever BuildTrack says. |
| L6 | **One verifier is enough** | Medium | A single engineer's verification makes work "done". No second sign-off for high-value items. |
| L7 | **Quantities are not checked against the contract** | Medium | Pins say "done", not "how much" (meters, cubic meters). Under-delivery in volume is invisible. |
| L8 | **No outside cross-check** | Medium | Nothing compares the claimed progress with imagery or data the contractor does not control. |
| L9 | **No public visibility** | Medium | Only invited project members see anything; citizens and auditors cannot. |
| L10 | **Records are not tamper-evident** | Low | The audit trail lives in the same database the admin controls; a database-level change would leave no trace. |
| L11 | **Account sharing** | Low | Someone could sign in as the engineer to verify. MFA is enforced for admins only. |

---

## 3. Features and solutions

Effort: S = about a day, M = a few days, L = a week or more.

| # | Feature | Closes | How it would fit BuildTrack | Effort |
|---|---|---|---|---|
| F1 | **Live capture only, stamped with GPS and time** (stamp BUILT in 0039; live-camera-only capture is not) | L2 | In-app camera (`getUserMedia`) instead of a file picker for evidence; record GPS (`navigator.geolocation`), accuracy and device time; the database stores them and the server time; flag a large gap between device and server time. | M |
| F2 | **Geofence the project site** (BUILT as a flag, 0039) | L2 | Store the site boundary on `projects`; evidence taken outside it is rejected or flagged "off-site". | S (after F1) |
| F3 | **Evidence can never be deleted once used** (BUILT, 0033) | L3 | Change the `pin_photos` policy: no delete after the pin is ready for review / verified (trigger, like the lock rules); "remove" becomes a logged "withdrawn" status, never a real delete; log every removal. | S |
| F4 | **Fingerprint (hash) of every photo and record** | L10, L3 | Compute SHA-256 of each file on upload and store it; chain record hashes (each row includes the previous hash) so any later change is detectable; export the chain for auditors. | M |
| F5 | **Independent inspector role** | L1, L6 | New role (third party or auditor, not employed by the contractor); high-value or milestone items need their sign-off in addition to the engineer's. | M |
| F6 | **Two-person verification for milestones** | L6 | Items above a value or marked "milestone" need two different verifiers; the database refuses the same person twice. | S |
| F7 | **Bill of quantities** | L7 | Pins carry planned and verified quantities (unit, amount); progress is computed by quantity and value, not only by count. | M |
| F8 | **Payment milestones gated by verification** | L5 | Milestones link to pins; a milestone is "payable" only when its pins are verified with evidence (F1, F3); the payable report is what finance uses. | M |
| F9 | **Public transparency portal** | L9 | Read-only public page per project: location, budget, schedule, verified progress with stamped photos; citizens can submit a report (reuse the client "Report a problem" flow). | M |
| F10 | **Owner-hosted deployment** | L4 | For public works the agency runs its own instance (own Supabase project); the contractor gets foreman / engineer accounts only, never admin. Already possible with the current setup; it is a policy and deployment step. | S |
| F11 | **Outside imagery cross-check** | L8 | Attach dated drone or satellite images to a project and compare them with claimed progress at each milestone. Start as a manual upload and review; automation later. | L |
| F12 | **MFA for engineers and inspectors** | L11 | Extend the existing TOTP enforcement to everyone who can verify. | S |
| F13 | **Anomaly flags** | L1 | Simple rules: many verifications in minutes, verification without new evidence, evidence uploaded after verification, the same photo hash on two pins. Shown to admins and auditors. | M |
| F14 | **Auditor export** | L10 | One package per project: records, hash chain, photos with their metadata. It extends the existing project backup. | S |

---

## 4. Suggested order

1. **Quick wins** (strengthen the current product): F3 lock evidence, F12 MFA for verifiers, F6 two-person milestones.
2. **Evidence you can trust:** F1 live capture with GPS, then F2 geofence, then F4 hashes.
3. **Accountability:** F5 independent inspector, F7 quantities, F8 payment milestones, F13 anomaly flags.
4. **Public works pilot:** F10 owner-hosted, F9 public portal, F14 auditor export, F11 imagery.

---

## 5. What software cannot fix

- Collusion between everyone who signs off (contractor, engineer, inspector, approver) can still defeat any system. F5, F9 and F11 raise the cost of faking and leave evidence behind, but they do not make it impossible.
- GPS and photos can be spoofed by a determined person with tools. Hashes, geofencing and anomaly flags make spoofing detectable later, not impossible.
- The system only helps if payment, audit and enforcement actually use it.

---

## 6. How to say it in the defense

> "BuildTrack is built on one principle: only verified, evidenced work counts. That same principle applies to public infrastructure, where projects have been paid for without proof of completion. Today the system trusts its users, and we have listed those loopholes. With location-stamped live evidence, evidence that cannot be deleted, an independent inspector and payments tied to verified milestones, it could make ghost projects much harder to fake and much easier to audit. That is our recommended future work."

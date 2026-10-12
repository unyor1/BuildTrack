# BuildTrack: Basis and Defense of the Quality Assurance Logging

Working title: **Development of BuildTrack: An Integrated 2D-Mapping Platform for Site Progress, Quality Assurance Logging and Biometric Workforce Management**

Purpose of this document: to settle *what our quality assurance (QA) is based on*, how the system calculates it, and how to defend it against the camera-scanning suggestion from the consultation. Please verify the standard names and editions listed here with your adviser before citing them in the paper.

---

## 1. The short answer

> BuildTrack does not decide quality by itself. It **records inspections** made by a qualified person, **ties each record to a mapped location** on the project's blueprint, **scores it against requirements taken from the project's own approved documents and recognised standards**, and **keeps an audit trail** of who checked what, when, and with what evidence.

The basis of our QA is therefore **conformance to documented requirements**. This is the same meaning of quality that construction QA uses in practice: the work either meets the specified requirement or it does not.

## 2. Why the checklist approach is the correct reading of our title

| Word in the title | What BuildTrack does about it |
|---|---|
| **2D-Mapping Platform** | Every record is attached to a position on an uploaded 2D plan (pins, drawings, measurements, layers). |
| **Site Progress** | Pin status (not started, in progress, for review, issue, verified) and the verified-progress percentage. |
| **Quality Assurance Logging** | Inspection checklists are completed per pin, evidence is attached, and every result is logged with an author and a timestamp. |
| **Biometric Workforce Management** | Attendance by biometric registration, linked to the same projects. |
| **Integrated** | One project, one plan, one record: progress, quality and workforce data share the same locations and users. |

The key word is **logging**. Logging means recording and keeping traceable evidence. It does not mean automatically judging quality from images. A system that records inspections in a structured, searchable and auditable way is already the contribution.

## 3. What the QA is based on (the three layers)

Quality needs a reference to be measured against. We use three, in this order of priority.

### Layer 1: The project's own approved documents (primary basis)
These are the "available data from the engineers" mentioned in the consultation.
- Approved drawings and revisions (already stored in BuildTrack as immutable revisions).
- Project specifications and the bill of quantities.
- Approved material submittals and method statements.

Each checklist item is written from one of these, for example "Column C4 main bars: 8 pieces, 20 mm diameter, per drawing S-102 Rev 2". The inspector compares the real work with the documented value. Because drawings are versioned, the item points to the revision that was in force.

### Layer 2: Recognised codes and standards (justification)
Each item carries a **reference** to the requirement it comes from. Candidates for a Philippine project (confirm the current edition of each):
- **National Structural Code of the Philippines (NSCP)**: structural requirements such as concrete cover, rebar spacing and splice lengths.
- **National Building Code of the Philippines (PD 1096)** and its implementing rules: general building requirements.
- **DPWH Standard Specifications** (the "Blue Book"): materials and workmanship for construction items.
- **DOLE Occupational Safety and Health Standards** and the OSH law (RA 11058): site safety items, if safety checks are included.

Choose **two or three** that truly apply to the sample project and cite them consistently. Citing ten shallowly is weaker than citing three properly.

### Layer 3: Accepted QA practice (methodology)
- The **Inspection and Test Plan (ITP)** with *hold points* and *witness points*: a standard construction QA tool that lists what must be inspected, against what criterion, and who signs off. Our checklist templates are a digital ITP.
- **ISO 9001** principles (control of outputs, nonconformity and corrective action, documented information) as the general quality-management framework. We do not claim certification, only that the process follows the same logic: inspect, record, handle nonconformity, verify the correction.

## 4. The inspection workflow

1. **Template**: the engineer (or admin) prepares a checklist template for a work type (for example "Column rebar before pour"). Each item has: description, acceptance criterion, reference (drawing/spec/code clause), criticality, and whether a photo is mandatory.
2. **Pin**: a pin placed on the plan marks where the work is. The checklist is attached to that pin.
3. **Inspection**: the inspector goes to the location and marks each item **Pass / Fail / Not applicable**. A photo is required for every failure and for items marked as photo-mandatory. Optional measured values can be entered (for example "cover measured: 38 mm, required: 40 mm").
4. **Result**: the system calculates the inspection result (section 5).
5. **Nonconformity**: any failed item opens a corrective action with a responsible person (the foreman) and a deadline.
6. **Re-inspection**: the foreman reports the correction; the inspector re-inspects only the failed items. The pin cannot be marked *verified* until the failed critical items pass.
7. **Record**: everything stays in the history: original result, photos, corrections, re-inspection, who and when. Nothing is overwritten.

## 5. How the QA score is calculated

The formula is deliberately simple so it can be explained, defended and tested.

**Item criticality and weight**

| Class | Meaning | Weight |
|---|---|---|
| Critical | Structural integrity or life safety. A fail cannot be accepted. | 5 |
| Major | Affects function, durability or a specified requirement. | 3 |
| Minor | Finish, tolerance or housekeeping. | 1 |

**Compliance percentage of one inspection**

```
Compliance % = (sum of weights of PASSED items) / (sum of weights of APPLICABLE items) x 100
```
Items marked "Not applicable" are removed from both sides.

**Decision rules**

| Result | Condition |
|---|---|
| **Accepted** | Compliance >= the project threshold (suggested 90 %) **and** no failed critical item. |
| **Accepted with remarks** | Threshold met, no critical failure, but minor or major items failed and have open corrective actions. |
| **Rejected** | Any failed critical item, **or** compliance below the threshold. Re-inspection is required. |

The "no failed critical item" rule matters: a high percentage can never hide a structural or safety failure.

**Roll-ups** (all computed from the same records)
- per pin, per floor or zone, per discipline (civil/structural, architectural, MEP), per project;
- first-time pass rate (inspections accepted on the first try);
- open nonconformities and average days to close them;
- trend over time.

Worked example: an inspection has 1 critical item (pass), 2 major items (1 pass, 1 fail) and 3 minor items (all pass). Passed weight = 5 + 3 + 3 = 11. Applicable weight = 5 + 6 + 3 = 14. Compliance = 78.6 %, below 90 % so the result is **Rejected** even though the critical item passed.

## 6. Position on the camera-scanning suggestion

Our professor's idea is a valid direction: use a camera and let the system judge quality from the scanned area and the engineers' data. We respond in three parts.

**What we implement now (inside scope)**
- **Camera as evidence capture**: the inspector photographs each checked item from the device camera; the photo is timestamped and linked to the pin and checklist item (this already exists for pin photos).
- **Location proof**: scanning a **QR code** posted at the inspection point opens the correct pin and checklist, showing the inspector was physically there.
- **Assistive comparison (clearly labelled prototype)**: for example flag a missing photo, or show the previous photo of the same location beside the new one. The inspector's decision stays the official result.

**Why we do not claim fully automatic scoring**
- Reliable image-based verification (checking rebar spacing, cover, alignment, finish quality) needs trained computer-vision models, calibrated cameras or 3D scanning, and labelled ground-truth data. That is a separate research problem.
- A system that scores quality automatically must be *validated*. Without validation, an automatic "pass" is an unsupported claim and a liability on a real construction site.
- Regulation and contracts require a **responsible, licensed person** to accept work. Software can support that decision, not replace it.

**Future work (stated honestly in the paper)**
- Computer-vision assistance (for example detecting missing rebar ties or comparing as-built photos with the reference).
- Photogrammetry or LiDAR as-built scans compared to the plan.
- Automatic pre-filling of checklist items from images, always confirmed by the inspector.

A sentence suitable for the paper: *"BuildTrack records and evaluates quality through structured, evidence-backed inspections tied to mapped locations. Camera-based automatic verification is identified as future work, while the current system provides the camera-based evidence capture and location verification that such automation would require."*

## 7. Defending the title: likely questions and answers

**Q: Where is the "quality assurance" if the system does not judge by itself?**
A: Quality assurance is the *process* that makes sure work meets requirements: planned checks, recorded results, nonconformity handling and verification of corrections. BuildTrack implements that process digitally. Judgement against the requirement is made by the inspector and calculated consistently by the system.

**Q: What is your basis for the QA result?**
A: Documented conformance. Items come from the approved drawings and specifications, each with a code or specification reference, and results use a fixed, published weighting with critical-item gating.

**Q: Why not use AI or cameras to inspect?**
A: It is outside the scope of a logging and mapping platform and would require validated models and data we do not have. We include camera evidence capture and QR location verification now and document automatic analysis as future work.

**Q: How do you know the scoring is valid?**
A: Through testing in the study (section 8): comparing the system's computed results with manual calculation of the same checklists (should match exactly), and having practitioners rate the formula and templates.

**Q: How does this differ from a paper checklist or a spreadsheet?**
A: Location-linked records on the plan, mandatory photo evidence, automatic and consistent scoring, enforced workflow (a pin cannot be verified while a critical item is failed), role-based access, an audit trail that cannot be edited, and roll-up dashboards.

**Q: How is the data trustworthy?**
A: Roles and permissions are enforced by the database, not just the screen; results and edits are logged with author and time; photos and records cannot be silently replaced; administrators must pass multi-factor authentication.

## 8. Suggested evaluation for the paper

1. **Functional testing**: each requirement has a test case (the project already runs automated database tests for access rules, locks and history).
2. **Scoring accuracy**: take 20 to 30 real or realistic checklists; compute the score manually and with the system; report agreement (target 100 %).
3. **Software quality**: rate against **ISO/IEC 25010** characteristics (functional suitability, usability, reliability, security, performance efficiency).
4. **Usability**: a short survey such as the **System Usability Scale (SUS)** with engineers, inspectors and foremen.
5. **Expert validation**: a licensed civil engineer or QA practitioner reviews the checklist templates, criticality classes and acceptance threshold.
6. **Process comparison**: time and completeness of an inspection record on paper versus BuildTrack for the same task.

## 9. What must be decided by the team

| Decision | Recommendation |
|---|---|
| Who inspects? | Add an **Inspector** duty. Either a new role, or an engineer assigned as inspector on a project. |
| Which standards to cite? | Two or three that apply to the sample project (for example NSCP, DPWH specifications, one safety standard). |
| Acceptance threshold | 90 % with no critical failure, to be confirmed by the expert reviewer. |
| Sample work types for templates | Start with 3 to 5: rebar, formwork, concrete pour, masonry, MEP rough-in. |
| Where the QA data appears | Inspector form on each pin, QA dashboard for admin/engineer, read-only summary for the client. |

## 10. Build status

Implemented on 2026-10-11 (migrations 0025 and 0026, audit note `docs/audits/2026-10-11-qa-module-pages-bar.md`): checklist templates with severity, hold points, measured tolerances and photo requirements; inspections (Request for Inspection by the foreman, inspection by the engineer) with weighted scoring using the Admin pass mark and weights; non-conformance reports with corrective and preventive action, verification and closure; re-inspection of failed items; evidence photos in a private bucket; per-project numbering (IR / NCR); QA summary for the engineer and a plain-language view for the client; printable inspection, NCR and summary reports. The camera-scanning suggestion (section 6) is still not built. The original plan is kept below for the record.

## 10a. Original plan

- Checklist templates (items with reference, criticality, photo requirement).
- Inspections per pin with Pass / Fail / N/A, measured values and photo evidence.
- Weighted scoring, decision rules and pin-status integration.
- Corrective actions and re-inspection.
- QR code per pin for location verification.
- QA dashboard and roll-ups; client summary view.
- Database migration, access-rule tests and audit documentation, as for all other features.

---

*Prepared as the working basis for the capstone paper. References to codes and standards should be checked against the current editions and cited in the paper's required format.*

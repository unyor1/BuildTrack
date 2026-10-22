# APPENDIX A

# BuildTrack Software Quality Evaluation Questionnaire

Researcher-developed draft for adviser review

## Purpose and basis

This instrument gathers observations after an evaluator uses BuildTrack for an assigned project task. It follows the five characteristics selected in Chapters 1 to 3 under ISO/IEC 25010:2023: functional suitability, performance efficiency, interaction capability, reliability and security. The supplied IAS 2 module by Lilibeth H. Arcalas guides the organization of the instrument. The statements below were written for BuildTrack; the module's MatatagVPN examples were not adopted as BuildTrack functions.

This is a proposed instrument, not an official ISO questionnaire or a validated scale. Adviser review, a trial administration and any resulting revisions must be documented before formal data collection. No responses or evaluation results have been entered.

## Part I. Session information

Participant code: __________    Evaluator role: __________

Task code(s): __________    Build/version: __________

Session date: __________    Device/browser: __________

Connection conditions: __________    Assistance given: __________

## Directions and response scale

Rate only what you personally used or observed in the assigned session. Enter one response beside each statement: 5 = Strongly Agree; 4 = Agree; 3 = Neutral; 2 = Disagree; 1 = Strongly Disagree. Enter N/O if the feature was not observed, was outside your role or was not tested. N/O is not a neutral response and will not be scored.

For an attempted task, a failure or inaccessible expected function should be recorded in the task notes and rated according to your observation. Do not mark a known failure N/O simply because it did not work. Leave actual physical fingerprint enrollment and attendance unassessed until the AS608 and ESP32 are connected and a supervised hardware test has been performed.

Participation is voluntary. You may decline a question or stop the session. Use a participant code; do not enter passwords, fingerprint information or unnecessary personal details. The researchers will explain the approved handling of evaluation records before collection.

## Part II. Assigned tasks

Administrator: manage a test project or authorized user, review a worker profile/enrollment request and open an available workforce report. Physical enrollment success is outside the present session.

Engineer: open a plan and work pin, inspect submitted evidence, record a QA decision and examine the correction history. Demonstrate manual checklist completion only after the applicable QA/NCR requirements are satisfied.

Foreman: open assigned work, submit eligible evidence and a daily report, and perform a supervised offline-queue/reconnection scenario if available.

Client: view an authorized project and submitted report, then send a private question or pin-linked problem report through the client portal.

Technical reviewer: supervise controlled permission, session and interruption checks. Use test accounts and test records. Do not ask a participant to access real unauthorized information.

# Part III. Functional Suitability

Selected aspects: functional completeness, correctness and appropriateness.

| Code | Statement | Rating: 1–5 or N/O |
|---|---|---|
| FS1 | The functions available to my role were sufficient for the assigned BuildTrack task. | |
| FS2 | The work pin I opened identified the intended location on the project plan. | |
| FS3 | The record displayed after my task matched the information I entered or reviewed. | |
| FS4 | The available actions helped me complete my assigned project task without unnecessary steps. | |
| FS5 | The displayed work status matched the QA or completion action demonstrated in my session. | |

# Part III. Performance Efficiency

User observations of time behaviour. Resource use and capacity require separate technical measurements.

| Code | Statement | Rating: 1–5 or N/O |
|---|---|---|
| PE1 | My assigned project workspace opened within a reasonable waiting time during the session. | |
| PE2 | The project plan responded promptly when I moved or zoomed it. | |
| PE3 | Opening the selected work pin took a reasonable amount of time. | |
| PE4 | Saving or submitting my assigned record took a reasonable amount of time under the recorded connection conditions. | |
| PE5 | Opening the photograph, daily report or workforce report assigned to me took a reasonable amount of time. | |

# Part III. Interaction Capability

Selected aspects: recognizability, learnability, operability, error protection and self-descriptiveness.

| Code | Statement | Rating: 1–5 or N/O |
|---|---|---|
| IC1 | The menu labels helped me find the functions needed for my role. | |
| IC2 | I could understand the information shown on the project plan and work pins. | |
| IC3 | The work-status labels helped me identify the next action appropriate to my role. | |
| IC4 | When I entered incomplete or invalid information, the displayed message helped me correct it. | |
| IC5 | I could distinguish a saved submission from one that was queued, failed or still awaiting confirmation. | |

# Part III. Reliability

Selected observations of faultlessness, availability, fault tolerance and recoverability in assigned tasks.

| Code | Statement | Rating: 1–5 or N/O |
|---|---|---|
| RL1 | I could access the assigned workspace when it was needed during the evaluation session. | |
| RL2 | Information saved during my task remained available when I reopened the record. | |
| RL3 | The system completed my assigned task without an unexpected interruption. | |
| RL4 | After the supervised connection interruption, I could identify which submission still needed attention. | |
| RL5 | When connectivity returned, the eligible queued submission retained the information I had entered. | |

# Part III. Security

Observable aspects of authenticity, confidentiality, integrity and accountability. Backend controls require technical verification.

| Code | Statement | Rating: 1–5 or N/O |
|---|---|---|
| SC1 | I was required to sign in before opening the protected project workspace. | |
| SC2 | The project records available through my account matched the project access assigned for the session. | |
| SC3 | A restricted action assigned for the supervised permission check was refused through my account. | |
| SC4 | The submitted evidence or decision history I reviewed identified the responsible user. | |
| SC5 | After signing out, I was required to authenticate again before reopening a protected workspace. | |

# Part IV. Comments and recommendations

Which BuildTrack function was most useful for your assigned task?

________________________________________________________________

Which difficulty, unclear instruction or missing function did you encounter?

________________________________________________________________

What specific improvement would you recommend?

________________________________________________________________

# APPENDIX B

# Technical Verification and Information-Security Review Sheet

For qualified reviewers and the research team. This evidence sheet supports the selected ISO/IEC 27001:2022 review areas described in Chapters 1 to 3. It is a project-level review, not an ISMS certification audit. It is not part of the five-point questionnaire score.

Reviewer code: __________    Build/date: __________

Record one status per check: Verified, Failed, Not tested or Not applicable. Verified requires retained evidence; an implemented feature without executed verification is Not tested. Record the test account role/project, expected and observed behaviour, evidence location, issue reference and corrective action. Do not enter credentials or identifiable worker data.

| Code / review area | Verification and evidence required | Status / evidence |
|---|---|---|
| T1 Risk assessment | Record a project-specific information-security risk, affected record, existing control, remaining gap and proposed treatment. | |
| T2 Access control | Using controlled assigned/unassigned accounts, test role/project restrictions, including internal QA and workforce records. | |
| T3 Sensitive information | Test access to private plan/evidence files and restricted workforce records, including a refused unauthorized request. | |
| T4 Evidence integrity | Verify that original submission, correction and QA-decision history remain traceable after resubmission. | |

# Technical verification, continued

| Code / review area | Verification and evidence required | Status / evidence |
|---|---|---|
| T5 Device trust | Test invalid/revoked device credentials and duplicate event handling through the receiver; label simulated events. Physical sensor matching is not yet tested. | |
| T6 Backup and recovery | Export and restore in an isolated test environment; check files and newer worker/enrollment/attendance coverage. Record missing coverage as a gap. | |
| T7 Incident handling | Review a recorded or controlled incident, responsible person, action taken and follow-up evidence; mark absent procedures or unperformed tests explicitly. | |
| T8 Measured performance and recovery | Record conditions and observed task timings, resource/capacity checks where executed, and offline retry/recovery outcomes. Keep measurements separate from user ratings. | |

# Researcher scoring and administration guide

Keep the completed task record beside the questionnaire. For every task, record its code, role, expected action, observed outcome, assistance, device/browser, build, connection conditions, measured timings where collected and the related issue/evidence reference. A rating is an observation, not proof that an access rule, backup or hardware function passed.

For each questionnaire item, summarize valid response frequencies, percentages, the frequency-weighted mean and sample standard deviation as described in Chapter 3. Exclude N/O and blanks from the denominator and show their counts separately. Do not convert either into a score of 3.

Proposed scoring rule for adviser review: compute a participant's characteristic mean only when at least three of its five items have a valid 1 to 5 response. Use the arithmetic mean of those valid items and report the item codes used. Summarize these participant means within comparable role/task groups and retain the eligible count. Where fewer than three items apply, report item results without a characteristic mean. Finalize this rule before collection; do not change it after seeing the results.

Do not combine the technical checklist with questionnaire ratings or use a high mean to override a failed functional/security test. Report user-perceived responsiveness separately from measured response time, resource use and capacity. The present questionnaire samples selected aspects of five characteristics; it does not assess every ISO/IEC 25010 subcharacteristic.

The technical review must include unresolved backup coverage for newer workforce/enrollment/attendance records and the unconnected biometric terminal. Technical incidents and their follow-up must be supported by records. Proposed features, simulated device events and real physical sensor tests must be identified separately.

Before administration, ask the adviser and suitable reviewers to check item relevance, clarity, role applicability and agreement with the selected characteristics. Pilot the instructions and task routing with appropriate users only after the review arrangements are agreed. Record revisions and any evidence of validity/reliability actually obtained; do not claim validation from drafting alone.

## Instrument basis

Arcalas, L. H. (n.d.). Module ISO 25010:2023 [IAS 2 instructional module supplied to the researchers].

International Organization for Standardization. (2023). Systems and software engineering: Systems and software Quality Requirements and Evaluation (SQuaRE): Product quality model (ISO/IEC Standard No. 25010:2023). https://www.iso.org/standard/78176.html

International Organization for Standardization. (2022). Information security, cybersecurity and privacy protection: Information security management systems: Requirements (ISO/IEC Standard No. 27001:2022). https://webstore.iec.ch/en/publication/79694

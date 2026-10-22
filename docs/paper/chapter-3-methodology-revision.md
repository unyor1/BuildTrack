CHAPTER 3

METHOD OF RESEARCH

This chapter explains how BuildTrack was planned, designed and developed for Valencia Construction Services and how its functions will be tested and evaluated. The procedures follow the objectives and scope in Chapter 1 and the Input-Process-Output framework in Chapter 2. The planning, design and development discussion retains the project's recorded work, while the operation, testing, evaluation and statistical sections set out the remaining research procedures. Implemented software is distinguished from the AS608 and ESP32 hardware that still requires physical connection and validation. The chapter does not report completed user evaluation or physical fingerprint-test results.

Project Planning

Data Gathering Process

The data-gathering plan combines a client interview, review of the company profile and available site records, examination of related literature, and consultation on the proposed system requirements. These sources are intended to establish how Valencia Construction Services records progress, inspection findings and attendance, and how information passes between site personnel and the office. The research record will identify the interview participant and role, date, questions and documented responses before specific interview findings are presented as confirmed evidence. Those details have not been established in the present draft.

The literature and related studies reviewed in Chapter 2 informed the use of plan-based records, selected offline submissions, digital QA evidence and project-scoped workforce information. The review also provided the basis for evaluating the product through selected characteristics of ISO/IEC 25010:2023 and examining implemented security controls with reference to ISO/IEC 27001:2022. Literature findings guide the design; they do not establish that BuildTrack has already improved reporting time, construction quality or attendance accuracy.

The project's documented QA basis guided the distinction between recording an inspection and automatically judging construction quality. The Engineer supplies inspection criteria for a work item, reviews the submitted evidence and records the decision. Approved drawings, specifications and applicable inspection requirements should support those criteria. BuildTrack retains the evidence and decision history, but it does not determine construction quality from a photograph. Image-based quality assessment remains future work. The requirements gathered for the study will be organized by user role, project record and permitted action, then checked against the objectives in Chapter 1.

Work Breakdown Structure

The work was divided into five work packages for the proposed WBS in Figure 1. Project initiation and documentation cover the title proposals, title defense and Chapters 1 to 3. System design covers the wireframes, backend roadmap, data flows and role/project permissions. Software development covers the functional requirements in Chapter 1: user management, project administration, public project viewing and inquiry, 2D progress monitoring, QA logging, workforce attendance, selected offline submissions, and reporting. Authentication, information protection, and backup/recovery are addressed across those functions. Hardware development covers the AS608 sensor, ESP32 controller, wiring and terminal enclosure. Testing and deployment cover automated checks, functional and integration scenarios, user evaluation and demonstration preparation.

[Insert Figure 1. Work Breakdown Structure of BuildTrack]

Schedule and Milestones

The schedule is shown in the Gantt chart in Figure 2 and follows the weekly plan of the group. Documentation work started on September 7, 2026 with the three title proposals, one for each member. The title was defended on September 18 and approved with a minor revision, and the rationale, objectives and features were revised until September 27. During the week of September 28 to October 4, the researchers drafted Chapter 1, conducted the client analysis, produced the wireframes in Figma and wrote the backend roadmap. Chapter 2 was started in the same week.

The software was built in iterations. The October 8 to 13 records describe the initial backend, user roles, project workspaces, blueprint editor, QA functions, reports, selected offline queue and privacy controls. Development continued with checklist review and correction history. The October 19 to 22 audits record attendance software, worker enrollment requests, workforce reports, site issues, connected client/project records, manual checklist completion, shared photo markup and the public Valencia pages. These are software accomplishments. Physical fingerprint enrollment and attendance still require the sensor and controller to be connected, configured and tested.

[Insert Figure 2. Gantt Chart of the Project Schedule]

The schedule distinguishes recorded milestones from targets. The title defense is recorded on September 18, 2026, and the workbook records the initial Chapter 1 and core-software milestones in early October. Chapter 2 was revised and checked on October 21 to 22. Submission on November 13 remains a planned milestone. The proposal defense is expected on November 14 or 17, subject to confirmation, with Chapters 1 to 3 and at least 50% of the program required. Figure 2 will reflect the dated workbook entries; it will not represent future tasks as accomplished work.

Project Execution Plan

The researchers use an iterative and incremental approach. Related features are developed in manageable groups, checked against their requirements and revised when a defect or workflow conflict is found. The progress workbook records weekly accomplishments and planned tasks, while repository audit notes describe specific implementation changes and verification limits. This record allows the paper to distinguish an implemented feature from a planned function or an unverified physical component.

Database changes are retained in versioned migration files, and the corresponding audit notes record deployment and verification when these have been performed. Application changes are checked through the applicable automated suites, type checking and a production build. A migration file or a successful local build alone does not establish that a hosted change is deployed or that a feature has passed user acceptance. For the research record, the tested revision, environment, procedure and supporting output will be retained with each verification entry.

The work is shared according to the roles of the group. Gilbert Armillo, the group leader, supervises all activities and develops the software. Clyne Arvey Tayona, the secretary, is mainly responsible for the documentation and also develops the software. Adrian Dale Valencia, the public relations officer, handles communication with the client and the advisers, assists in writing the paper and is assigned to prepare the cloud infrastructure in the later stage of the project. The first build iterations, from October 8 to 13, were carried out by Tayona. From October 15, the development continued under Armillo, who extended the quality assurance workflow and the project workspaces. A handover guide and a project description file were written so that both developers work from the same understanding of the system.

Budget and Resource Allocation

The project resources fall into four groups: the researchers and intended users, development tools and hosted services, the biometric terminal components, and the devices used to examine the interface. The software includes the React/TypeScript application, development tools, database and authentication services, private file storage and email integration. The hardware plan includes the AS608 sensor, ESP32 controller, power supply, wiring and enclosure. Phones, tablets and computers will be identified when the test environment is finalized. Table 1 remains subject to the team's confirmed quantities, actual quotations or receipts and selected service arrangements. No estimated purchase cost is treated as an incurred expense.

[Insert Table 1. Proposed Materials and Costing (item, quantity, unit cost and total cost)]

Project Design

Flowchart

The flowchart planned for Figure 3 follows a work item from project setup to completion. The Administrator creates the project, assigns its team and uploads the plan. The Engineer places the work pin, defines checklist items and inspection criteria, and assigns the work to a Foreman. The Foreman attaches photographs and remarks and submits the eligible item directly for QA. A separate Ready action is not required. The Engineer records the inspection; failed findings may create linked nonconformity reports, followed by correction and re-inspection. Once QA has passed and unresolved linked NCRs are closed, the Engineer explicitly chooses Complete checklist. A passed inspection alone does not complete the item. The work pin completes only when all its checklist items and applicable QA/NCR conditions are clear. Project progress is based on completed work pins, excluding notes.

[Insert Figure 3. Flowchart of the Pin and Quality Assurance Process]

Data Flow Diagram

The context diagram planned for Figure 4 will show BuildTrack exchanging information with the Administrator, Engineer, Foreman and Client, together with the trusted biometric device as an external system. The Administrator manages accounts, projects, worker profiles and enrollment requests. The Engineer manages work pins, QA decisions and issue review. The Foreman submits work evidence and daily reports and views eligible workforce records. The Client receives authorized project information and sends private questions or problem reports. The device receives enrollment jobs and submits enrollment results and attendance events through its authenticated receiver. Workers remain separate from website user accounts.

Figure 5 will expand these exchanges into account/access management, project/blueprint management, work and QA recording, workforce attendance, and reporting/communication. The associated stores will identify accounts and permissions, projects and plans, pins and submissions, inspections and NCRs, workers and enrollment/attendance events, reports/questions and audit records. Every flow must identify the project and authorized role involved. The diagram will distinguish client-visible information from internal QA and workforce records, and will keep physical sensor matching separate from browser processing.

[Insert Figure 4. Context Diagram]

[Insert Figure 5. Level 1 Data Flow Diagram]

Circuit Diagram

The proposed biometric terminal uses an AS608 fingerprint sensor connected to an ESP32 controller. The intended flow is sensor enrollment or matching, controller processing, an authenticated device request, and a saved result in BuildTrack. Fingerprint images and templates are intended to remain within the sensor; the web application handles the worker mapping, enrollment state and attendance events. The device does not receive a browser user's privileges or a general backend secret. Figure 6 will present the proposed circuit only after the supplier pinout, supply requirements and serial compatibility are confirmed. No universal pin assignment or successful wiring is asserted here. Physical connection, flashing, provisioning and acceptance testing remain pending.

[Insert Figure 6. Circuit Diagram of the Biometric Terminal]

Physical Layout

The physical layout planned for Figure 7 connects the devices used by authorized staff to the hosted application through an internet connection. Engineers and Foremen may use phones or tablets at the site, while Administrators and Clients may use a computer or phone. The proposed AS608/ESP32 terminal will occupy a location agreed with the client; it has not yet been installed or physically validated. Selected eligible submissions can be held in the device's local queue while connectivity is unavailable. The service worker and queue do not make every project record or plan available offline. Reconnection permits queued work to be attempted, but a server refusal must remain visible as a failure rather than being presented as a successful upload.

[Insert Figure 7. Physical Layout of the System]

Logical Layout

The logical layout in Figure 8 will retain the three-tier description of the draft. The presentation tier uses React and TypeScript for the public pages and role-specific workspaces. The application/data tier uses Supabase authentication, PostgreSQL, private file storage, live updates and server functions. Role and project restrictions are enforced by backend permissions as well as the interface. External services include Google sign-in and the configured email integration. The ESP32 communicates with the device receiver rather than writing directly as an application user. At the public entry point, the Valencia company page opens first and links to the separate BuildTrack landing page. Its public inquiry form prepares an email in the visitor's email application; it does not store or send an inquiry itself.

[Insert Figure 8. Logical Layout of the System]

Project Development

Configurations for Network and Security

All communication between the devices and the backend uses encrypted connections. New users register with an email address and confirm it with a six-digit one-time code sent through the Brevo email service. A Google sign-in does not give access by itself. The person completes a registration form and waits for an Administrator to approve it, unless the email address was placed on the whitelist by an Administrator. Administrator accounts must also pass a second step with an authenticator application before any administrative action is allowed. This requirement is checked in the interface, in the server functions and in the database.

Role and project restrictions govern access to project records and permitted actions. A Client's access to eligible progress reports does not grant general access to internal QA evidence or workforce records. Photographs, blueprints and identity documents use private storage, with access controlled for the relevant record and user. Privileged credentials remain in protected server configuration. Submitted QA evidence and correction attempts retain their original photographs, remarks and timestamps; new evidence does not overwrite the earlier submission. The security tests will examine these restrictions through authorized and unauthorized requests, including attempts to reach another project.

The privacy design includes a notice and consent process, identity-verification controls, restricted personal records and an account-erasure workflow that preserves the relevant work history. These implemented measures will be reviewed against the study's selected information-security areas rather than treated as proof of legal compliance or ISO certification. Project export and the documented developer-assisted restore procedure provide a starting point for backup testing. The current exporter includes defined project records and files, but it does not establish complete coverage of the newer worker, enrollment and attendance-event records. Recovery coverage, missing files and restore behavior therefore require explicit verification before the full backup objective in Chapter 1 can be claimed as achieved.

Development Procedures

The researchers developed the system in the order described below. The description also shows how each part answers a module in the specific objectives of Chapter 1.

Step 1. Project setup and database foundation (October 8 and 9). The project was set up with React 19, TypeScript, Vite and Tailwind CSS, with Supabase as the backend. The first database migration created the profiles, the roles and the permission tables. The email service and the Google sign-in were configured in the authentication settings.

Step 2. Security and access (October 9). Two-step authentication for Administrators was added, followed by the projects, the project team and the leads of each project. A person who registers receives a basic account and may request the role of Engineer, Foreman or Client. An Administrator can also issue an invitation code or whitelist an email address. This step produced the Administrator module, the access rules and the role-based dashboards.

Step 3. Blueprints and pins (October 9). The upload of plan sheets was built with numbered revisions that cannot be changed after upload. Pins, each with a position stored as a percentage of the sheet, a timeline of events and photographs, were then added. The first version of the Engineer and Foreman workspaces was created in the same step.

Step 4. Plan editor (October 9 to 11). The editor was extended with notes, shapes, text, drawing tools, arrows, dimensions, symbols, images, layers, locks, grouping, alignment, undo and redo, history, comparison of revisions, and export of a sheet to an image or a PDF. Later changes added a context bar, corner handles for resizing and a formatting bar for text.

Step 5. Quality assurance module (October 11). Checklist templates, inspections with weighted scoring, nonconformity reports and evidence photographs were built. Inspection criteria, item weights and the pass threshold are recorded in the system. Critical-item failure and NCR handling must be checked against the configured rules rather than inferred from the overall score alone. The inspection record supports the Engineer's decision; it does not replace professional inspection or automatically determine construction compliance from an image.

Step 6. Reports, notifications and the field application (October 11 to 13). Daily reports, Client questions, notifications, the email queue and printable reports were added. The PWA and selected offline queue were implemented with QR links for work pins. Eligible progress actions, daily reports and pin photographs can wait locally for a later submission attempt. The application shell is distinct from project-data availability. Camera capture and supported existing-file selection are available in the current photo flows; accepted files do not by themselves establish when or where the work was performed. Queue behavior, photo metadata and final project links will be verified in the defined test environment.

Step 7. Privacy, identity and protection of evidence (October 12 and 13). Identity verification, the privacy notice and consent, the right to erasure, the Google registration gate, protection of submitted evidence and live updates of the work tables were completed. The rules that decide who can read a record were rewritten so that they are evaluated once for each query, and the result was compared with the earlier rules to confirm that no access changed.

Step 8. Quality assurance workflow (October 15 to 21). Project membership was separated from pin assignment, and checklist submission, inspection and correction history were extended. The current workflow is Submitted, Passed and Completed. The assigned Foreman submits an eligible item directly for review. The Engineer checks its criteria, records any failed findings and reviews correction evidence. Passing QA and closing an NCR do not silently complete the checklist. The Engineer performs the explicit completion action when the required conditions are satisfied. Each original request and resubmission retains its own evidence and decision history.

Step 9. Connected project workspaces, reports and client records (October 19 to 22). Engineer and Foreman workspaces organize work by the selected assigned project. Site Logs read submitted Foreman daily reports, while progress views and assignments use the corresponding project work pins. Clients can open eligible reports linked to a selected pin, submit a pin-linked problem and exchange private questions with the Engineer. Shared photo markup preserves the original image and stores annotations separately. The public Valencia and BuildTrack pages remain distinct from protected project workspaces.

Step 10. Workforce software and remaining verification. The October 19 to 20 audits record worker registration, sensor-driven enrollment requests, the authenticated device receiver, attendance display and workforce reporting. The Foreman can review eligible project attendance and generate daily, weekly or monthly PDF/CSV reports. These summaries use recorded scans and do not establish wages, overtime or complete work hours from incomplete IN/OUT pairs. Physical AS608/ESP32 operation, complete backup/restore coverage, browser/device checks, formal user evaluation and final demonstration preparation remain to be verified. Payroll and voice notes remain future work.

**Table 2**

*Implementation Status of the Requirements in Chapter 1*

| Chapter 1 requirement | Implemented scope | Remaining verification |
| --- | --- | --- |
| Admin and user management | Accounts, role workspaces and permission controls. | Role/project denial checks and user acceptance. |
| Project administration | Projects, team assignments, plan upload and revisions. | Project setup and assignment scenarios. |
| Project viewing and inquiry | Public Valencia/BuildTrack pages; inquiry opens an email application. | Public links and email handoff; no saved public-inquiry service. |
| 2D progress monitoring | Normalized plan pins, work assignments and completed-pin progress. | Location across zoom/devices and consistent project totals. |
| Quality assurance logging | Item submissions, inspections, NCRs, preserved evidence and manual completion. | Complete submission/correction/NCR scenarios. |
| Biometric workforce attendance | Worker profiles, enrollment jobs, receiver, attendance display and reports. | Physical AS608/ESP32 connection, enrollment and scan tests. |
| Offline documentation | Application shell and selected locally queued submissions. | Eligible offline actions, retries, failures and reconnection. |
| Reporting and monitoring | Connected project reports, Client records and workforce exports. | Correct scope, date periods, complete records and permissions. |
| Authentication and information protection | Project/role access, private files and protected evidence. | Negative security tests and review of unresolved risks. |
| Backup and recovery | Defined project export and developer-assisted restore guidance. | Coverage of newer workforce records and isolated restore tests. |

Screenshots of the Partially Developed System

Figures 9 to 16 are reserved for screenshots of the developed public entry and login, Administrator workspace, project/plan setup, plan editor, Foreman reporting, inspection, correction history and Client overview. The screenshots must be captured from the tested revision and captioned according to the function actually shown. Additional workforce or enrollment views may be included when captured. Personal identifiers and credentials will not appear in the paper. The figure spaces below remain pending actual image insertion and are not evidence of completed user evaluation.

[Insert Figure 9. Landing Page and Login]

[Insert Figure 10. Administrator Dashboard]

[Insert Figure 11. Project and Blueprint Upload]

[Insert Figure 12. Plan Editor with Pins]

[Insert Figure 13. Foreman Progress Report with Photographs]

[Insert Figure 14. Quality Assurance Inspection]

[Insert Figure 15. Nonconformity Report and Correction Package]

[Insert Figure 16. Client Overview]

Development Test Cases

The development checks combine database regression cases, TypeScript/helper tests, component interactions, type checking and a production build. They examine role/project restrictions, stored validation rules, plan geometry, progress computation, QA decisions, evidence preservation, reporting and request handling. Where load tests are used, the fixture size and environment will be recorded for that run. Suite totals change as the program is extended, so the research record will state the revision, date, command, number of cases and result from the retained output rather than present an old count as the current total. Earlier automated checks are evidence for their own tested revisions, not a substitute for the planned role and hardware scenarios in Table 3.

**Table 3**

*Planned Functional and Integration Test Cases*

| Case | Procedure | Expected result | Evidence / status |
| --- | --- | --- | --- |
| TC-01 | Open another project's link as an unassigned account. | Project records and protected actions are refused. | Planned manual check. |
| TC-02 | Place a plan pin; zoom, resize and reopen the plan. | The saved pin retains its relative location. | Planned manual check. |
| TC-03 | Submit item evidence; add correction photos after a failed review. | Original and later submissions remain separately traceable. | Planned manual check. |
| TC-04 | Attempt completion before and after QA/NCR prerequisites are clear. | Blocked while ineligible; eligible Engineer action completes the item. | Planned manual check. |
| TC-05 | Open Client pin reports and a private question as different clients. | Only eligible linked reports and the intended private thread appear. | Planned manual check. |
| TC-06 | Save a worker profile and request enrollment; test device confirmation when ready. | Profile save alone does not enroll a fingerprint; valid confirmation establishes the mapping. | Software scenario planned; physical test pending. |
| TC-07 | Perform valid/failed identification and retry the same attendance event. | Only valid scoped scans are recorded; an exact retry does not duplicate the event. | Physical and receiver scenarios pending. |
| TC-08 | Queue an eligible action offline, reconnect and inspect a server refusal. | Waiting/failed states remain clear; confirmed records match the intended action. | Planned manual check. |
| TC-09 | Generate attendance reports for a selected period and worker. | Rows match the scoped scans; incomplete pairs do not become assumed work hours. | Planned manual check. |
| TC-10 | Attempt an unauthorized protected-file or workforce-record request. | No protected data is returned to the ineligible user. | Planned manual check. |
| TC-11 | Inspect a test export manifest and recover an approved isolated test set. | Included/omitted data are identified; recovered records match the tested scope. | Coverage and restore test pending. |
| TC-12 | Open the public pages, private deep link and inquiry control. | Routes respect access rules; inquiry opens email without a false saved-submission claim. | Planned manual check. |

Project Coding

The source code remains organized as described in the original draft: TypeScript for the web application, SQL migration files for the database, and TypeScript server functions for privileged operations. Role pages use shared components for plans, QA evidence, reports and identity forms, with data access and calculation rules kept in library modules. The biometric handoff includes reference ESP32 firmware that still requires physical configuration and validation. Selected code excerpts will be identified by function and tested revision if included in the appendix. Secrets, device credentials, personal records and full production data will not be reproduced.

## Project Operations and Simulation Procedure

### Operating Environment and Preparation

The operation procedure will use a documented BuildTrack revision and designated test projects. Before a session, the researchers will record the device, browser, connection, user role and project assignment. They will prepare only the records needed for the scenario and separate demonstration data from client production records. A screenshot or a successful screen transition will not be treated as sufficient evidence when the scenario also requires a saved record or a permission check.

The procedure below describes how the implemented software is intended to be operated and examined. Its inclusion does not mean that every scenario has already passed. Physical fingerprint procedures will be performed only after the AS608 and ESP32 are connected, configured and checked. If the hardware is unavailable during a demonstration, the researchers will show the software states and disclose the missing physical validation.

### Role-Based Operating Procedure

Step 1. Open the application and authenticate. Open the public Valencia page and follow the BuildTrack link to the application entry point. Use the approved sign-in process for the assigned account. Confirm the correct role and accessible project before creating or reviewing any record. For an Administrator action that requires a second factor, complete that check before continuing.

Step 2. Prepare the project. Using an authorized Administrator account, create or open the test project, confirm its team and upload the intended plan revision. Verify that the correct project is shown in the workspace. A user outside the project should not gain access by opening its direct link.

Step 3. Define and assign the work. Using the Engineer account, select the plan, place the work pin and add the checklist items with their inspection criteria. Assign the eligible Foreman. Reopen the record and check that the assignment and location were saved. Examine the pin at different zoom levels and screen sizes to determine whether its relative position is maintained.

Step 4. Submit evidence. Using the assigned Foreman account, open the item, enter the required remarks and attach the permitted photographs. Where markup is used, save the annotation and confirm that the original image remains available. Submit the item for QA and check the saved submission state. A failed or interrupted upload must not be represented as confirmed evidence.

Step 5. Inspect, correct and complete. Using the Engineer account, inspect the item against its recorded criteria. For a failed finding, examine the linked NCR and the subsequent correction submission. Confirm that the earlier evidence remains available. Attempt completion while an unresolved linked NCR exists, then repeat after the applicable QA/NCR conditions are clear. Only the eligible explicit Complete checklist action should complete the item.

Step 6. Review reports and client records. Submit a daily report with the intended work links, then open Site Logs and the Client pin view using their respective accounts. Confirm that eligible submitted reports appear and drafts or unrelated-project reports do not. Submit a client question or problem report and check its project/pin link, intended recipient and evidence history. A private question must not become visible to another client.

Step 7. Examine workforce records. Using an authorized biometric Administrator account, register a worker and request enrollment on an active project device. Saving the profile must leave the worker un-enrolled until a trusted device confirms success. After the physical setup has been validated, perform the agreed enrollment and IN/OUT scenarios. Using the eligible Foreman account, review the matching worker records and generate a selected-period attendance report. Compare the report with the underlying scans rather than infer attendance hours from an incomplete pair.

### Simulation Scenarios and User Guidance

Normal-operation scenarios will follow a project record from creation through submission, review and retrieval. Error scenarios will include an unauthorized project link, missing required input, duplicate submission, failed photo upload and an unresolved NCR. Each scenario will identify the starting record, acting role, expected response and observation to retain. A refusal that correctly protects a record is an expected result in a negative test.

Offline and recovery scenarios will interrupt a connection during an eligible queued action, inspect the waiting or failed state, reconnect and compare the final record with the intended submission. These checks will also confirm that the same action is not duplicated on retry. Plan availability and fingerprint enrollment will be examined according to their actual limits; an available application shell will not be presented as proof of offline access to every project record.

The user manual will follow the same role sequence and use screenshots from the tested revision. It will explain sign-in, project selection, pin/checklist work, evidence and corrections, Client reports/questions, workforce records, exports and common failure messages. Instructions for retrying a failed submission will distinguish a confirmed server save from a locally waiting action. The physical-terminal guide will be completed after the sensor/controller configuration is verified.

## Project Testing Procedure

### Test Preparation and Execution

Functional and integration testing will examine the requirements stated in Chapter 1. The researchers will prepare a traceability record connecting each requirement to a scenario, expected result and evidence source. Table 2 identifies the current implementation limits, while Table 3 presents the planned manual scenarios. Automated regression output will be retained separately with its tested revision and environment.

For each test, the researchers will establish the starting data and role, perform the listed actions, inspect the interface response and verify the resulting authorized record. The log will contain the case identifier, environment, preconditions, procedure, expected result, actual result, pass/fail decision and evidence reference. A test will pass only when the observed outcome meets the stated expectation. An unexecuted case will remain pending rather than receive a pass label.

The sequence will cover authentication/project access, plan location, evidence submission, inspection/correction/completion, report retrieval and workforce information. Integration checks will follow the same record across roles and components so that a local screen update is not mistaken for a completed backend write. Failures will be recorded, corrected and retested with the affected regression cases. The original failure and the later result will remain traceable.

### Security, Reliability and Performance Checks

Security checks will compare permitted and refused actions for active, unassigned and disabled accounts where applicable. They will examine project isolation, internal workforce/QA restrictions, private file retrieval, privileged actions and preservation of submitted evidence. Device tests will include invalid or revoked credentials, duplicate event retries and a worker/device mismatch. These procedures evaluate the implemented controls; a favorable questionnaire score cannot establish that an access rule is secure.

Reliability checks will cover interrupted requests, failed uploads, retries, reconnect behavior and project switching during a pending request. Performance checks will record the tested device, browser, connection, record volume and timing method before measuring selected actions such as plan opening, report retrieval and attendance export. The researchers will retain observations and any repeated-run summaries. No universal response-time target or performance result is assumed without an agreed test condition.

Backup testing will examine the exported manifest, included records, omitted files and access restrictions. Restore verification will be performed only in an approved isolated environment by an authorized developer. It will compare the recovered records and files with the intended test set. New workforce and attendance coverage must be checked explicitly, because a project ZIP is not automatically a complete system backup. No production restore or deletion is part of the proposed evaluation procedure.

Physical biometric tests will be logged separately from receiver or software tests. They will examine enrollment success/failure, duplicate capture, successful identification, rejected identification and the resulting IN/OUT record after the actual terminal is ready. The test record will identify the device configuration and observation. Hardware performance will not be inferred from simulated events or an automated receiver test.

## Evaluation Procedure

### Evaluation Basis and Participants

The software evaluation will use the five characteristics selected in Chapter 1: functional suitability, performance efficiency, interaction capability, reliability and security. ISO/IEC 25010:2023 provides the product-quality basis for this selection (International Organization for Standardization, 2023). Chapter 2 explains how those characteristics relate to BuildTrack's plan records, QA decisions, offline submissions and restricted workforce information. The selected characteristics define the scope of this study's evaluation rather than a claim to assess every part of the standard.

Participants will be selected purposively for their relevance to the intended Administrator, Engineer, Foreman and Client tasks. A technical review may involve qualified reviewers agreed with the advisers. The final participant count, role distribution and inclusion conditions will be confirmed with the client and advisers before data collection. The paper does not assign a sample size or report respondent totals that have not been established. Workers involved in a supervised hardware test will be distinguished from website-user evaluators.

### Instrument and Evidence

The draft role-appropriate questionnaire is provided in Appendix A in the EVALUATION QUESTIONNAIRE tab of this document. It contains 25 researcher-developed statements, grouped under the five selected ISO/IEC 25010:2023 characteristics, together with task directions and a five-point agreement scale: 5, Strongly Agree; 4, Agree; 3, Neutral; 2, Disagree; and 1, Strongly Disagree. An unobserved or inapplicable item is marked N/O and excluded from scoring. Appendix B in the same tab provides the separate technical-verification and selected ISO/IEC 27001:2022 review sheet. Both instruments remain drafts for adviser review; they are not official ISO questionnaires or already validated instruments.

Functional suitability will be examined through successful completion of the required project tasks and ratings of whether the needed records and actions are available. A draft indicator is: The system provides the records and actions needed for my assigned project task. The supporting functional-test record will show what the participant was actually able to perform.

Performance efficiency will be examined through recorded timing/resource observations under the stated conditions and participants' experience of the selected actions. A draft indicator is: The system responds adequately while I perform the assigned task. Perceived responsiveness will be reported separately from measured response times.

Interaction capability will be examined through task guidance, navigation, status understanding and recovery from input errors. A draft indicator is: I can understand the work status and identify the next action. This is especially relevant to Submitted, Passed and Completed, and to waiting versus confirmed offline submissions.

Reliability will be examined through the interruption/retry scenarios and the consistency of saved information. A draft indicator is: The system clearly indicates whether my submission succeeded or still requires attention. A participant's observation will be interpreted alongside the corresponding saved record and test evidence.

Security will be examined through technical permission checks and role-appropriate observations. A draft indicator is: The system limits my access to the project records appropriate to my role. The researchers will not ask ordinary users to certify backend protections that they cannot inspect. Negative tests and the review of implemented controls will provide the technical evidence.

The information-security review will use the selected areas already identified in Chapters 1 and 2, including access control, sensitive-record protection, backup/recovery and incident handling where implemented. ISO/IEC 27001:2022 provides the management-system reference, but this project-level review does not constitute an organization-wide ISMS audit or certification (International Organization for Standardization, 2022). Identified risks, implemented controls, supporting evidence and unresolved gaps will be recorded together.

### Data Collection and Handling

The researchers will explain the study and assigned task before a participant begins, obtain the required agreement to take part and provide the same task instructions for comparable sessions. A participant will receive only the role/project access needed for the activity. The researchers will record task completion and relevant difficulties, then collect ratings and comments after the participant has used the applicable functions. Assistance given during a task will be noted.

Evaluation records will use participant codes in the analysis. The code list and any identifiable consent records will be kept separately with restricted access. Screenshots and extracts will omit credentials and unnecessary personal information. The team will agree on access, retention and disposal arrangements with the advisers before collection. Reported findings will describe the tested build, users and conditions, including any unavailable hardware or incomplete functions that limited the evaluation.

## Statistical Treatment of Data

### Frequencies and Percentages

The quantitative analysis will describe the responses actually collected. Frequencies will show how many valid responses fall in each agreement category, and percentages will use the valid-response count for the relevant item as their denominator. Missing and not-applicable responses will be listed separately. The number of invited participants, completed forms and valid responses to an item will not be treated as interchangeable totals.

Percentage = (f / N) × 100

Here, f is the frequency for a response category and N is the number of valid responses to that item. A percentage will not be calculated when the denominator is zero. Functional-test pass/fail records will be summarized separately from questionnaire ratings; a test pass rate is not a percentage of the whole program completed.

### Mean Ratings

For an agreement item, the researchers will calculate the mean from the observed score frequencies. This frequency-weighted mean gives each valid response equal weight. It is a descriptive summary of the coded ratings, not a finding that the system complies with a standard.

WM = (Σ fᵢxᵢ) / N

In this expression, fᵢ is the frequency for score xᵢ and N is the sum of the valid frequencies. The study will present the response distribution with the mean because agreement categories are ordered and the average alone can hide disagreement. No missing or not-applicable response will be assigned a neutral score.

Where several items address one quality characteristic, the scoring rule and required answered items will be finalized before collection. A participant-level characteristic mean may then be calculated from the applicable items, followed by a summary across eligible participants. The report will identify the items and valid count used for each summary. A single combined score will not be used to hide an unresolved functional or security failure.

### Variation and Interpretation

The sample standard deviation will describe the spread of coded item ratings around their mean when at least two valid responses are available. For frequency-form data, the calculation is:

s = √[Σ fᵢ(xᵢ − x̄)² / (N − 1)]

Here, x̄ is the mean rating and N is the valid-response count. A small spread indicates closer agreement among the recorded ratings; it does not by itself demonstrate software quality. For participant-level characteristic means, the corresponding ungrouped mean and standard deviation will be reported. Summaries will retain the valid counts and any relevant role differences without inventing group results.

Task completion records, measured timings and open comments will be presented alongside the rating summaries. Comments will be grouped by the function or difficulty they describe and checked against the session notes. The study will not assume a claim such as reduced rework, faster reporting or accurate physical attendance unless the collected evidence supports that specific comparison.

Inferential tests such as a t-test, ANOVA or regression are not specified for the present descriptive evaluation. They will be added only if an approved research question, comparison groups, sampling plan and data assumptions justify their use. Final conclusions and recommendations will follow actual testing and data collection rather than the sample outcomes shown in the instructor's reference.

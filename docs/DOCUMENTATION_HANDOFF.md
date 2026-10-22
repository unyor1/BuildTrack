# Documentation Handoff (Claude Code to Codex)

Written 2026-10-21. Claude Code now handles the program code. Codex takes over the capstone documentation: the paper (Chapters 1 to 3), the progress report workbook and the timeline. Paste the prompt below as the first message in Codex, then attach the files listed in section 3.

## 1. Prompt to paste into Codex

```
You are the documentation assistant for BuildTrack (Valencia Construction Services), a UMak CCIS Capstone 1 project. Work only in D:\CAPSTONE\Buildtrack\Buildtrack, never the ebalik project.

1. Read DOCUMENTATION_GUIDE.md and docs/DOCUMENTATION_HANDOFF.md first. They hold the rules, the state of the work and the links.
2. Do not change application code (src/, supabase/) or the database. Never print or copy anything from .env* files. Do not commit or push unless I ask.
3. Describe only what is actually built. Mark anything unbuilt as future work. Never invent numbers, costs, dates, respondents or results.
4. Write in plain academic English. No long dashes (em dash or en dash). Arial 12, double spacing for the paper. Vary sentence length and use project specifics so the text reads as the researchers' own writing.
5. Keep token use low: edit with targeted changes, read only the part you need, do not dump whole documents in chat.

First task: read section 4 of docs/DOCUMENTATION_HANDOFF.md, then tell me in 8 lines what is done and what is left for the proposal defense (Nov 14 or 17, 2026: Chapters 1 to 3 plus at least 50% of the program). Then wait for my instruction.
```

## 2. Project facts

- Title: Development of BuildTrack: An Integrated 2D-Mapping Platform for Site Progress, Quality Assurance Logging and Biometric Workforce Management. Client: Valencia Construction Services. Program: BS Information Technology, Information and Network Security track, University of Makati, CCIS.
- Group: Armillo, Gilbert Jr. (Leader, Software Developer); Tayona, Clyne Arvey (Secretary, Software Developer, documentation lead, Chapter 2); Valencia, Adrian Dale (PRO, documentation assistant for Chapters 1 and 2, cloud infrastructure planned).
- Advisers: Course Adviser Prof. Percival D. Adao; Technical Adviser Prof. Lilibeth H. Arcalas. (The Progress Report tab names Arcalas as course adviser. Correct it.)
- Goal: proposal defense on Nov 14 or 17, 2026 (date to be confirmed). Requirements: Chapters 1 to 3 and at least 50% of the program. Chapters 4 and 5 are not needed for this defense.
- Development history: first build Oct 8 to 13 by Tayona; continued from Oct 15 by Armillo. Facts about what is built are in CLAUDE.md, docs/HANDOVER.md and docs/audits/ (one note per change, migrations in docs/audits/migrations-log.md).
- IMPORTANT, newer than the Claude documentation work: after 2026-10-19 Armillo built and pushed the biometric attendance software and more (site issues, client portal connections, QA photo markup). Read the audit notes dated 2026-10-19 to 2026-10-21 before writing about status, especially `2026-10-19-biometric-attendance.md`, `2026-10-20-worker-sensor-enrollment.md`, `2026-10-20-admin-biometric-registration.md`, `2026-10-20-foreman-worker-attendance-tabs.md`, `2026-10-20-workforce-attendance-reports.md`, `2026-10-19-site-issues-and-zone-progress.md` and `2026-10-21-client-portal-connections.md`. Per those notes: worker registration, the attendance board, the device receiver and the AS608 plus ESP32 handoff exist in software; the fingerprint hardware is not physically connected yet. Not built: cloud infrastructure, voice notes, payroll.
- OUTDATED in the documents written before this note: the Chapter 3 draft (Project Development step 10, Circuit Diagram, Physical Layout, and the sentence that the biometric module is the next item), the workbook (Software Progress report, Documentation Progress report, Updated Project Timeline show biometrics as not started or as sample pages), and `docs/HANDOVER.md` section 5. Update them from the audit notes, with numbers taken from the notes and not estimated.

## 3. Files and links (Codex needs its own access)

Google files belong to the owner, Tayona. Codex cannot use this Claude session's Google connection. Either connect Codex to Google, or export copies and attach them (File, Download: .docx for the paper, .xlsx for the workbook).

- Paper (Google Doc): https://docs.google.com/document/d/1dZqcy_5glm1P5dRpdJNLTcYFx4mq8zng_hUOdhnoss8/edit
  - Tabs (tab id): CHAPTER 1 (t.0), CHAPTER 2 (t.9v2tvyp7tz23), CHAPTER 3 (t.7k538hw3a1ci), PROGRESS REPORT DUE (t.egz4x9nv9bwq), PROGRESS REPORT (t.slji0yb5ppu9), AUDIT REPORT (t.6hk8qt49hmj6), QA BASIS (t.pibw1mlwb7ca), RRL'S (t.wu3hudai9s9c).
- Progress workbook (Google Sheets): https://docs.google.com/spreadsheets/d/1Q1_evEvQAKNEXBn8Zon25cASIaN4c77XNzOckU0UU6k/edit
  - Tabs (sheet id): Progress Report (181573910, blank template, do not edit), Project Timeline (532348171, original plan, do not edit), Software Progress report (700000001), Documentation Progress report (700000002), Updated Project Timeline (700000003).
- Reference files from the instructors: D:\CAPSTONE\REFERENCES\ (Capstone1-Chapter-1.pdf, Capstone1-Chapter-2.pdf, Chapter-3_-Method-of-Research.pdf, Chapter-3-Documentation (1).docx). The user will re-attach them. Text can be extracted with pdftotext -layout.
- QA basis: the QA BASIS tab of the paper and docs/BUILDTRACK_QA_BASIS.md.
- Format rules in short: Chapter 1 follows the prescribed order (Introduction, Background in six paragraphs, Objectives with SMART specific objectives, Significance, Scope and Limitations, Definition of Terms). Chapter 2 has RRL, RRS, the IPO conceptual framework and APA 7. Chapter 3 follows: Project Planning (data gathering, work breakdown structure, Gantt chart, execution plan, budget), Project Design (flowchart, data flow diagram, circuit diagram, physical and logical layout), Project Development (security configuration, procedures, screenshots, test cases, coding), Operation and Simulation Procedures, Testing and Evaluation Procedures, Statistical Treatment of Data. APA 7: 1 inch margins, double spacing, 0.5 inch first-line indent, page numbers.

## 4. State of the work (as of 2026-10-21)

Done
- Chapter 3 tab: Project Planning, Project Design and Project Development drafted (about 3,400 words, Arial 12, double spaced). Tied to the nine system modules and the testing plan in Chapter 1 and to the IPO model in Chapter 2.
- Workbook: Software Progress report (plain values, no formulas), Documentation Progress report (chapter checklist, weekly table, audit table), Updated Project Timeline (dated rows with Documentation, Software, Hardware and Key Deliverables, formal wording, planned work rebuilt around the defense).
- DOCUMENTATION_GUIDE.md added and linked from CLAUDE.md section 2b.

Left for Chapter 3
- Operation and Simulation Procedures (test scenarios per role, user manual).
- Testing and Evaluation Procedures (steps, ISO/IEC 25010 standard, data collection with a Likert questionnaire).
- Statistical Treatment of Data (weighted mean and standard deviation with a verbal scale; ANOVA or t-test only if the adviser asks).
- Fill the bracketed placeholders: Figures 1 to 16 (work breakdown structure, Gantt chart, flowchart, context diagram, level 1 data flow diagram, circuit, physical layout, logical layout, screenshots), Tables 1 to 3 (materials and costing, module status, sample test cases). Costs and test results must come from the team.

Decisions waiting on the user or advisers
- Number and type of respondents for the evaluation, and whether the proposal defense needs only the plan (expected) or also a sample questionnaire.
- Whether ANOVA or t-test is expected.
- Real details of the client interview (who, when, findings). The data gathering paragraph in Chapter 3 was written from the progress report, so confirm it.
- Whether the four action items from the Oct 9 manuscript evaluation (IPO diagram, bold-italic terms, related-studies citations, APA 7 reference page; due Oct 12 to 15) are finished. The workbook counts them as not started.
- Hardware progress after Oct 11 is not logged anywhere. Audit Report Week 6 onward is blank.
- Chapter 1 lists a Project Viewing and Inquiry module and Admin, User, Engineer and Foreman dashboards. The program has a landing page and also a Client portal. Chapter 1 and the build should be made consistent.
- Chapter 3 uses Arial 12 by request; Chapters 1 and 2 use Times New Roman 12.

### Update: Chapter 3 figures, 2026-10-22

Figures 1, 2, 3, 4, 7 and 8 are now inserted and visually checked in the Google Doc. They cover the WBS, schedule, QA flowchart, context diagram and physical/logical layouts. Hardware remains proposed and unconnected. Figure 5 (detailed DFD), Figure 6 (verified circuit) and Figures 9 to 16 (real screenshots) remain open. See docs/audits/2026-10-22-chapter-3-figures.md. Other October 22 audits supersede the October 21 methodology/format status above; do not treat the older pending list as current.

### Update: Prepared evaluation instrument, 2026-10-22

The Google Doc now has an EVALUATION QUESTIONNAIRE tab (t.ekvdofjvvaa4), linked from Chapter 3 > Evaluation Procedure > Instrument and Evidence. Appendix A contains 25 original BuildTrack statements under the five selected ISO/IEC 25010:2023 characteristics; Appendix B contains the separate technical/security evidence sheet. These are prepared drafts for adviser review, not validated instruments or collected results. See docs/audits/2026-10-22-evaluation-questionnaire.md and docs/paper/buildtrack-evaluation-questionnaire.md.

### Update: Chapter 3 spacing and planning tabs, 2026-10-22

Chapter 3 page flow was corrected and Figures 1/3 compacted without removing manuscript text. The current export has 40 Chapter 3 pages, down from 44. The existing workbook now includes WBS (700000004, A1:F32) and Gantt Chart (700000005, A1:P23) tabs. Recorded and planned activity are separated; hardware remains unconnected and the defense date remains unconfirmed. Existing reports and original timeline were retained. See docs/audits/2026-10-22-chapter-3-spacing-and-planning-tabs.md.

### Update: Proposed local server guide, 2026-10-23

The proposed Windows laptop / VMware / Ubuntu / hotspot deployment is documented in docs/BUILDTRACK_LOCAL_SERVER_GUIDE.md. It is not yet implemented or tested. It requires an isolated local backend, accounts/files/functions, trusted HTTPS and actual internet-disconnected verification; cloud/local synchronization remains future work. The user authorized a documentation-only Git commit/push. See docs/paper/README.md for versioned sources versus local review artifacts.

## 5. Working notes learned so far

- Google Docs: the paper has many tabs and reading the whole document returns a very large result. Read one tab at a time. Insert text first, then apply styles in a second call using character offsets (all text was plain ASCII so offsets are exact).
- Google Sheets: write plain values, not formulas, unless a calculation is needed. Keep the original Progress Report and Project Timeline tabs untouched. Numbers in the report must come from the project record (docs/audits, git history, migrations log), never estimated.
- AI checker: the target is 20 percent or lower. No tool can guarantee it. Keep specific details, real names and dates, uneven sentence rhythm, and avoid filler words such as leverage, robust, seamless, comprehensive.
- Memory notes from Claude Code (roles, advisers, defense goal, format requirements) are summarized above; Codex does not have them.

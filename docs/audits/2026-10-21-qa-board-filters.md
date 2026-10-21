# Checklist QA board layout — 2026-10-21

- Moved **All** after the status filters in the shared WorkItemBoard used by Engineer and Foreman. Default selection, counts, search, scope filters and row actions remain unchanged.
- Removed the stage/hold-point request section from the Engineer review inbox and the stage-inspection request panel from Foreman QA requests. Updated Foreman shortcut/reference text so it no longer directs users to the removed panel.
- Engineer Waiting for you excludes stage requests no longer listed in that inbox. Existing NCR tasks and checklist tasks remain counted.
- Existing inspection history and completion/hold-point database safeguards remain intact. A work pin blocked by an existing inspection retains a QA register link to resolve it. No database rows, policies or functions were changed.

`test-qa-board-layout` exercises the actual shared board and both page components: All-last ordering, unchanged initial All selection, status/search counts, row opening, removed sections even with a pending-stage fixture, corrected Engineer count and retained register navigation. No visual browser test was performed.

Full `pnpm check` passed: TypeScript, component/helper suites, 412 SQL cases and production build.

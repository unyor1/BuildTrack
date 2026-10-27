# Engineer checklist and NCR actions — 2026-10-26

## Request and implementation

- Removed the Engineer's inline correction-decision textarea and Send back / Close NCR actions from the checklist's Corrections & NCRs summary rows. The original read-only corrective-action summary remains; all decision inputs/actions live in the opened NCR record.
- Retained Open NCR record, which opens the selected `DefectDetail` with the existing Engineer verification rights. It still requires a verification note and a valid finding-specific signed-off Pass to close; Send back remains available inside that record.
- Removed the Review NCR corrections footer shortcut. The Corrections & NCRs tab, counts, default next-action tab selection and direct record links remain.
- Hide Return after the current inspection has Passed. A Return dialog already open also disappears if that record becomes Passed. Retained the separate explicit Reopen action for completed checklist items; no new state transition or privilege was added.
- Complete checklist remains manual and disabled while open NCRs or other existing blockers remain. Foreman correction submission, original evidence/comparison, closed-NCR history and database rules are unchanged.

The website skill informed the scoped component update and verification. There is no database migration, production data change, commit or push in this task. Earlier unrelated worktree edits are preserved.

## Verification

- Expanded `pnpm test:work-item-evidence` exercises the actual workspace/NCR-row component, the exact record-open callback, the actual `DefectDetail` note/verification controls, and the real completion/readiness helpers. Tests confirm no inline textarea/actions, no review shortcut, Return hidden after Pass (including a stale dialog), retained Reopen, blocked completion with an open NCR, and no Engineer-only actions for Foreman/Admin/Client.
- `pnpm test:work-item-evidence` and final `pnpm check` passed: TypeScript, all application/component/helper suites, 447 isolated SQL cases (0 failed), and the production Vite build. `git diff --check` passed (existing LF/CRLF notices only).
- No signed-in browser visual verification was performed; the existing screen structure and shared components were retained.

# NCR correction verification placement - 2026-10-26

## Request and implementation

The owner asked to remove the correction-verification textbox in the supplied NCR screenshot and show only a button to open the inspection.

- For correction-package NCRs awaiting verification, the NCR detail's Verification section now has **Open inspection** instead of the note, Send back and Close NCR controls. Evidence, read-only corrective/preventive response, original inspection links, photos/comparison, print and history remain.
- The button uses the exact linked correction inspection returned by `useCorrectionInspection`, not the original failed inspection. Loading/error/missing targets cannot open stale ids; errors have Retry. Callers can open the inspection in place; otherwise a scoped Engineer QA-register deep link is used.
- The removed controls were the only closure path. To preserve the QA workflow, moved package-NCR decisions into `NcrInspectionVerification`, rendered inside the inspection. Candidates are project/pin scoped; each is shown only when its readiness RPC identifies this exact inspection. Other roles cannot act. State is remounted per inspection/finding/attempt.
- Verification still requires a note of at least 5 characters. Close requires explicit confirmation, inspection sign-off and a currently valid finding-specific Pass. Send back keeps the existing note requirement. In-flight decisions are guarded against double submission; errors do not report success. Refresh uses the existing parent reload and readiness reload.
- All writes still use `qaActions.verifyDefect` / the existing checked `verify_defect` RPC. No automatic NCR closure, checklist completion, grant/RLS change, migration or production mutation was introduced. Standalone NCRs without a correction inspection retain their existing explicit verification form, because they have no linked inspection to open.

Sites guidance informed reuse of the existing dialogs. Supabase guidance informed retaining guarded RPC reads/writes and server authorization. Current RPC docs/changelog were checked; no relevant API change or schema change was needed. Earlier unrelated worktree edits are preserved. No commit/push was requested or performed.

## Verification

- Expanded actual-component tests in `pnpm test:work-item-evidence`: no package-NCR inline decisions; exact reinspection button/callback and fallback link; loading guard; inspection screen mounts only scoped candidates; decision-note/Pass/sign-off guards, cancellation, exact closure/send-back payload, server rejection, retry/loading/error, unrelated inspection masking and role/project restrictions. Manual checklist completion remains blocked by open NCRs. Standalone closure remains reachable.
- Focused tests and full `pnpm check` passed: TypeScript, all application/component/model suites, isolated SQL validation of existing permission/closure guards and production build. Scoped `git diff --check` passed (LF/CRLF notices only).
- No signed-in browser visual acceptance test was performed.

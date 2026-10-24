# QA register Overview calendar - 2026-10-23

## Scope and behavior

- Extends the existing Engineer QA register calendar to Overview; reuses `DateRangeFilter` and its presets, From/To inputs, validation, Clear dates, inclusive Manila days and `?from=&to=` links.
- The same period carries between Overview, Inspections, NCR register and Client reports. Back/Forward also restores the dates. Foreman pages are unchanged.
- Inspections belong to the period by `requested_at`; NCRs by `raised_at`. Figures describe their current status, not a historical state at the end of the period. This is explained above the results. Tab badges explicitly remain all-date counts.
- Overview cards, Needs attention, recent inspections, quality by trade, NCR breakdowns/trends and Print summary all use those cohorts. The printout includes the period and scope. All dates restores the existing server summary.
- First-time pass rate excludes follow-up inspections; item-failure rates count actual pass/fail inspection results only on completed selected inspections. Pending/N/A/cancelled/out-of-cohort checks do not affect the denominator. Standalone NCR trades stay visible.
- Filtered trends span the entire interval using at most eight equal-day buckets, including old and long ranges. Closed bars count selected-cohort NCRs closed within the displayed interval. The all-date chart retains its previous last-eight-week behavior.
- Empty, loading, failed-read and retry states prevent misleading totals.

## Implementation and security

- `QaView.tsx`, `QaPanels.tsx`, `DefectTrends.tsx`, `qaPrint.ts`; new pure `qaOverviewModel.ts` and read hook `qaOverview.ts`.
- No migration, schema, authorization, QA transition, upload or database write changes.
- Additional read only while the filtered Overview is mounted: `qa_inspection_items`, selecting `inspection_id,result`, explicit `project_id` equality, stable `id` order and paginated ranges through the existing authenticated Supabase client. Existing staff/project RLS remains authoritative.
- Late responses from another project are discarded; previous-project results are immediately masked. Realtime and periodic/online/visibility reloads keep results current. Read errors or the 50,000-row safety cap fail closed rather than displaying partial check totals.
- Used the local-checkout website skill workflow and Supabase skill guidance. Checked current Supabase changelog and documentation; no relevant API changes required changes to the existing paging/query pattern. No new hosting or dependencies.
- Pre-existing working-tree changes, including other calendar and review-board work, were preserved. No commit, push or deployment requested or performed.

## Verification

- `pnpm test:date-filters` passed: controls, range persistence/shared links/history, invalid range, cards, independent inspection/NCR cohorts, real check denominators, print period/content, all-date restore, empty/loading/error states, filtered trends, extreme dates, 1,001-row pagination, retry, project-switch races and paging-cap failure.
- Full `pnpm check` passed in the permitted execution context: TypeScript, all application suites, 425 SQL regression cases and the production build. An initial restricted-runner attempt passed all tests but failed its final build with `ReferenceError: require is not defined` in the existing picomatch/Vite config-loading path; both the standalone build and the complete rerun succeeded outside that restriction.
- No authenticated live-browser or production-data test was performed. Browser inventory exposed no surfaces, so desktop/mobile visual verification remains unperformed.
- `git diff --check` run before handoff.

This supersedes the earlier audit's decision to leave Overview whole-project-only; the previous audit remains a historical record.

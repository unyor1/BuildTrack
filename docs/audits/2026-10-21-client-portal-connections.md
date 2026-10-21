# Client portal connections — 2026-10-21

## Requested experience

- Removed the separate assigned-project card step from Client Overview. The portal opens an accessible assigned project automatically and offers an assigned-project switcher when there is more than one. Project changes remount client content; URL navigation retains the selected project. No unassigned project is made accessible.
- A client can select a blueprint pin and open **Daily reports**. Only submitted daily reports explicitly linked through `daily_reports.linked_work` are shown. Ordinary drafts, unlinked reports and other projects are excluded.
- Report images use previous/next slides, a larger zoomable viewer and a details icon. Report details include author, date, submitted time, manpower, weather, review state, work description and linked checklist names. Images belong to the whole report; they are not falsely labelled as exclusively showing one pin.
- Clients can report a problem from a selected pin or choose a project work pin in the form. The existing shared photo editor supports text, lines, arrows, rectangles, ellipses and freehand drawing before upload. Original file bytes, caption and validated markup are saved separately. Failed photo uploads can be retried against the saved report without duplicating it.
- Engineer problem review opens the linked blueprint pin. Accepted reports carry that pin into the resulting NCR. Engineer and Foreman NCR details also show the original client's annotated evidence separately from correction evidence.
- Communication uses the existing private project question/Engineer answer workflow. Pin links work in both directions, new questions and answers notify the right recipient, and notifications open/highlight the exact question. Client questions remain private from other clients.
- Blueprint panels have clearer fixed headers/tab partitions, minimum-width/height guards, consistent spacing, independently scrolling content and wider responsive panels. Pins display Not started/In progress/Completed/Issue; For review remains a checklist status. Existing database state and QA/completion guards were not removed or bypassed.

## Database deployment

Applied to the connected BuildTrack cloud project using Supabase MCP:

`20261021095341_client_pin_reports_and_photo_markup.sql`

The file was created with the Supabase CLI and renamed to match the hosted migration version after deployment. It adds an indexed nullable client-report pin foreign key, caption/markup fields, a narrowly authorized linked-report submission RPC, a pin-to-NCR link trigger, serialized photo attachment and exact-thread notification links. Existing submission quotas and review permissions remain in force. No sample reports, messages or photos were inserted into the cloud.

Post-deployment read-only verification confirmed the migration, pin link/index, both photo fields, RLS on reports/photos, authenticated-only RPC execution and no API access to the internal trigger function. No SQL needs to be pasted by the user. The local migration runner lacked its separate access token; deployment and verification used the already connected Supabase account instead.

## Security and performance review

Supabase and Postgres skill guidance informed project isolation, explicit role checks, non-exposed internal trigger functions, preserving originals and indexing the new foreign key. Existing private storage and RLS policies were retained.

- The advisor intentionally flags the authenticated-only `submit_linked_snag` SECURITY DEFINER RPC, as it does the existing write APIs. It requires an authenticated active assigned client, validates the same-project work pin, and exposes neither direct report writes nor internal trigger functions. Authorization and denial cases pass locally. [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- The new foreign-key index is reported as unused immediately after deployment, before any production linked reports exist. Retained deliberately. [Index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Pre-existing warnings remain outside this change: internal tables with no public policies, other authenticated RPCs, disabled leaked-password protection, older missing foreign-key indexes and older RLS expression overhead. [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [foreign-key indexing](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [RLS expression guidance](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).

## Verification

- `test-client-portal`: actual component controls for automatic project selection/switching, pin report filtering, slideshow and details toggle, client pin panel tabs/status, private questions, pin-linked submission, photo retry and original/markup storage; original client evidence appears in the linked NCR component.
- Seven new SQL regression cases verify client/project/role isolation, invalid pin refusal, markup constraints/privacy/immutability, Engineer NCR pin inheritance, question/answer notification links, submitted-report/photo visibility and disabled-client denial. Full SQL suite: 419 passing cases.
- Full `pnpm check`: TypeScript, all helper/component suites, SQL regressions and production build.
- `git diff --check`: no whitespace errors; existing line-ending conversion warnings only.
- Browser inventory exposed no available browser session, so visual screenshot verification could not be performed. Computer-use inspection did not change application state.
- Standalone attendance page/components/data helpers remain byte-for-byte unchanged. No commit or GitHub push was made.

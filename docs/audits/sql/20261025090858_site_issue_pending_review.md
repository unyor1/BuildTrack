# 20261025090858 — site issue during pending review

## Purpose

The pin panel and issue picker excluded `for_review` pins. Removing that UI block alone was insufficient: `log_site_issue` changed the pin to `issue`, which `guard_work_qa_config` correctly rejects during a submitted inspection. The fix records the observation without interrupting QA.

## Objects changed

- Only `public.log_site_issue(uuid,uuid,text,text,jsonb,uuid)` is replaced.
- Its pin update retains `for_review` if that is the locked row's current status; otherwise it still sets `issue`.
- Existing Engineer/project authorization, note/completed exclusions, checklist ownership, idempotent retries, photo validation, saved checklist name and timeline insertion remain unchanged. The five-argument invoker wrapper calls the same implementation.
- No table, policy, evidence lock, inspection, NCR, completion function or existing data changes.

## Security and RLS

The definer RPC retains an empty search path, explicit project authorization and a pin row lock. Execute is revoked from PUBLIC/anon and granted to authenticated; callers still need the project Engineer permission. No new privileged endpoint is introduced.

## Application and verification

- CLI 2.122.0 generated the local migration stub; the filename was aligned to connector-recorded hosted version `20261025090858` after deployment on 2026-10-25 to BuildTrack project `ruimjlhsfpaezkgfphsz` only.
- Local SHA-256: `801e25ed1c9031ca43b0cca1aade8383680c430457c8c34e59762e7ffbc76987`.
- SQL regression first failed with the old function's pending-QA error. With this migration, all 439 isolated SQL cases pass. New coverage logs while requested and in progress, retains the movement lock and original photos, and proves that status/evidence rewrites are still rejected. Existing role/project, immutable-photo, rollback, retry and completed-work cases pass.
- Hosted read-only verification: `preserves_pending_review=true`, `anon_execute=false`, `authenticated_execute=true`; migration history contains the matching name/version.
- Security advisor findings unchanged: 4 INFO RLS-enabled internal tables without policies (intentional RPC-only access), 91 existing authenticated definer warnings, 1 pre-existing leaked-password protection warning. No new finding or grant was added. [Advisor reference](https://supabase.com/docs/guides/database/database-linter).

## Rollback

In a new reviewed migration, restore the six-argument implementation from `20261019101438_site_issue_checklist_filter.sql`. This restores the old review-time refusal without deleting any issues or evidence. If rolling back the UI too, exclude `for_review` pins again so the button does not offer a save the old server refuses. Never disable `guard_work_qa_config` or delete submitted history to work around this error.

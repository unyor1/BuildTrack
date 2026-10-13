# Contributing to BuildTrack

## Branches and pull requests

- `main` is always deployable. Do not push to it directly.
- Branch from `main`: `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`.
- Open a pull request. CI runs `pnpm check` (type-check, logic tests, SQL tests, build). Merge only when it is green and one teammate has looked at it.
- Small pull requests, one idea each. Write what changed and why, and how you checked it.
- Commit messages: a short summary line, then a few lines of why.

## Before you push

```bash
pnpm check
```

If you touched a policy, a query or a list, also run `pnpm test:load`.

## Rules every change follows

**Security**
- Browser code only ever sees `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service-role key, Brevo key and Google secret stay in `.env.secrets` / Supabase secrets. Never commit them, print them or paste them in chat.
- Never weaken auth to make an error go away (no `verify_jwt = false`, no skipping the MFA check).
- Do not trust the browser for roles or status. Enforce it in SQL.

**Database**
- Schema changes are new numbered files in `supabase/migrations/` (never edit one that was already applied).
- Every migration comes with tests in `supabase/tests/NN-name.cases.mjs`.
- Writes go through SQL functions that check the caller; tables stay read-only to the API.
- New read policies use `project_id in (select public.viewable_project_ids())`.
- The project owner (or the agent with the project connector) applies migrations to the live project, only after `pnpm test:sql` passes. Then verify with read-only queries and update `docs/audits/migrations-log.md`, `docs/audits/sql/README.md` and the migration's note.
- Destructive SQL (drop, delete, truncate of data) needs the owner's approval first.

**Interface**
- Use the semantic colour classes (`bg-surface`, `text-fg`, `text-fg-muted`, `border-line`, `bg-brand`, `text-brand-text`), never raw hex or `bg-white` / `text-gray-*`.
- No text under 11 px, targets at least 24 px, every control labelled, one `h1` per page.
- Loading states use skeletons; outcomes use `useToast()`; confirmations use `useConfirm()`; dialogs use `components/Modal.tsx`.
- Forms that send personal data go through `DataConfirmModal` (privacy notice).
- Shared parts first: `PageHead`, `StatCard`, `EmptyState`, `GetStarted` (`components/ui/PageParts.tsx`, `components/GetStarted.tsx`).
- Never show invented numbers. If a screen is still sample data, say so with `SampleNotice`.

**Code style**
- Double quotes when a string has an apostrophe, no semicolons, default-export components, small focused edits.

**Documentation**
- Every migration, Edge Function change or structural refactor gets a short note in `docs/audits/` named `YYYY-MM-DD-topic.md`, and migrations get a row in `docs/audits/migrations-log.md`.
- Keep `CLAUDE.md` current when you add something a newcomer (or an assistant) must know.

## Recipes

### Add a page
1. Create `src/pages/<Role>/<Name>.tsx` (default export, `<Role>PageProps`).
2. Add its key to `<Role>PageKey` in `src/pages/<Role>/types.ts` and to the page map and valid keys in `src/App.tsx`.
3. Add a nav item in `<Role>Shell.tsx`.
4. Start with `PageHead`; use `StatCard`, `EmptyState`, skeletons.

### Add a table
1. New migration: table, indexes, RLS on, read policy using `viewable_project_ids()`, no direct write grants, checked RPCs for writes, audit where it matters.
2. Tests: as each role, including a role that must see nothing.
3. If other people should see changes live, add the table to the publication (new migration, like 0034).
4. Add it to `EXPORT_TABLES` in `src/lib/projectExport.ts` if it belongs in a project backup.

### Add a list that can grow
Read it with `fetchAll` and a stable `order`, never a bare `select`.

### Add a notification
Create it in SQL with `public.notify_user(...)` (kind like `qa.defect`, a link, the project and entity ids). It appears in the bell and is queued for email automatically.

### Change the look of one role
Edit that role's block under `[data-persona="..."]` at the end of `src/index.css`. Do not add per-role sidebars or top bars.

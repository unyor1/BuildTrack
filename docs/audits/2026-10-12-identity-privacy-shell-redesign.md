# 2026-10-12: Identity verification, data-privacy modals, premium shell, review queue and permission matrix

Migrations 0030 and 0031 (`sql/0030_identity_verification_privacy.md`), UI across all roles, CI workflow.

## 1. Email sign-ups verify their identity (ID upload)
- A new email account can sign in and use its account home at once, but **cannot request Engineer / Foreman / Client access or redeem an invitation code until verified**. Google registrations are reviewed by an administrator (previous change); trusted paths (admin-created accounts, whitelist, approved registration, invitation) are marked verified automatically.
- User side (`/user/home`, "Identity verification" card): step 1 details (legal name, birth date, address, phone, type of ID, last 4 characters of the ID number, expiry), step 2 photos (ID front, ID back where it has one, selfie holding the ID; shrunk in the browser, stored in a private bucket), then a "Check your information" confirmation with the privacy notice and a required agreement. Status chips: Not verified / Under review / Verified / Needs correction (with the reviewer's reason and a "Correct and send again" button). Withdraw is possible while waiting.
- Admin side: User Management > **Review queue** (split view): waiting registrations and ID checks on the left (oldest first), details on the right. For an ID check: the three photos (click to enlarge), the legal details with flags (name or phone differs from the account, ID expired), the accepted privacy notice version, then Verify identity / Send back (reason required). Keys J / K / A / R. Opening the documents is written to the audit log; after a decision the images can be deleted.

## 2. Data privacy and confirmation modals
- One notice text (`lib/privacy.ts`, version `2026-10`, Data Privacy Act of 2012 / RA 10173): what is collected, why, who sees it, how long, how it is protected, the person's rights, how to complain to the National Privacy Commission. `PrivacyNoticeModal` shows it; the account menu, the login page and the registration form link to it.
- `DataConfirmModal` ("Check your information"): a summary of what the form collected + a short privacy panel (expandable to the full notice) + a required agreement. The acceptance is recorded (`record_privacy_consent`; for email sign-up it travels in the sign-up metadata).
- Used before sending: email registration, Google registration details, identity verification, profile edits, requests for elevated access, client problem reports (photos may show people), admin account creation and editing, whitelist additions.

## 3. Premium look and navigation
- One shared shell (`components/shell/AppShell.tsx`, `CommandPalette.tsx`) replaces the five separate sidebars (Admin, Engineer, Foreman, Client, basic user): dark gradient rail with grouped navigation, active item with magenta gradient and an orange-magenta bar, orange badges, collapsible to icons (remembered), active-project card and user card; frosted top bar with workspace and page title, **Ctrl+K command palette** (jump to any page, switch theme, privacy, sign out), notification bell and an account menu (identity status, light / dark / auto, data privacy, sign out); phone: drawer plus a dark bottom tab bar with "More"; skip-to-content link. Foreman keeps the PHT clock.
- Public header: dark frosted glass with a gradient underline on hover; buttons and cards, tables and inputs share rounded, softer styling; thin scrollbars; admin primary buttons are brand magenta (they were yellow).

## 4. Admin tools
Review queue (above) and **Permission matrix** (Super Admin only): admins down the side, the nine permissions across, select all / none per column, staged changes shown as a list of exactly what will change, one save with a confirmation.

## 5. CI
`.github/workflows/ci.yml` and `pnpm check` (type-check, lib tests, SQL tests, build) on every push and pull request; no secrets.

## Verification
`pnpm check`: SQL 249/249, lib 58/58, tsc clean, build ok. Live (throwaway accounts, removed): see `sql/0030`. Browser (temporary mock backend, removed afterwards, `.env.local` untouched): shell at desktop, collapsed, light and dark, palette, account menu, phone drawer and bottom bar for each role; identity wizard (validation, passport has no back, confirmation gate, submit), review queue (photos, flags, audit view, send back needs a reason), permission matrix (stage, confirm, save), registration and client-report confirmation modals with recorded consent. Bugs found and fixed while testing: the command palette crashed when closing (effect returned a value), the user-management tabs rendered the wrong panel for the new tabs, and the page could scroll sideways under the new shell.

## Limits and honest notes
- Not tested with a real phone camera or real ID photos; image handling uses the same shrink step as other photos.
- The privacy notice names "the Data Protection Officer of Valencia Construction Services through your administrator" because no DPO contact was given. Put the real contact and retention period in `lib/privacy.ts` (and bump the version).
- Existing pages inside the shell keep their own layouts (cards, legacy classes); they inherit the new colours, radii and tables but are not individually redesigned. The design proposal (`docs/BUILDTRACK_DESIGN_PROPOSAL.md`) lists what is still to do per role.

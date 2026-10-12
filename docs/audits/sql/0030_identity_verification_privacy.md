# 0030 and 0031: Identity verification and data-privacy consent

| Field | Value |
|---|---|
| Files | `supabase/migrations/0030_identity_verification_privacy.sql`, `0031_privacy_consent_pending.sql` |
| Applied | 2026-10-12, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Depends on | 0001-0029 |
| Status | **Applied** and verified (SQL tests 249/249, live end-to-end run on throwaway accounts, rolled-back admin run) |
| Reversible | Yes, see Rollback (drops the verification data) |

## Purpose
Email + password sign-up still gives a basic account at once, but before a person can ask for Engineer / Foreman / Client access (or redeem an invitation code) they must **verify their identity**: legal details, a government ID (front, back where it has one) and a selfie holding it, reviewed by an administrator. Every place that collects personal data now shows a "check your information" step with the data privacy notice (RA 10173), and the acceptance is recorded with the notice version.

I did not look at, copy from or touch the EBALIK project (CLAUDE.md forbids it); the flow follows common KYC practice. If the EBALIK logic has specific steps you want mirrored, describe them and I will match them.

## Objects
| Type | Name | Notes |
|---|---|---|
| Columns | `profiles.identity_status` (unverified / pending / verified / rejected), `identity_verified_at` | everyone who existed is grandfathered as verified; the default for new accounts is `unverified` |
| Table | `identity_verifications` | one open submission per person; legal name, birth date (18+), address, phone, ID type (PhilSys, passport, driver's license, UMID, PRC, postal, voter's, SSS, PhilHealth, TIN, senior citizen, other), **only the last 4 characters of the ID number**, expiry, storage paths, consent version, decision and note. Read-only to the API: the owner, and admins with `users.approve` / `users.view` (MFA) |
| Bucket | `identity-docs` (private, 6 MB, JPEG / PNG / WebP) | path `<user id>/pending/<kind>-<time>.webp`. Upload only into one's own folder; read by the owner and reviewing admins only; the owner cannot delete a submitted or approved image; admins with `users.approve` can delete |
| RPC | `submit_identity_verification` | validates (adult, unexpired ID, files exist and are in the person's own folder, max 3 a day), sets the profile to pending, records consent, audits `identity.submit`, notifies reviewers (`identity.new`) |
| RPC | `decide_identity_verification` | `users.approve` only, never on yourself, rejection needs a reason; audits `identity.approve` / `identity.reject`; notifies the person (`identity.approved` / `identity.rejected`) |
| RPC | `withdraw_identity_verification`, `record_identity_view`, `mark_identity_docs_deleted` | the person withdraws a waiting submission; **every time an admin opens the documents it is audited (`identity.view`)**; deleting the images is audited (`identity.docs_deleted`) |
| Table + RPC | `privacy_consents`, `record_privacy_consent` | one row per person, scope and notice version; the email sign-up form passes its consent in the sign-up metadata and `handle_new_user` copies it; a pending Google sign-up can record too (0031) |
| Trigger | `profiles_trust_on_role` | when a role is granted by an administrator, the whitelist, an approved registration or an invitation, the profile is marked verified (trusted paths skip the ID check) |
| Changed | `prepare_access_request`, `redeem_invite` | refuse unless verified ("Verify your identity first...", reason `not_verified`) |

## Retention
Images are meant to be deleted by an administrator after the decision (button in the review queue; recorded in the audit log). The decision and the last 4 characters of the ID number stay. The notice text says so; change `src/lib/privacy.ts` if the company's policy differs, and bump `PRIVACY_VERSION`.

## Tests
`supabase/tests/99-identity-privacy.cases.mjs` (13 cases): defaults and grandfathering; elevated access and invitations refused until verified; form validation (adult, expired, folders, uploads); a valid submission (pending, consent, audit, reviewers told); privacy of rows and images per role (owner, other person, engineer, admin with and without MFA); review rules (view audited, only `users.approve`, reason required, not yourself); resubmission after rejection and approval unlocking access; withdrawal; deleting images; role grants marking verified; consent once per version; a pending Google account can record consent and a disabled one cannot. Older tests that make requesters now mark them verified.

## Rollback
```sql
drop trigger profiles_trust_on_role on public.profiles;
drop function public.trg_trust_on_role(), public.submit_identity_verification(text, date, text, text, text, text, date, text, text, text, text), public.withdraw_identity_verification(uuid), public.decide_identity_verification(uuid, boolean, text), public.record_identity_view(uuid), public.mark_identity_docs_deleted(uuid), public.record_privacy_consent(text, text);
drop policy "identity docs: view" on storage.objects; drop policy "identity docs: upload" on storage.objects; drop policy "identity docs: delete" on storage.objects;
-- empty and delete the bucket `identity-docs` in the dashboard, then:
drop table public.identity_verifications, public.privacy_consents;
alter table public.profiles drop column identity_status, drop column identity_verified_at;
-- restore prepare_access_request (0013), redeem_invite (0020) and handle_new_user (0029) from their migration files
```

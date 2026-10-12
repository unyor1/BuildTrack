# 0027: Client defect reports (snags)

| Field | Value |
|---|---|
| File | `supabase/migrations/0027_client_snags.sql` |
| Applied | 2026-10-12, by the agent through the BUILDTRACK_MIGRATIONS connector (project verified as `ruimjlhsfpaezkgfphsz`) |
| Depends on | 0025 (`raise_defect`, `qa_counters`, `is_staff`) |
| Status | **Applied** and verified |
| Reversible | Yes (drops client reports and their photos) |

## Purpose
The Client's "Submit Ticket" screen was sample data. Now a client reports a problem in plain words (title, place, urgency, up to 4 photos); the project engineer accepts it (it becomes an NCR for the foreman) or declines with a reason; the client follows the repair and is told when it is fixed and checked. Clients never read the QA tables: they see only their own reports and a plain "fix stage".

## Objects
| Type | Name | Notes |
|---|---|---|
| Tables | `client_snags`, `snag_photos` | numbered per project (SR-0001, via `qa_counters` kind `snag`); status submitted / accepted / declined / resolved / withdrawn; `fix_stage` mirrors the NCR |
| Bucket | `snag-photos` (private, 8 MB, JPEG/PNG/WebP) | path `<project>/<report>/<file>`; the author uploads while the report is waiting; staff of the project read; the author reads their own |
| RPC | `submit_snag` | active client of the project; max 10 a day, max 5 waiting; notifies the project engineers |
| RPC | `withdraw_snag` | the author, while waiting |
| RPC | `decide_snag` | engineer of the project (`can_edit_blueprints`); accept calls `raise_defect` (class, category, trade, foreman, due date, clause) and tells the client; decline needs a reason of 5+ characters |
| Trigger | `qa_defects_sync_snag` | when the NCR changes status the report follows; closing the NCR resolves the report and notifies the client |
| Trigger | `snag_photos_check` | author only, pending only, max 4, inside the report's folder; photos freeze after the decision |

## Security
Both tables are read-only to the API (author or staff of the project); photo rows can be added or removed only by the author while pending. Foremen and engineers of the project read all reports; other clients and outsiders read none. Disabled people lose access. `anon` cannot execute any function here.

## Tests (`supabase/tests/99-qa-snags.cases.mjs`, suite 229/229)
Who can send, notifications; no direct writes and visibility per role; photo rules (own folder, max 4, only author, only pending, frozen after decision); withdraw; the waiting limit; decide permissions and the decline reason; accept raises the NCR with the client's text and tells the client; the report follows the NCR to resolved; disabled client.

## Verification (live)
Storage rules read back with a rolled-back run as the real foreman (uploads to `snag-photos` denied, `qa-evidence` project folder allowed, another project's folder denied). The full client flow was verified in the browser against a mock backend; no real client account exists yet on the live project.

## Rollback
```sql
drop trigger qa_defects_sync_snag on public.qa_defects;
drop function public.sync_snag_with_defect(), public.submit_snag(uuid, text, text, text, text), public.withdraw_snag(uuid), public.decide_snag(uuid, boolean, text, text, text, text, uuid, date, text), public.check_snag_photo();
drop policy "snag photos: view" on storage.objects; drop policy "snag photos: upload" on storage.objects; drop policy "snag photos: delete" on storage.objects;
drop table public.snag_photos, public.client_snags;
alter table public.qa_counters drop constraint qa_counters_kind_check, add constraint qa_counters_kind_check check (kind in ('ir', 'ncr'));
```

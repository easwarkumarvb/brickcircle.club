# Person-first server read model: staged source

Status: **proposal only; not an active migration, not applied, not browser-integrated, not runtime-verified**. Stage B is incomplete. The production application continues using existing protected reads and canonical writers.

`supabase/proposals/person_first_conversation_read_model.sql` provides an executable starting point for a participant-safe feed and durable per-user read cursor. The database runtime (PostgreSQL/Docker) is unavailable in this workspace. Supabase CLI 2.120.0 was subsequently made available through npx, but no database migration was generated or applied. No migration filename was invented: create the migration with `supabase migration new person_first_conversation_read_model` in a disposable local environment after review. No hosted database was changed.

## Browser contract after verification

| RPC | Inputs | Output / behavior |
| --- | --- | --- |
| `collector_conversation_feed` | `p_peer_id`, optional complete `p_before_at` / `p_before_type` / `p_before_id`, `p_limit` 1–100 | Newest-first rows: `occurred_at`, `source_type`, `source_id`, `case_id`, `payload`. Types are `direct_message`, `case_message`, `case_event`. |
| `mark_collector_conversation_read` | Peer plus the complete tuple of a visible authorized feed row | Only the current user's cursor advances; stale calls return the saved later cursor. |

Identity always comes from `auth.uid()`, never a supplied viewer ID. All exposed RPCs use `SECURITY INVOKER`, an empty search path, authenticated-only execute grants and existing participant RLS. Case-message rows additionally require exact participant sender/recipient membership. No private payload is exposed by a privileged view or service key.

Use the last returned tuple for older-page requests; reverse each page for chronological display. Deduplicate by `(source_type, source_id)`, because IDs alone do not identify a source. Retain exact `case_id` for contextual replies; viewing a feed row never selects a send destination. Case status, issues, reviews and physical-item controls remain separate canonical reads/writes.

Advance read state only after content is displayed, never on notification receipt, inbox retrieval or loading an unrelated conversation. The cursor table permits owner-only direct bookkeeping writes because invoker RPCs need table privileges; those writes cannot change messages/custody or another user's cursor. RPC validation and monotonicity are guarantees of the RPC, not a claim that owner direct writes are tamper-proof. No delivery/read receipt for the other collector is exposed.

## Performance boundary

Each of three source branches returns at most the requested page size before an outer merge capped at 100 rows; payload transfer is bounded. Message pair/time/ID indexes support keyset retrieval. Existing per-case event indexes and new pair indexes support joins. **This does not prove bounded database work:** many historical cases can still require substantial event sorting. Validate plans with representative histories before enabling it.

The proposal deliberately has no fake bounded inbox RPC. Limiting global message history loses older collectors; global `DISTINCT`/grouping still scans history. A complete implementation requires server-maintained participant feed projections and peer summaries with `(user_id, last_at DESC, peer_id DESC)` indexes. Summary pagination then preserves older peers without reading every message.

That next step must specify transactional source-to-projection triggers/backfill, immutable source/type IDs, explicit participant ownership, deletion/retention handling, independent active-case summaries and correct unread changes under concurrent incoming messages and read advances. Privileged internal trigger functions, if required, belong in the private schema with revoked public execute privileges; exposed reads remain invoker functions and owner RLS. Recheck canonical source authorization when resolving projection payloads.

Do not derive exact unread counts by subtracting arbitrary client timestamps or by claiming a device watermark is server-backed. Incoming rows at or below an existing tuple, source backfills and non-message system events need an explicit unread policy. Until peer summaries/counters exist and are tested, the UI continues to label its current counts as device-local.

## Verification gate

Install only in a disposable local PostgreSQL database containing the established baseline and migrations. Run `supabase/tests/person_first_conversation_read_model.sql`; it rolls back its fixtures and requires three adult profiles and a nonterminal case. Verify anonymous execute denial, outsider suppression, cross-owner cursor denial, exact cursor validation, monotonic RPC updates, equal-time/source tie pagination and two participants' independent cursors.

Run EXPLAIN ANALYZE for zero-history, one peer with many cases, many peers, 100k messages, equal timestamps and large unread histories; test source-level failures and concurrent insertion between pages. Run database advisors and grant/policy audits. Then generate/verify the migration via CLI and extend isolated browser fixtures and immutable hosted staging tests. No part of this source proposal substitutes for SQL runtime evidence or the full real-account exchange journey.

# Person-first server read model

Status: **implemented as an additive development migration; not applied to any hosted database; browser integration implemented; SQL and browser runtime evidence pending**.

The earlier `supabase/proposals/person_first_conversation_read_model.sql` remains a superseded design reference. The CLI generated `supabase/migrations/20261012083443_person_first_conversation_projection.sql` using pinned Supabase CLI 2.120.0. Use the migration, not the proposal, for disposable validation. No canonical message/exchange RPC, existing source RLS, item lock, custody transition or production configuration is replaced.

## RPC contract

| RPC | Inputs | Result |
| --- | --- | --- |
| `list_collector_conversations` | optional complete `p_before_at` / `p_before_peer`, `p_limit` 1–50 (default 30) | `peer_id`, `last_at`, `last_type`, `last_id`, text `preview`, `unread_count`, `active_case_count`, newest first |
| `collector_conversation_feed` | `p_peer_id`, optional complete `p_before_at` / `p_before_type` / `p_before_id`, `p_limit` 1–100 (default 50) | `occurred_at`, `source_type`, `source_id`, `case_id`, full canonical row `payload`, newest first |
| `mark_collector_conversation_read` | peer plus complete tuple of a displayed authorized feed row | Saved own-user cursor; stale RPC updates never move it backward |

Feed kinds are `direct_message`, `case_message`, `case_event`. Sort ties use C-collated type followed by UUID; deduplicate by `(source_type, source_id)`. The browser reverses pages for chronological display and uses the final returned tuple for older-page retrieval. Inbox pagination uses `(last_at, peer_id)`; reading only the newest messages can no longer lose older collectors.

Keep exact case IDs for explicit contextual reply, never infer send destination from viewing a feed row. Canonical case/issue/review data still determines action permissions. `active_case_count` means nonterminal cases, **not** an invented count of actions awaiting the current collector.

## Authority and security

Projection and summaries are derived owner-RLS tables. They store source references and bookkeeping, never message bodies or event payloads. Authenticated clients can select only their own projection/summary rows and cannot update them. Exposed RPCs use `SECURITY INVOKER`, an empty search path and authenticated-only execute grants. Every feed payload and inbox preview resolves through actual source tables with existing RLS and explicit exact-participant checks; an outsider cannot resolve another pair by supplying IDs.

Four private definer functions maintain derived data through source/read-cursor triggers. All have an empty search path and revoked public/anon/authenticated/service-role execute privileges. Their authority is limited to derived tables. Source writes remain governed by existing canonical writers/policies. Owner cursor table insert/update is permitted for invoker RPC operation, but its trigger validates owner, immutable owner/peer identity, exact canonical source tuple, projection membership and monotonicity, including direct API writes.

## Unread and concurrency semantics

Unread counts include incoming direct and case messages only; system events never count as unread. Initial history backfill counts all incoming history unread because device-only timestamps are not durable cross-device evidence. A received/backfilled row at or below an existing read tuple is considered read. This ordering policy is explicit; it does not invent delivery/read receipts for the other collector.

Read advancement happens only after display. Source insert/update/delete bookkeeping and read advancement serialize on the same owner/peer summary row. Cursor writers acquire cursor row locks before summary locks; source writers never acquire cursor row locks, avoiding a reversed dependency. Two owners are updated in stable UUID order. Active-case counts likewise lock both participant summaries before recounting, so concurrent changes to different cases cannot publish a stale count. Idempotent canonical retries create no extra source row, and projection primary keys also prevent duplicate bookkeeping.

A read recount includes committed rows strictly after its tuple. A concurrent insert that waits behind that read sees the saved tuple and increments if newer. An insert committed before a waiting read is included by the subsequent recount. Deleting an incoming unread source decrements the counter; deleting the latest source recomputes the last reference from the indexed projection. Timestamp/body corrections delete and reinsert the derived reference. Case deletion cleans residual case references.

## Performance and rollout limits

Indexed projection retrieval seeks by the peer cursor, resolves canonical source authorization, and then returns at most 100 feed rows. Inbox resolves each peer’s actual authorized latest feed row before filtering its cursor and returning at most 50 summaries. Denied newer references never imply an empty end-of-history page while older authorized rows remain. Read advancement may recount a large unread range, and source corrections/deletions require bookkeeping; those mutation costs must be measured. Active-case writes use a partial pair index. No performance benchmark or query-plan evidence is claimed before CI/database validation.

Source RLS rejection filters references before the final page limit. Heavily denied histories can require scanning many references, and inbox ordering may inspect many peer summaries; payload size is bounded but worst-case database work is not constant. Query-plan and denied-history benchmarks remain required. Canonical participant identities are treated as stable. Privileged participant reassignment is outside ordinary exchange operations and requires an explicit projection reconciliation before serving the moved relationship; source checks still fail closed in the interim. Dynamic changes to source-read policy can likewise leave conservative counters until reconciliation. Avoid claiming exact unread counts for a newly restricted relationship.

Backfill runs in the same transaction as trigger creation under source-table locks. It can block writers while reading historical data. Benchmark production-sized history in staging before proposing a production migration. It does not delete messages, accounts or historical exchange evidence.

## Verification

`.github/workflows/person-conversation-read-model.yml` uses a disposable loopback PostgreSQL 17 service with no hosted credentials, deployment or production connection. It loads the established QA canonical baseline/legacy history and canonical + guided message migrations; `qa/person_conversation_setup.sql` explicitly supplies production-equivalent participant message RLS absent from the minimal baseline. This distinction prevents accidentally treating a permissive test table as RLS evidence. The established `supabase/tests/canonical_exchange_state_machine.sql` suite runs after the projection migration with all new derived triggers active, so custody transitions, locks and idempotency are checked against the combined schema. No canonical source guard is disabled.

`qa/person_conversation_projection_test.sql` tests history backfill, >1000 newer messages without losing an older peer, equal-timestamp pagination, independent source IDs, multi-case one-person grouping, idempotent contextual writes, strict cursors/limits, outsider suppression, denied cross-owner writes, derived-table immutability, source-RLS revalidation and delete counters. `qa/person_conversation_race_test.py` uses two actual concurrent sessions for both incoming/read lock orders, concurrent distinct-case insertions and concurrent case close/accept changes. Python syntax compiles locally. SQL tests and query plans must pass in cloud CI before reporting runtime success.

The earlier proposal SQL test remains unexecuted and is not the release gate. Remaining gates include representative EXPLAIN ANALYZE, complete browser integration tests, immutable hosted staging with real accounts/outbox-only notifications, and phone inspection. No hosted/production migration is authorized by this development artifact.

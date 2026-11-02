# Repeat-match history rollout

The additive migration `20261102080225_repeat_exchange_match_history.sql` must be applied before releasing the updated `app-v3.js`; the frontend calls its participant-scoped `shared_exchange_history` RPC and paged `shared_exchange_history_page` RPC. The migration also replaces reciprocal-match notification generation and its availability/profile triggers.

Deploy the updated `send-web-push` Edge Function with the frontend so push payloads use repeat-aware notification metadata. The existing email worker already renders the database notification title and body. Validate both participants, A-C privacy, history paging, eligibility, and idempotent rediscovery using the isolated SQL/browser tests before any staging rollout.

Local source verification for this change ran the migration and SQL regression against the disposable loopback PostgreSQL 15 `repeat190` database, and 24 focused isolated Chromium history/push/email tests passed. TypeScript, repository syntax, release synchronization, and whitespace checks passed. CI is configured for PostgreSQL 17; the separate conversation concurrency script was not run locally because it hard-codes its disposable CI database at `127.0.0.1:5432/conversation_read_model`, and its guard was not bypassed. These checks do not authorize hosted database changes, deployment, or notification delivery.

# Isolated projection capacity evidence

This QA-only proposal checks frozen product PR138 head `614c05d5d92d1beb6929bbc9d1445bb0796ba08d` using a disposable PostgreSQL17 GitHub service. Its branch and main automatic deployments are disabled. It never uses GitHub secrets, Supabase endpoints, hosted identities or notification providers, and does not modify the product branch.

The benchmark creates 10,000 additional synthetic direct messages before applying the exact candidate projection migration transactionally: 61 owner/collector pairs, including a 4,000-message dense pair. It verifies authenticated-role RLS, outsider isolation, inbox pages 30/30/1, dense-feed pages 50/50 and nonoverlapping exact cursors. It records five EXPLAIN ANALYZE samples per query, buffers, transactional migration wall time and observed source locks. `auto_explain` captures actual nested invoker-function query plans; top-level Function Scans are explicitly insufficient to claim index use. A separate controlled lock probe confirms reads remain compatible and source writes wait for the migration lock mode.

Artifacts retain cardinalities, migration hash, SQL execution and subprocess wall timings, actual nested plans and limitations. This is a bounded capacity check, not a production SLO or throughput certification. Existing case/event fixture size is small; hosted database hardware, network/pooler latency, large-scale mixed workloads and concurrent production traffic are not represented. The migration holds source write locks until transaction commit, so its real production duration needs an explicit maintenance-window assessment before production approval.

Workflow result and timings are pending execution. No merge or production/staging change is authorized.

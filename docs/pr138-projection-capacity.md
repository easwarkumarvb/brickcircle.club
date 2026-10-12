# Isolated projection capacity evidence

This QA-only proposal checks frozen product PR138 head `614c05d5d92d1beb6929bbc9d1445bb0796ba08d` using a disposable PostgreSQL17 GitHub service. Its branch and main automatic deployments are disabled. It never uses GitHub secrets, Supabase endpoints, hosted identities or notification providers, and does not modify the product branch.

The benchmark creates 10,000 additional synthetic direct messages before applying the exact candidate projection migration transactionally: 61 owner/collector pairs, including a 4,000-message dense pair. It verifies authenticated-role RLS, outsider isolation, inbox pages 30/30/1, dense-feed pages 50/50 and nonoverlapping exact cursors. It records five EXPLAIN ANALYZE samples per query, buffers, transactional migration wall time and observed source locks. `auto_explain` captures actual nested invoker-function query plans; top-level Function Scans are explicitly insufficient to claim index use. A separate controlled lock probe confirms reads remain compatible and source writes wait for the migration lock mode.

Artifacts retain cardinalities, migration hash, SQL execution and subprocess wall timings, actual nested plans and limitations. This is a bounded capacity check, not a production SLO or throughput certification. Existing case/event fixture size is small; hosted database hardware, network/pooler latency, large-scale mixed workloads and concurrent production traffic are not represented. The migration holds source write locks until transaction commit, so its real production duration needs an explicit maintenance-window assessment before production approval.

## Recorded run

The [pull-request capacity run](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38274166345) passed on QA commit `25604b4216ffb7dbfeb9eafa0992f449e9d3648d`; the independent [branch-push run](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38274162853) also passed. Both tested frozen product head `614c05d5d92d1beb6929bbc9d1445bb0796ba08d`. PostgreSQL was 17.11. The projection migration SHA256 was `9af5765cc888c5edec390c0117b1e5e32944ed72ddc88855893f38612ec20dd2`.

The pull-request run contained 11,002 total direct-message rows, 22,020 projected entries and 136 summaries. The synthetic owner had exactly 10,000 projected entries and 61 summaries; its dense pair had 4,000 entries. Authenticated-role owner isolation and outsider denial passed, with nonoverlapping inbox pages 30/30/1 and dense-feed pages 50/50.

| Operation | Median SQL execution | Maximum of five samples |
|---|---:|---:|
| Inbox 30 | 23.388 ms | 23.626 ms |
| Inbox 30 with cursor | 23.263 ms | 23.558 ms |
| Dense feed 50 | 6.270 ms | 6.407 ms |
| Dense feed 50 with cursor | 6.270 ms | 6.408 ms |

The transactional migration completed in 556.45 ms wall time, including client startup, sampled lock-observation overhead and commit. Actual migration sampling observed granted ShareRowExclusiveLock on all four source tables, plus reads and the index-creation ShareLock on exchange_cases. The separate three-second diagnostic lock probe allowed a source read while a source update reached its explicit 250 ms lock timeout. Its intentional hold is excluded from migration timing.

Actual nested plans recorded `collector_entries_peer_feed_idx` and `messages_pkey` for feed queries, and additionally `collector_summaries_inbox_idx` for inbox queries. This identifies indexes observed in these plans; it does not mean every join used an index, that only 30/50 source rows were inspected, or that planning will be identical on production. The inbox still derives authorized latest activity for the owner's 61 pairs before its final limit.

The [retained artifact](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38274166345/artifacts/11759055117) includes report JSON, the migration log, twenty EXPLAIN ANALYZE JSON samples with buffer counts and four actual nested-plan logs. This bounded gate passed; the limitations above still apply. No merge or production/staging change is authorized.

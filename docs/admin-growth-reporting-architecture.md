# Administrator growth reporting

The read-only `public.admin_growth_report(p_days integer default 28)` RPC computes one version 1 JSON aggregate response from server-owned records. It accepts 7, 28 or 90 only. No analytics table, browser service key, scheduled job or new public raw-data endpoint is created. The existing administrator UI consumes this report with the signed-in collector session.

## Authorization and data ownership

The SECURITY DEFINER function fixes `search_path=''` and qualifies every table/function. Its first executable statement is `private.assert_marketplace_admin()`: the existing trusted `private.exchange_admins` allowlist, matching live `auth.sessions` record and AAL2 requirement. Authorization precedes parameter validation and every source query. PUBLIC, anon and service_role have no execute grant; authenticated can execute only through that internal gate. Revoking the session or allowlist takes effect immediately. No user metadata grants access.

Only counts, UTC timestamps, country/city labels, coverage notes and definitions leave the RPC. Auth identities, emails, messages, item IDs, photos, addresses, support descriptions and credentials do not. Missing frontend reports/keys must remain unavailable; zero returned by COUNT is a real zero, not a substitute for a failed request.

## Time and contract

`end_at` and `generated_at` are transaction `now()`. The selected window starts at UTC midnight `p_days-1` calendar dates before today and ends at `end_at`, exclusively. Thus exactly `p_days` UTC daily rows include today, which is partial. The previous window ends at selected `start_at` and has exactly the same elapsed duration. All events use `[start,end)`, including the previous/current boundary. This is deliberately not a completed-calendar-week comparison. Daily sums reconcile with registration/completion KPIs. Database session timezone does not affect boundaries or daily labels.

Version 1 contains `version`, `days`, `generated_at`, `start_at`, `end_at`, `previous_start_at`, eight `metrics` with `{current,previous}`, `activation`, `exchange_cohort`, ordered `daily`, bounded `cities`, current `health`, `coverage` and `definitions`. Daily contains exactly the selected number of dates, including explicit zero days. Cities contains at most 20 rows sorted by registered descending, then country/city for deterministic ties. Results are one aggregate statement and one consistent PostgreSQL statement snapshot after the gate.

## Metric definitions

| Key | Source and meaning |
| --- | --- |
| new_registrations | `auth.users.created_at`; client-writable profile dates are not signup evidence. |
| active_exchange_collectors | Distinct non-null `exchange_case_events.actor_user_id` with events in the window. Visits, logins and system events without an actor are excluded. |
| proposals | Canonical `exchange_cases.created_at`, regardless of later outcome. |
| accepted / handoffs | Canonical `accepted_at` / actual `handoff_at` in the window. |
| completed_exchanges | Current canonical state COMPLETED and `completed_at` in the window. |
| repeat_collectors | Distinct participants with a completion in the window and at least two lifetime canonical completions before that window end. Both participants count, each at most once. |
| cancellations | Canonical `cancelled_at`; declines, withdrawals and expiries are not silently relabeled cancellations. |

Activation uses the selected registration cohort. `registered` is account creation; `email_verified` has Auth confirmation before report end. `ready` describes CURRENT readiness: verified email, adult-confirmed profile, display name, nonempty country and normalized city, at least one owned collection item with primary owner photo, and at least one wishlist entry. It cannot establish the date a collector first became ready. This is a current inventory/profile snapshot, not an invented historical activation series.

The exchange cohort selects cases created during the window, then counts their accepted, handed-off, completed and cancelled stages before report end. Recent cohorts are still maturing. Completion activity divided by proposal activity is not a cohort conversion rate and must never be presented as one. Imported legacy histories can lack original stage timestamps; no synthetic timestamps are inferred.

City groups use trimmed lower-case country and the existing country-aware normalized city, retaining the country key to avoid merging names across countries. Registered/ready are current account/location snapshots across all account ages. Available sets use current availability preference, primary photo, no owner review requirement and no canonical item lock. These inventory counts do not reproduce reciprocal matching, value constraints, blocks or every exchange eligibility rule and are not match opportunities. Selected-window completed cases touch either currently located participant; a case with both participants in one city counts once in that city. Moving city changes this snapshot, and cross-city cases can appear in more than one row.

Health is current and independent of the selected reporting period. Active custody requires actual `handoff_at` and nonterminal case state; overdue returns require that custody plus a past due timestamp. Unresolved issues count distinct canonical cases with non-resolved `exchange_case_issues` or legacy HANDOFF_ISSUE/DISPUTED state. Open support honors the administrator revision status, falling back to canonical support `closed_at`. A support resolution does not change exchange state.

## Validation and rollout limits

`.github/workflows/admin-growth-report.yml` applies the existing canonical/admin migrations and this additive migration to a fresh PostgreSQL 17 service. `qa/growth_report_setup.sql` supplies production-compatible Auth claims/session fields missing from the existing minimal QA base. `supabase/tests/admin_growth_report.sql` calls the RPC under real anon/authenticated roles and rolls back its fixtures. Claims are simulated exclusively in that disposable database; the test must never be run against hosted Auth.

Tests cover anonymous and ordinary-user denial, forged metadata, AAL1, absent/expired/deleted session, revoked allowlist, gate-before-invalid-input, allowed/invalid days, half-open signup/completion boundaries, null actors, repeated participants, cohort censoring, daily reconciliation, zero previous count, custody/overdue semantics, city case deduplication, bounds and sensitive-field omission. Source-only local work does not apply migrations, merge, deploy, or touch production. The current development environment lacks PostgreSQL executables; the real SQL suite is configured for CI and is not claimed as locally executed.

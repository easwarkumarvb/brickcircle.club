# BrickCircle staging and hardening

## Production rule
Never create synthetic auth users, exchanges, reviews, meetups, returns, or load-test rows in the production Supabase project (`nsxtromjdpdscknadxez`). Production checks are read-only smoke checks only.

## Staging
Create a Supabase development branch/project and configure GitHub secrets:
- `BC_STAGING_URL`
- `BC_STAGING_PUBLISHABLE_KEY`
- `BC_E2E_USER_A_EMAIL`
- `BC_E2E_USER_B_EMAIL`
- `BC_E2E_PASSWORD`

Run schema migrations and destructive E2E fixtures only there.

## Privacy rollout
1. `public_profiles` is the only cross-member profile source.
2. `profiles` remains the signed-in member's private account record.
3. No UI may query another member through `profiles`.
4. After all cross-profile reads are migrated, apply the stage-2 migration that changes `profiles` SELECT to owner-only.

## Observability
- Set `BC_OBSERVABILITY.sentryDsn` in deployment configuration to activate Sentry.
- Client match RPC timing is sampled into `product_metrics` as `find_matches_ms`.
- Query `match_latency_percentiles(interval '24 hours')` with service-role/admin access for p50/p95/p99.

## Catalogue
The next frontend module must treat LEGO catalogue data as cacheable public reference data. Prefer a static/edge-cached JSON snapshot with Supabase as fallback, refreshed after catalogue changes rather than on every page load.

## Matching evolution
Keep the current on-demand reciprocal matcher until real telemetry shows it is approaching latency/cost limits. Then introduce event-driven/precomputed candidates; do not add that complexity before usage warrants it.

## Deployment baseline
This hardening branch is rebased onto the current production `main` before merge so newer UX, analytics and SEO changes are preserved.

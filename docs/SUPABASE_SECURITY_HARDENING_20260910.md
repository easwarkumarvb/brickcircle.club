# Supabase browser privilege hardening — 2026-09-10

## Scope

This change is forward-only and does not rewrite production migration history. It closes confirmed browser-facing privilege gaps while preserving the current application and exchange workflow.

## Confirmed fixes

- Revoke anonymous and signed-in execution of the trigger-only `bc_assign_founding_member()` helper.
- Restrict the global `bc_growth_funnel_snapshot()` aggregate to `service_role`.
- Remove anonymous execution from the four application RPCs that are called only after authentication:
  - `bc_founder_status()`
  - `bc_liquidity_status()`
  - `bc_membership_status()`
  - `bc_my_referral_code()`
- Remove browser `USAGE` from three internal sequences.
- Make future functions private to browser roles by default. Each new client RPC must receive an explicit grant.

## Preserved authenticated RPCs

The exchange, meetup, return, review, referral and matching RPCs remain callable by `authenticated` because the application needs them. Production definitions were reviewed: each obtains `auth.uid()` and validates ownership, participation or the current user before accessing privileged rows.

## Advisor findings not changed here

- Tables with RLS but no policies are internal tables. Production ACL inspection confirmed that neither `anon` nor `authenticated` has direct `SELECT`; RLS therefore remains an additional deny layer.
- Moving `pg_trgm` out of `public` is deferred because it changes extension and dependent-index ownership and is unrelated to the reported browser privilege exposure.
- Leaked-password protection is a hosted Auth configuration change, not a database migration. It should be enabled separately after confirming plan availability and sign-in behavior.

## Verification

- Exact migration validated against the production schema inside a transaction and rolled back.
- PostgreSQL 17 CI covers anonymous, authenticated, trigger and service-role execution.
- The test proves that revoking direct trigger-function execution does not stop the trigger itself.
- No production mutation is part of this PR.

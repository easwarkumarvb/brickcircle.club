# BrickCircle Growth Engine V2

Growth Engine V2 is a backend-first marketplace-liquidity automation layer built on the existing Supabase collections, wishlists, member notifications, growth events, referrals and email outbox.

## Automations

- Activation journey: immediate next-best-action plus Day 1 and Day 3 nudges until a member has a collection item, at least one exchangeable set and at least one wishlist item.
- Reciprocal-match alert: when both sides of a local exchange graph exist, notify the collector and route them to Matches.
- Near-match demand: when a local collector wants an owner's exchangeable set but reciprocity is missing, nudge the owner to expand their wishlist.
- City-liquidity campaign: once at least three match-ready members exist in a city/country pair, create a weekly local-activity notification.
- Set-demand campaign: when at least two collectors in the same city want an owner's exchangeable set, create a weekly demand notification.
- Dormant reactivation: match-ready members with no growth activity for 14 days receive a weekly reactivation nudge.
- Email bridge: every new member growth notification is copied into the existing server-only email_outbox. Real sending remains fail-closed until the Resend/worker secrets are configured.

## Cadence and safety

`pg_cron` runs `bc_run_growth_campaigns(500)` hourly at minute 17. Notification dedupe keys prevent repeat delivery of one-time activation messages and constrain near-match/city/demand/reactivation campaigns to weekly buckets. The campaign engine never exposes another member's email or private profile fields.

## Funnel metrics

`bc_growth_funnel_snapshot()` reports:

- total members
- members with collection data
- members with at least one exchangeable set
- members with wishlist demand
- match-ready members
- members who have received match alerts
- exchange requesters
- accepted exchange requests
- completed exchanges

These are the core marketplace activation/liquidity KPIs. The primary product KPI is match-ready members / total members, followed by accepted exchanges / match-alerted members.

## Current production baseline (2026-08-26)

At V2 activation the production database contained 5 members, 3 with collections, 2 with exchangeable inventory, 3 with wishlists, 2 match-ready members, 2 members with match alerts, 3 exchange requesters, 1 accepted request and 0 completed exchanges. These are beta-scale counts and should not be interpreted as traction claims.

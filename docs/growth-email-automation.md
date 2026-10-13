# BrickCircle growth email automation

The production Supabase project has a server-only `email_outbox` table and a deployed `send-growth-email` Edge Function.

## Security model

- Browser roles (`anon`, `authenticated`) have no access to `email_outbox`.
- The worker uses the Supabase service-role key available only inside Edge Functions.
- The worker endpoint is protected by `GROWTH_EMAIL_WORKER_SECRET` in the `x-brickcircle-worker-secret` header.
- The worker fails closed if any required secret is missing.

## Required secrets before enabling delivery

Set these in Supabase Edge Function Secrets:

- `RESEND_API_KEY`
- `EMAIL_FROM` (for example `BrickCircle <updates@brickcircle.club>` after the domain is verified with the mail provider)
- `GROWTH_EMAIL_WORKER_SECRET` (a long random value)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase to deployed Edge Functions.

## Queued notification types

The database trigger queues email work for onboarding, wishlist/availability nudges, reciprocal match alerts, exchange requests/acceptance, and overdue returns.

## Scheduling

Do not schedule the worker until the three required secrets above are configured. After that, invoke the Edge Function on a recurring schedule using Supabase Cron/pg_net or another trusted scheduler and pass the worker secret header.

The worker processes up to 10 pending rows per invocation, retries transient failures with exponential backoff, and stops retrying after five attempts.

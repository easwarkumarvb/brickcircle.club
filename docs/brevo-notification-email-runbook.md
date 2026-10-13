# Marketplace notification email runbook

This channel is additive. `public.notifications` remains authoritative for in-app notifications. The database trigger only creates a server-owned delivery row for an explicit allowlist of high-value marketplace events; it does not call Brevo inside the marketplace transaction.

## Required secrets and sender setup

- Verify `notifications@brickcircle.club` as a Brevo sender (including the domain authentication Brevo requests).
- Set the Edge Function secret `BREVO_API_KEY` to a restricted Brevo transactional-email API key.
- Generate a separate high-entropy value for `EMAIL_DELIVERY_WEBHOOK_SECRET`.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed Supabase Edge Functions. Never expose any of these values in browser code or repository files.

The worker always sends as `BrickCircle <notifications@brickcircle.club>` with Reply-To `BrickCircle Support <support@brickcircle.club>`. Recipient addresses are resolved with `auth.admin.getUserById()` from the queued recipient user ID; webhook payloads cannot provide or override them.

## Asynchronous invocation

Deploy `send-notification-email` with JWT verification disabled because it authenticates a server-to-server secret header. Configure a Supabase Database Webhook on INSERT to `public.notification_email_deliveries`:

- URL: the deployed `send-notification-email` function URL
- Header: `x-brickcircle-email-secret: <EMAIL_DELIVERY_WEBHOOK_SECRET>`

Configure a scheduled server-side POST to the same URL and header at least every five minutes with `{}` as the JSON body. This recovers missed webhooks, retries transient failures, and reclaims jobs whose worker stopped for more than ten minutes. Database Webhooks use `pg_net` asynchronously after commit, so rolled-back marketplace transactions cannot send email.

The function processes at most 20 due rows per scheduled request and at most one row for a webhook. Transient network, 408, 429, and 5xx failures retry after 1 and 5 minutes, then stop permanently after the third attempt. Brevo also receives a deterministic `Idempotency-Key` per source notification.

## Verification and monitoring

Before enabling the webhook, run the PostgreSQL notification-email regression, Edge Function type-check, focused isolated tests, and release gates. After enabling it in a non-production environment, create one allowlisted test notification and confirm:

1. the in-app notification exists;
2. one delivery row reaches `sent`;
3. `recipient_email` is the Auth email for the notification owner;
4. `provider_message_id` is recorded;
5. the sender and Reply-To domains pass authentication.

Monitor counts and oldest `next_attempt_at` grouped by `status`. Treat `permanent_failure`, a growing due backlog, or repeated authorization failures as alerts. Delivery rows and errors are service-role-only and must not be exposed in member support screens.

## Rollback

First disable the Database Webhook and scheduled invocation. Rolling back the application channel does not require deleting in-app notifications or changing exchange data. If code rollback is required, remove the `marketplace_notification_email_outbox` trigger and stop the worker; retain delivery rows for diagnosis. Drop the two functions and delivery table only in a separately reviewed migration after retention requirements are confirmed.


# Email delivery runbook

The marketplace notification email worker and new-member registration alert both send through the same GoDaddy mailbox. This delivery channel is additive: `public.notifications` remains authoritative for in-app notifications, and Auth/marketplace transactions do not wait for SMTP delivery.

## SMTP account and Supabase secrets

This setup assumes GoDaddy Professional Email powered by Titan. It uses `smtpout.secureserver.net` with implicit TLS on port 465. The sender and reply-to address are `hello@brickcircle.club`.

Configure these Supabase Edge Function secrets in each project:

- `GODADDY_SMTP_USERNAME`: the GoDaddy mailbox login, normally `hello@brickcircle.club`.
- `GODADDY_SMTP_PASSWORD`: the password for that mailbox.
- `EMAIL_DELIVERY_WEBHOOK_SECRET`: a separate high-entropy webhook secret used by the server-to-server delivery trigger.

The SMTP credentials are shared by `send-notification-email` and `send-registration-email`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never expose those or the SMTP credentials in browser code or the repository. The workers send directly through the GoDaddy mailbox rather than a transactional email API provider.

The mailbox must be enabled for authenticated SMTP sending. If the GoDaddy mailbox uses a different product, such as Microsoft 365, confirm its SMTP endpoint and port before deployment; the worker currently targets the Titan endpoint.

## Marketplace notification delivery

The database trigger only creates a server-owned delivery row for the explicit high-value event allowlist; it does not send mail inside the marketplace transaction. Recipient addresses are resolved server-side with `auth.admin.getUserById()` from the queued user ID. Webhook payloads cannot choose or override a recipient.

Deploy `send-notification-email` with JWT verification disabled because the function checks the independent `x-brickcircle-email-secret` header. Configure a Supabase Database Webhook on INSERT to `public.notification_email_deliveries`:

- URL: the deployed `send-notification-email` function URL
- Header: `x-brickcircle-email-secret: <EMAIL_DELIVERY_WEBHOOK_SECRET>`

Configure a scheduled server-side POST to the same function at least every five minutes with the same header and an empty JSON body. This recovers missed webhooks, retries transient failures, and reclaims jobs whose worker stopped for more than ten minutes. Database Webhooks use `pg_net` asynchronously after commit, so rolled-back marketplace transactions cannot send email.

The worker processes at most 20 due rows per scheduled request and at most one row for a webhook. Transient SMTP 4xx responses and network failures retry with bounded delays and stop after the third attempt. Permanent SMTP rejections are recorded as permanent failures.

SMTP has no provider-level idempotency key. Each message uses a stable Message-ID and delivery header for diagnosis, but if GoDaddy accepts a message and the function loses the connection before recording success, a retry could send a duplicate. Monitor retry counts and delivery status. GoDaddy describes its SMTP settings as intended for standard sending and receiving, so monitor sending limits and account notices as notification volume grows.

## Registration alert delivery

For each newly inserted Auth user, a private outbox row is created. The registration worker sends an alert to the fixed owner address `hello@brickcircle.club`, including the new member's name (when available), Auth email, and account creation time. It never includes passwords, tokens, or submitted form values.

Configure a Database Webhook on INSERT to `public.registration_email_deliveries`, targeting `send-registration-email` and using the same `x-brickcircle-email-secret` header. Add a scheduled POST to this function at least every five minutes for missed events and retry recovery.

## Staging verification

Before enabling provider delivery, use disposable staging accounts and confirm:

1. Marketplace notifications still appear in-app and eligible events create one delivery row.
2. One marketplace delivery row reaches `sent` and the email arrives at the recipient's Auth email.
3. A staging registration creates one outbox row and sends one alert to `hello@brickcircle.club`.
4. Repeated scheduled calls do not resend rows already recorded as sent.
5. The SMTP message ID and last error are recorded without exposing SMTP credentials.

Do not use real member accounts for these checks. Delivery rows contain email addresses and remain service-role only.

## Disable and rollback

Disable both delivery webhooks and scheduled invocations before stopping the workers. In-app notifications and account registration continue if SMTP fails. Keep delivery rows for diagnosis; do not delete them as part of provider rollback. The forward migration preserves completed rows' provider history and changes new/unsent delivery rows to `godaddy_smtp`.

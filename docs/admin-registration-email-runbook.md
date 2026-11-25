# New member email alerts

Each newly inserted row in `auth.users` creates one row in the private
`registration_email_deliveries` outbox. The registration request only writes to
Postgres; a separate Edge Function sends the alert asynchronously to the fixed
owner address `hello@brickcircle.club`. The email contains the registrant's
display name (when available), Auth email, and account creation time. Passwords,
tokens, and submitted form values are never included.

The database webhook payload cannot select the recipient. The recipient is a
server-side constant in `supabase/functions/send-registration-email/index.ts`.
The outbox and claim function are unavailable to browser roles.

## Setup

The registration worker sends through GoDaddy Professional Email powered by
Titan using SMTP over implicit TLS on port 465. The sender and recipient are
both `hello@brickcircle.club`. Configure these Supabase Function secrets:

- `GODADDY_SMTP_USERNAME`: the GoDaddy mailbox address, normally
  `hello@brickcircle.club`.
- `GODADDY_SMTP_PASSWORD`: that mailbox's password.
- `EMAIL_DELIVERY_WEBHOOK_SECRET`: a separate high-entropy webhook secret.

The SMTP host (`smtpout.secureserver.net`) and port (465) are fixed in the
function. Never put any of these values in the repository or browser code.

1. Deploy `send-registration-email` with JWT verification disabled:
   `supabase functions deploy send-registration-email --no-verify-jwt`. It
   authenticates requests with the independent
   `x-brickcircle-email-secret` header.
2. Apply
   `20261125090000_admin_registration_email_notifications.sql` through the
   normal migration process.
3. Configure a Supabase Database Webhook for INSERT on
   `public.registration_email_deliveries`, targeting the deployed
   `send-registration-email` Edge Function. Add the header
   `x-brickcircle-email-secret: <EMAIL_DELIVERY_WEBHOOK_SECRET>`.
4. Configure a scheduled server-side POST to the same function at least every
   five minutes with the same secret header and `{}` body. This recovers missed
   webhooks and retries temporarily failed deliveries.

## Verify in staging

Register a new staging account and confirm that one outbox row is created and
reaches `sent`, with the SMTP message ID recorded. Confirm the email arrives at
`hello@brickcircle.club`. Then confirm a second delivery request does not send a
duplicate email. Do not use a real member account for this check.

SMTP does not provide the same idempotency guarantee as an email API. If the
SMTP server accepts a message but the function loses the connection before
recording success, a later retry could deliver a duplicate. The stable message
ID and delivery header make such duplicates easier to identify.

Monitor counts and the oldest due time by status. Investigate
`permanent_failure`, a growing due backlog, or repeated webhook authorization
failures. Delivery rows contain member email addresses and remain service-role
only.

## Disable

Disable the database webhook and scheduled invocation first. Keep the migration
and delivery rows for diagnosis; no member registration or in-app notification
data needs to be changed.

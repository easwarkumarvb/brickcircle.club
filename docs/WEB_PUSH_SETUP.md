# BrickCircle Web Push release setup

Web Push is an enhancement over BrickCircle's durable in-app notifications. A failed push never removes or marks the underlying notification read.

## Architecture

1. After meaningful signed-in activity, the browser offers a user-controlled opt-in and stores the resulting Push API subscription in `public.push_subscriptions` under owner-only RLS.
2. Database logic creates deduplicated `notifications` rows for new reciprocal matches and exchange proposals.
3. A Supabase Database Webhook calls `send-web-push` for each `notifications` insert.
4. The Edge Function authenticates the webhook, reloads the notification and recipient from the database, claims a unique per-device delivery, and sends standards-based Web Push using VAPID.
5. The existing service worker displays the OS notification and safely focuses or opens the matching BrickCircle route.

## Secrets and deployment

The generated VAPID pair is stored locally in the ignored `.env.web-push.local`. Never commit that file or paste its private key into frontend configuration.

Before production deployment, replace the placeholder `PUSH_DISPATCH_SECRET` with a separate random value, then set Edge Function secrets:

```sh
supabase secrets set --env-file .env.web-push.local
supabase functions deploy send-web-push --no-verify-jwt
```

`verify_jwt` is disabled only because the database webhook does not carry a user JWT. The function rejects every request without the independent `x-brickcircle-push-secret` value.

Apply `supabase/migrations/20260907084632_web_push_notifications.sql` through the reviewed production migration process. Then create one Database Webhook:

- Name: `dispatch-high-value-web-push`
- Table: `public.notifications`
- Event: `INSERT`
- Method: `POST`
- URL: `https://nsxtromjdpdscknadxez.supabase.co/functions/v1/send-web-push`
- Header: `x-brickcircle-push-secret: <the PUSH_DISPATCH_SECRET value>`

Do not send a service-role key to the webhook endpoint. The dedicated secret has only one purpose and can be rotated independently.

## Supported events

- `request_received` + `exchange_request` → `/v2.html#exchanges/<request-id>`
- `reciprocal_match` + `reciprocal_match` → `/v2.html#matches`

Every other notification kind is ignored. The function reloads the notification by ID using its server-only credential; caller-provided recipient, title, body, or URL values are never trusted.

## Browser notes

- Chromium and Firefox require HTTPS outside localhost and a user gesture before permission can be granted.
- Safari supports standards-based Web Push on current macOS. On iOS/iPadOS, the site must be installed to the Home Screen and run on a Web Push-capable OS version.
- Private browsing, enterprise browser policy, or user-level notification settings can disable Push API support.
- Signing out removes the current user's server subscription and unsubscribes that browser endpoint to prevent cross-account delivery.

## Rollback

1. Disable/delete the Database Webhook; durable in-app notifications continue unchanged.
2. Remove or deactivate the `send-web-push` Edge Function.
3. Roll back the frontend/service-worker release.
4. If database cleanup is approved separately, drop the three reciprocal detection triggers and their functions, then drop `push_delivery_log` and `push_subscriptions`. Existing `notifications` rows remain valid and should not be deleted.

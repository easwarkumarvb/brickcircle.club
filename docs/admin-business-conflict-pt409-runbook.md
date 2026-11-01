# Admin business-conflict PT409 and revoked-session runbook

**This is source-only documentation. No staging/production operation, SQL
migration, deployment, push, or merge is authorized by this change.**

## PT409 contract and current change scope

The existing handler maps intentional `PT409` business conflicts to the safe
HTTP 409 envelope and retains `40001` compatibility. Supabase documents why
PostgREST 14 can retry RPC failures using `40001` and recommends `PT409` for
intentional HTTP 409 conflicts:
[PostgREST custom error-code retries](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
The migration that changed the three intentional conflict raises is separate
from this revoked-session fix; **no SQL migration is needed or included here**.

The current change only corrects the `admin-dashboard` Edge HTTP mapping for a
specific SDK Auth error. It does not change the allowlist, AAL2 checks, live
session verification, RPC behavior, or safe response envelope.

## Pinned SDK root cause

The Edge entrypoint pins `@supabase/supabase-js@2.57.4`, which resolves
`@supabase/auth-js@2.71.1`. In that pinned source,
[`handleError` converts `session_not_found` into `new AuthSessionMissingError()`](https://github.com/supabase/auth-js/blob/v2.71.1/src/lib/fetch.ts#L95-L99).
The class sets `name` to `AuthSessionMissingError`, `status` to 400, leaves
`code` undefined, and inherits `__isAuthError === true`:
[pinned errors.ts](https://github.com/supabase/auth-js/blob/v2.71.1/src/lib/errors.ts#L66-L74).
The previous Edge handler recognized 401/403 statuses and selected error codes,
but not this branded SDK shape, so the real revoked-session error incorrectly
became HTTP 503. The local reproduction with an actual imported SDK instance
returned 503 and made zero RPC calls. This was an HTTP denial-classification
bug, not evidence of an authorization bypass.

The minimal fix classifies only
`__isAuthError === true && name === 'AuthSessionMissingError'` as the existing
safe 401 expired-session response. Generic 400s, unbranded same-name objects,
retryable/network failures, and server errors remain safe 503s. The existing
401/403 and `bad_jwt`/`session_not_found`/`user_not_found` mappings and PT409
behavior remain unchanged.

The current [Auth JS changelog](https://github.com/supabase/auth-js/blob/master/CHANGELOG.md)
shows 2.72.0 after the pinned 2.71.1; its listed changes are feature/maintenance
items, with no relevant breaking change for this classification. No SDK upgrade
or dependency pin change is intended.

## Definitive bounded staging evidence — 2026-11-01

PR 183 merged after all four CI checks were green (1,533 browser and 9 visual
checks). Protected run `41276416491` on runner
`7161abdb34c55bc58959d33423fab40d4d9f80cd` again passed ordinary-member and
AAL1 denial, real TOTP/AAL2, authorized reads, and note/replay/conflict
responses of 200/200/409. The post-note check returned 200; the case and event
state remained unchanged.

Explicit signout completed. Route logs show logout 204 at `05:19:26.566Z`, Auth
user validation 403 at `05:19:27.094Z`, and the final Edge response 503 at
`05:19:27.380Z`. The final diagnostic had
`transportCompleted`/`jsonParsed`/`noStore`/`allowedResponseShape` all true.
There was no REST admin lookup after the Auth 403. The SDK-shape mapping above
explains the remaining 503 without weakening any authorization control.

Cleanup recorded two successful signouts and independently verified zero
sessions. Preserve all three audit rows. The support fixture remained open at
revision 0; the associated case remained `CANCELLED` version 1 with zero events.
This is the baseline for any future comparison—do not delete/reset notes,
rewrite fixture state, or reuse request IDs.

## Minimal staging rollout and protected rerun

After this source change is reviewed and merged, any staging action requires
separate staging-owner approval. If approved, deploy only the reviewed
`admin-dashboard` Edge function update containing this handler mapping; do not
apply or replay SQL. Keep the existing function authorization and no-store
checks, and verify the actual SDK-shaped missing-session error returns 401 while
ordinary/AAL1 denial, real TOTP/AAL2, authorized reads, PT409 replay/conflict,
and cleanup invariants continue to pass.

Only after separate approval, rerun the protected readiness workflow from
`main`, with its trusted runner checked out at the reviewed `main` SHA—not from
this development branch or a PR head. Preserve the existing protected
environment review and immutable checkout/revalidation gates. Compare against
the three-audit-row baseline above, retain all notes, confirm zero sessions,
and verify the support revision/status and case/events are unchanged. No
hosted call is authorized by this runbook update.

## Offline validation boundary

The SDK-instance regression uses the installed pinned Supabase package and
verifies both the exact safe response and zero RPC calls. Other handler tests
retain the safe 503 behavior for unknown/retryable errors and the existing
PT409/authorization contracts. Offline tests do not deploy the Edge function
or prove live staging behavior; those actions require the separate protected
approval and rerun described above.

# Admin business-conflict PT409 and revoked-session runbook

**This is source-only documentation. No staging/production operation, SQL
migration, deployment, push, or merge is authorized by this change.**

## Historical PT409 rollout — completed 2026-10-20

Supabase documents that PostgREST 14 retries RPC failures using SQLSTATE
`40001`, even when raised deliberately for a business conflict, and recommends
`PT409` for an HTTP 409 response:
[PostgREST custom error-code retries](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

The historical migration resolved only
`public.admin_support_note(uuid,text,uuid)` and
`public.admin_marketplace_mutate(text,text,text,integer,text,uuid)` through
`pg_get_functiondef`, checked exact old/new statement occurrence counts, and
replaced the three intentional business-conflict raises with `PT409`. It failed
closed on missing, duplicate, or unexpected statements. It did not rewrite
historical migrations, change ACLs, or add helpers/grants. The handler mapped
`PT409` to the existing safe HTTP 409 conflict envelope and retained `40001`
compatibility.

The historical staging rollout was completed on 2026-10-20. Its source review
treated the three-file Edge bundle as one unit because staging's deployed
`admin-dashboard` v2 predated bounded request parsing and growth reporting:

- `supabase/functions/admin-dashboard/index.ts` — entrypoint importing
  `./handler.mjs` and pinning `@supabase/supabase-js@2.57.4`.
- `supabase/functions/admin-dashboard/handler.mjs` — request, auth, RPC, and
  response handler importing `../_shared/bounded-json.mjs`.
- `supabase/functions/_shared/bounded-json.mjs` — bounded JSON parser and
  `RequestBodyError`.

The completed rollout inspected only the two exact function signatures and
confirmed one quoted `40001` in the note function and two in the mutation
function (request-ID replay and stale-revision conflicts) before applying the
migration. Post-migration verification retained owner, ACLs, `SECURITY
DEFINER`, `search_path`, language, arguments, advisory locking, authentication/
AAL checks, replay behavior, revision checks, and unchanged conflict messages.
Only the three intended raises changed to `PT409`; no `40001`-retrying conflict
raise remained. No further SQL replay is part of the current revoked-session
fix.

Do not roll back by restoring deliberate business-conflict `40001` raises:
that would reintroduce PostgREST retry behavior. If a rollback is ever needed,
keep the handler's dual-code mapping, pause admin mutation/note smoke tests, and
obtain a separately reviewed corrective migration that continues to use a
non-retryable conflict SQLSTATE.

## Pinned SDK root cause

The Edge entrypoint pins `@supabase/supabase-js@2.57.4`, resolving
`@supabase/auth-js@2.71.1`. In that pinned source,
[`handleError` converts `session_not_found` into `new AuthSessionMissingError()`](https://github.com/supabase/auth-js/blob/v2.71.1/src/lib/fetch.ts#L95-L99).
The class sets `name` to `AuthSessionMissingError`, `status` to 400, leaves
`code` undefined, and inherits `__isAuthError === true`:
[pinned errors.ts](https://github.com/supabase/auth-js/blob/v2.71.1/src/lib/errors.ts#L66-L74).
The previous Edge handler recognized 401/403 statuses and selected error codes,
but not this branded SDK shape, so the real revoked-session error incorrectly
became HTTP 503. Local reproduction with an actual imported SDK instance
returned 503 and made zero RPC calls. This was an HTTP denial-classification
bug, not evidence of an authorization bypass.

The minimal fix classifies only
`__isAuthError === true && name === 'AuthSessionMissingError'` as the existing
safe 401 expired-session response. Generic 400s, unbranded same-name objects,
branded non-session errors, retryable/network failures, and server errors remain
safe 503s. Existing 401/403 and
`bad_jwt`/`session_not_found`/`user_not_found` mappings and PT409 behavior remain
unchanged. No SDK upgrade is needed or intended.

## Definitive bounded staging evidence — 2026-11-01

PR 183 merged after all four CI checks were green (1,533 browser and 9 visual
checks). Protected run `41276416491` on runner
`7161abdb34c55bc58959d33423fab40d4d9f80cd` again passed ordinary-member and
AAL1 denial, real TOTP/AAL2, authorized reads, and note/replay/conflict
responses of 200/200/409. The post-note check returned 200; case and event
state remained unchanged.

Explicit signout completed. Route logs show logout 204 at `05:19:26.566Z`, Auth
user validation 403 at `05:19:27.094Z`, and final Edge response 503 at
`05:19:27.380Z`. The final diagnostic had
`transportCompleted`/`jsonParsed`/`noStore`/`allowedResponseShape` all true.
There was no REST admin lookup after the Auth 403. The pinned SDK shape above
explains the remaining 503 without weakening any authorization control.

Cleanup recorded two successful signouts and independently verified zero
sessions. Preserve all three audit rows. The baseline is support open at
revision 0; the associated case is `CANCELLED` version 1 with zero events.
Never reset fixture state, delete retained audit notes, or reuse request IDs.

## Minimal staging rollout and protected rerun

After this source change is reviewed and merged, any staging action requires
separate staging-owner approval. If approved, deploy only the reviewed
`admin-dashboard` Edge function update containing this handler mapping; do not
apply or replay SQL. Review the complete three-file Edge source/import set
listed above. Verify the actual SDK-shaped missing-session error returns 401,
while ordinary/AAL1 denial, real TOTP/AAL2, authorized reads, PT409
replay/conflict, and cleanup invariants continue to pass.

Only after separate approval, rerun through
`.github/workflows/hosted-admin-mfa-release-readiness.yml` from `main` only,
with `pull_request_number=178`,
`expected_release_merge_sha=e135cde511440f73d36c34a4058383f9169d530e`, and
`confirmation=RUN_STAGING_ADMIN_MFA_READINESS`. The workflow also validates the
merged PR 178 head pin and exact workflow reference. Use the immutable reviewed
runner SHA on `main` after this fix is approved and merged; never dispatch this
development branch or substitute a PR head for the release merge SHA. Retain
the protected staging environment approval and immutable runner checkout and
revalidation gates.

Before approval, freshly reconfirm ownership and current state of both
disposable identities, the single verified admin TOTP factor, and absence of
active sessions. Recheck that the staging notification path is outbox-only and
cannot deliver externally; existing credentials or fixture variables do not
replace this preflight. Compare against the three-audit-row baseline, retain all
notes, use fresh request IDs, confirm zero sessions after cleanup, and verify
the support revision/status and case/events are unchanged. No hosted call is
authorized by this documentation change.

## Offline validation boundary

The SDK-instance regression verifies the exact safe response, while negative
SDK and generic error tests verify safe 503 responses, no-store headers, and no
RPC calls. PT409/authorization tests retain the existing contracts. Offline
tests do not deploy the Edge function or prove live staging behavior; those
actions require the separate protected approval and rerun described above.

# Protected hosted photo verification

This is a new manual-only staging verification runner. It does not repoint the
older PR125 or PR138 runners, deploy an application, apply a migration, or change
canonical exchange transitions. Production is forbidden.

## Exact reviewed inputs and prerequisites

Dispatch `.github/workflows/hosted-photo-verification.yml` from trusted `main`,
with candidate SHA `d05a26a2cbdd97a5be489ca076fd8c9a8d38d2ad` and confirmation
`RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE`. The validator verifies merged PR143
head `90d56bcd62235e112a2874a7b6cb1ad5cc5a1206` and merged PR144 head
`3c709326be7b5c2f6e74b35182d68a844b69cb04`, including their fixed merge SHAs,
repository, branch and main base, both before and after environment review.
An arbitrary branch, SHA, fork, push event or updated provenance fails closed.

The separate protected `hosted-supabase-staging` environment and existing
`hosted-supabase-exchange-smoke` concurrency group are required. Only exact staging
`tteyypklldgwwicrgjzt` is accepted; production `nsxtromjdpdscknadxez`, provider
notification mode and email domains other than `example.test` are rejected.
Staging must have these reviewed policies applied separately through an approved
migration operation:

- `20261013044724_canonical_participant_collection_photo_access.sql` (merged PR143).
- `20261013080000_bind_collection_photo_reads_to_owner.sql` (separate PR145 repair;
  the forged-reference regression exposed an existing Storage read gap).

Configured `BC_STAGING_SET_A` and `BC_STAGING_SET_B` must name distinct catalog
sets. The public harness accepts a numeric set ID with an optional numeric variant
suffix, preserving the configured staging values `75192-1` and `10307-1` without
stripping their catalog keys. Invalid or duplicate values fail before public HTTP.

The runner neither applies these files nor uses an administrative query to
silently substitute for real Storage permission checks. The canonical participant
functional preflight runs **after** fresh account, photo and item provisioning and
a canonical proposal. Absence of the first policy stops at PROPOSED counterpart
signing. The forged-reference denial stops verification if the second repair is
absent. The merged application candidate is immutable; later policy repair is a
separate server prerequisite, not represented as part of that candidate commit.

## What it exercises

The trusted bootstrap helper provisions three fresh synthetic adult-confirmed
accounts. Its server credential exists only in the bootstrap step and separate
read-only outbox audit. The HTTP harness explicitly rejects a server credential,
uses the public key and each fixture's password session, and verifies the session
identity through Auth. Both raw HTTP and privileged SDK requests use an exact
staging origin guard, a timeout and `redirect: error`. Only Auth, REST and Storage
API paths are allowed. No Edge Function worker, provider or application deployment
is called.

Each owner uploads a valid one-pixel synthetic PNG through Storage into their own
UUID folder, links it to their own collection item and uses the canonical
availability RPC and reciprocal wishlists. The harness checks downloaded bytes
through actual signed URLs before proposal, at PROPOSED, at ACCEPTED and in the
CANCELLED archive after both reciprocal wishlists have been removed. It creates,
accepts and cancels the case only through canonical RPCs using `state_version`.
Outsider and anonymous signing and private downloads must fail at each case stage.

Foreign insert, update, upsert, move and delete attempts must fail. Since Storage
remove can return success with no deleted rows, the harness checks zero removals
and re-signs/downloads the owner's unchanged bytes after each attempt. It also
requires outsider C's forged own collection row referencing B's photo to confer
no signing access. This uses only the run's dummy paths. Missing-object, permission
and expired-capability failures are accepted; infrastructure failures and arbitrary
bad requests are not permission evidence.

A fresh one-second capability is never downloaded while valid, then must fail
after expiration with explicit `ExpiredToken`, legacy `jwt expired`, or an exact
HTTP 400 `InvalidJWT` code/error paired with JOSE's `"exp" claim timestamp check failed` message;
a newly signed capability must succeed. Current Storage returns HTTP 400 for
`ExpiredToken`, as defined in its [official error codes](https://github.com/supabase/storage/blob/master/src/internal/errors/codes.ts).
Storage's [JWT verifier](https://github.com/supabase/storage/blob/master/src/internal/auth/jwt.ts)
uses JOSE, and its [object signature verifier](https://github.com/supabase/storage/blob/master/src/storage/object.ts)
wraps verification failures in `InvalidJWT`. JOSE's
[claim validator](https://github.com/panva/jose/blob/main/src/lib/jwt_claims_set.ts)
uses that exact message for expiration. An arbitrary `InvalidJWT`, other claim failure,
HTTP 400 or invalid-signature error is not accepted as expiry proof. This avoids deriving
expiration evidence from a previously cached successful response. Existing
candidate runtime tests independently prove the application's fifteen-minute URL
cache refresh, failure recovery and account-switch/logout isolation without
waiting fifteen minutes.

Successful runs delete only their two exact dummy Storage objects, using owner
sessions, and retain the synthetic accounts, items and canonical case as audit
evidence. Failed runs retain their fixtures for investigation. The final privileged
audit checks pending outbox rows for these fresh accounts and requires zero provider
attempts. It never dispatches a delivery worker.

## Evidence and limits

Only `artifacts/hosted-photo-http.json` and `artifacts/hosted-photo-outbox.json` are
uploaded. Reports contain fixed check descriptions, candidate SHA and aggregate
counts; they exclude identifiers, email addresses, credentials, photo paths,
signed capabilities, raw API errors and request traces. No browser storage or
screenshots are uploaded. On failure, the HTTP report includes only the fixed
checkpoint label and checks completed before that checkpoint. A rejected expiration
response also adds only its bounded HTTP status and a fixed classification enum
(`expired-token`, `legacy-jwt-expired`, `jose-expired-invalid-jwt`, `invalid-jwt-other`,
`unrecognized-json`, or `non-json`). Raw error codes, messages, bodies and capability
URLs are never copied into reports. Raw exceptions and
API response details are discarded; an unknown exception cannot supply report
fields. A failed run does not claim any later permission or journey checks.

The offline guard CI tests immutable provenance, production/origin/redirect
rejection, public-only credential isolation, a mocked complete journey using real
RPC parameter contracts, fail-closed missing policy and forged-reference cases,
and manual protected workflow configuration. It also runs the six existing
candidate signed-URL cache tests. These are implementation tests, not hosted
success evidence. Hosted execution remains gated by environment review and the
separately applied policy prerequisites. This HTTP runner does not certify physical
camera hardware, mobile keyboard/safe areas, visual baselines or the full browser
exchange journey; existing browser CI and later physical-device checks cover those
separate requirements.

Hosted run [38495468640](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38495468640)
completed seven permission checkpoints and then failed at signed capability
expiration. Its audit found 16 pending outbox rows and zero provider attempts.
Bounded gateway logs showed the expired download returned HTTP 400; its response
body was withheld, so the JOSE response form above is source-supported compatibility,
not a confirmed observation from that run. Fresh protected hosted verification is
still required for expiration, subsequent fresh signing and owner cleanup.

No hosted run or migration was performed while preparing this compatibility change.
Branches `qa/hosted-photo-verification` and `qa/hosted-photo-expiry-compat` have Vercel
automatic deployment disabled before publication; `main` remains disabled.

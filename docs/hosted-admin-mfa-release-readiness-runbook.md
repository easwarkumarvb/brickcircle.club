# Hosted staging Admin MFA release readiness

This is a manual, source-only verification of the merged PR 178 release using
the immutable trusted dispatcher checkout as the harness. It does not execute
the release checkout, deploy it, provision users, grant connector access, or
apply migrations. Its evidence is server-side Supabase Auth and API evidence
only; it is not browser, physical-device, or production UI proof.

The only permitted Supabase target is
`https://tteyypklldgwwicrgjzt.supabase.co`. The production project
`nsxtromjdpdscknadxez` is forbidden. Requests are limited to Supabase Auth,
REST, and Functions API paths, redirects fail closed, and the runner accepts
only the publishable/public key. Never add a service-role/secret key or an
administrative Auth client to this workflow.

## Protected environment prerequisites

Do not dispatch until the repository's `hosted-supabase-staging` environment
has required human reviewers enabled and its deployment branch rule restricts
the environment to `main`. Keep the environment variables/secrets protected;
do not copy values into source, a command line, an issue, or a runbook. The
workflow itself is manual-only, checks `refs/heads/main`, and validates the
exact same-repository merged PR 178 both before and after environment approval.
It checks out the immutable dispatch SHA as trusted harness source and verifies
that checkout before any staging credentials or requests are used. The release
head and merge SHAs are separate from this harness SHA.

The environment must contain the existing exact staging URL and public key,
plus these new values. Current BC_ADMIN_SMOKE credentials, the three exchange
users, or existing support fixtures are not substitutes for these owned,
dedicated MFA fixtures.

| Environment name | Type | Required setup |
| --- | --- | --- |
| `BC_STAGING_SUPABASE_URL` | Secret | Exactly `https://tteyypklldgwwicrgjzt.supabase.co` |
| `BC_STAGING_SUPABASE_PUBLISHABLE_KEY` | Secret | Staging publishable/anon key only |
| `BC_STAGING_NOTIFICATION_MODE` | Variable | Exactly `outbox-only`; this is an operator assertion, not a dispatcher switch |
| `BC_ADMIN_MFA_MEMBER_EMAIL` | Secret | Owned disposable non-admin staging Auth account; unique `@example.test` address |
| `BC_ADMIN_MFA_MEMBER_PASSWORD` | Secret | Password for that same member account |
| `BC_ADMIN_MFA_ADMIN_EMAIL` | Secret | Different owned disposable staging admin account; unique `@example.test` address |
| `BC_ADMIN_MFA_ADMIN_PASSWORD` | Secret | Password for that same admin account |
| `BC_ADMIN_MFA_ADMIN_TOTP_SECRET` | Secret | The admin's real, already enrolled and verified TOTP seed |
| `BC_ADMIN_MFA_RUN_ID` | Variable | New UUID identifying this one fixture set and its server-owned run marker |
| `BC_ADMIN_MFA_CASE_ID` | Variable | UUID of the owned staging exchange case associated with the support request |
| `BC_ADMIN_MFA_SUPPORT_ID` | Variable | UUID of the owned support request used by the read and note checks |

The runner also receives `BC_ADMIN_MFA_CONFIRMATION`,
`BC_ADMIN_MFA_PULL_REQUEST_NUMBER`, `BC_ADMIN_MFA_RELEASE_HEAD_SHA`,
`BC_ADMIN_MFA_RELEASE_MERGE_SHA`, and `BC_ADMIN_MFA_RUNNER_SHA` from the
manually confirmed dispatch and the validated workflow outputs. Never set
these to point at a different PR, release, or runner.

## Owned fixture preparation

Prepare these fixtures through the approved staging account and data-owner
process, outside this runner. Use new, separately owned disposable identities
with unique `example.test` addresses; do not reuse, reset, or repurpose real
accounts or their MFA factors.

1. Create one ordinary member and one separate admin staging Auth account.
   Both must be verified, password-authenticatable, and owned for this test.
   Set `app_metadata.staging_admin_smoke_run` to the exact run UUID on each
   account using the trusted server-side fixture process. The marker must be
   server-owned; the runner has no bootstrap/update RPC and cannot set it.
2. Enroll and verify exactly one real TOTP factor on the disposable admin
   account through the normal Auth MFA enrollment flow. Store that factor's
   seed only in `BC_ADMIN_MFA_ADMIN_TOTP_SECRET`. The runner performs a real
   Auth `challengeAndVerify`, proves the password session is AAL1 first and
   the resulting Auth-issued session is AAL2, and signs out both sessions.
   Never supply a forged JWT or seed a factor through a service call during
   the run.
3. Prepare a dedicated support request at `BC_ADMIN_MFA_SUPPORT_ID` in the
   actionable state, with `case_id` equal to `BC_ADMIN_MFA_CASE_ID`,
   `requested_by` equal to the owned member UUID, revision `0`, and initial
   note exactly `Owned staging admin smoke <RUN_ID>`. The associated exchange
   must be owned staging data. Record the expected existing event page and
   exchange state before authorizing the run. The smoke checks the member's
   ordinary-admin denial, the admin's AAL1 denial, the AAL2 authorized reads,
   note replay/conflict behavior, unchanged case state and event page, and
   post-signout denial.
4. Verify the staging notification path independently before approval. Keep
   email/provider delivery workers disabled or configured to a non-routable
   test sink, and inspect that this fixture path can only create/audit outbox
   records without sending real email or provider notifications. The
   `BC_STAGING_NOTIFICATION_MODE=outbox-only` value is required by validation
   but does **not** disable or reconfigure a dispatcher. If delivery cannot be
   independently established as safe, do not run.

The expected current protected environment is incomplete: it has the staging
URL/public/server keys and three exchange users, but lacks the dedicated
`BC_ADMIN_MFA_*` account credentials, TOTP seed, run/case/support fixtures and
their ownership setup. The workflow intentionally fails closed and reports
only missing prerequisite names before constructing an SDK client or making
requests. The server key and existing exchange users are not used.

## Approval, connector review, and retained evidence

After fixture ownership and the outbox/provider check are recorded, a reviewer
must approve the protected environment run. From Actions, dispatch **Hosted
admin MFA release readiness** on `main` with PR `178`, merge SHA
`e135cde511440f73d36c34a4058383f9169d530e`, and confirmation
`RUN_STAGING_ADMIN_MFA_READINESS`. Do not run from the feature branch.

Connector allowlisting is a separate, independent operation. Do not grant it
as part of this workflow or before the report verifies the server-owned run
marker and records the exact owned admin UUID. Any connector reviewer must
independently validate the run marker, account ownership, exact requested
scope, and run evidence before granting a narrowly scoped entry. The workflow
does not write connector configuration.

The admin note/audit record is intentionally retained for owner review. This
workflow does not delete or clean up accounts, factors, support records, or
audit history. Fixture retirement is a separate owner-approved process after
the report and connector review are complete; it must separately verify
ownership and preserve required audit history. The uploaded report identifies
release reference, harness source, server evidence scope, fixture UUIDs,
session signout results, and the retained audit request ID. It excludes
credentials, TOTP seed/codes, access and refresh tokens, and provider error
details. It is not proof of browser behavior or physical UI readiness.

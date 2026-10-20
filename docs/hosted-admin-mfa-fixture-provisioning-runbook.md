# Hosted staging Admin MFA fixture provisioning

This is a separate, manual-only, source-only path for creating two new
disposable staging Auth users and enrolling a real TOTP factor on the new admin
user. It does not run the PR 178 readiness checks, create case/support
fixtures, add an admin allowlist row, change schema/RPC/grants, reset or delete
accounts, deploy, or contact an email/provider service. The provisioning
workflow is restricted to `main`, checks out and verifies the exact immutable
dispatch SHA, and uses the protected `hosted-supabase-staging` environment.
Do not run it from a feature branch.

The only allowed project is
`https://tteyypklldgwwicrgjzt.supabase.co`. Production project
`nsxtromjdpdscknadxez` is forbidden. The workflow accepts only a publishable
key for the password/MFA client and the protected
`BC_STAGING_SUPABASE_SECRET_KEY` for exactly two Auth Admin `createUser`
operations. Its Auth transport is limited to the required staging Auth
endpoints, uses redirect-fail behavior, and never calls signup, invite,
provider, email, database, REST, or Functions APIs. No credentials are placed
in command arguments, logs, workflow outputs, or artifacts in plaintext.

## Before dispatch

1. Confirm the `hosted-supabase-staging` GitHub environment has required human
   reviewers, is restricted to `main`, and contains the existing staging
   `BC_STAGING_SUPABASE_PUBLISHABLE_KEY` and
   `BC_STAGING_SUPABASE_SECRET_KEY`. Do not read, copy, print, or place the
   server key anywhere outside that protected environment. The workflow maps
   it only into the provisioning step after provenance/input preflight.
2. Generate a new local RSA keypair with Node:

   ```sh
   node scripts/admin-mfa-keypair.mjs
   ```

   The helper creates a fresh local directory, writes a 3072-bit PKCS#8
   private key with POSIX directory/file modes `0700`/`0600`, and prints only
   the single-line base64 DER public key. On Windows it explicitly removes
   inherited ACLs and verifies owner and SYSTEM-only full-control ACLs; if
   that restriction cannot be established, it fails without printing the
   public key. Do not upload, email, paste, or otherwise transfer
   `private-key.pem`. Keep the path reported on stderr and back it up only
   through an approved encrypted local process.
3. Generate a fresh version-4 UUID for the fixture run. Never reuse a run ID,
   keypair, or account. Keep the UUID and exact main dispatch SHA as the
   independent import bindings.
4. In Actions, dispatch **Hosted admin MFA fixture provisioning** from
   `main`. Supply the new public-key base64 line, new run UUID, the exact
   40-character commit SHA displayed as the dispatch `GITHUB_SHA`, and
   `PROVISION_STAGING_ADMIN_MFA_FIXTURES`. Do not include line breaks around
   the public key. Protected environment approval is still required.

The workflow validates repository, branch, event, exact workflow ref, dispatch
SHA/checkout, staging project, run UUID, confirmation, and RSA type/size before
constructing a Supabase client or making a Supabase request. Offline tests run
before the credential-bearing step. It creates two unique
`member-<run UUID>@example.test` and `admin-<run UUID>@example.test`
accounts with generated passwords, `email_confirm: true`, and the
server-owned `app_metadata.staging_admin_smoke_run` marker. It logs in as the
new admin with the publishable key, enrolls TOTP, performs
`auth.mfa.challengeAndVerify`, verifies the sole new factor and AAL2, then
signs out the owned session in `finally`.

No invitation or provider delivery is sent. The provisioning process never
updates or reuses an existing account; a duplicate-address/create error stops
the run. It never resets factors, deletes users, or rolls back a partial run.
On failure, any successfully created identities remain disposable accounts;
the workflow retains only a bounded, non-secret ownership report identifying
known user/factor UUIDs and the phase/status. An uncertain create response is
reported as outcome-unknown. No encrypted credential payload is produced for
a partial run. A separate owner-approved review/retirement process must
resolve retained accounts; do not retry using the same run marker.

On success, the three-day Actions artifact contains exactly the encrypted
payload `admin-mfa-fixtures.encrypted.json` and the bounded ownership metadata
`admin-mfa-fixture-ownership.json`. Credentials and TOTP seed are encrypted
with RSA-OAEP-SHA256 to the supplied public key and AES-256-GCM; metadata,
run/user/factor IDs, source SHA, project, workflow and key fingerprint are
bound as authenticated data. The payload contains only the two new accounts'
emails/passwords, the admin TOTP seed, and matching IDs. It contains no
Supabase server/public key, session, JWT, access token, or refresh token.

This flow follows the current Supabase JavaScript references for
[Admin `createUser`](https://supabase.com/docs/reference/javascript/auth-admin-createuser),
[MFA `enroll`](https://supabase.com/docs/reference/javascript/auth-mfa-enroll),
and [`challengeAndVerify`](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify).
The create-user reference documents `email_confirm: true`; the Auth SDK type
defines `app_metadata` as server-role-only. The MFA references describe
returning the TOTP secret at enrollment and verifying a challenge to promote
the current session to AAL2. The current
[Supabase changelog](https://supabase.com/changelog.md) had no newer change
altering these create-user/MFA contracts when this source path was prepared.

## Verify and import

Before decrypting or importing anything, independently verify the completed
trusted workflow run through the GitHub API. Use the run database ID from the
Actions run page, not a value copied from the artifact:

```sh
gh api repos/easwarkumarvb/brickcircle.club/actions/runs/<RUN_DATABASE_ID> \
  --jq '{path,event,head_branch,head_sha,status,conclusion}'
```

Require the exact path
`.github/workflows/hosted-admin-mfa-fixture-provisioning.yml`, event
`workflow_dispatch`, branch `main`, the independently recorded expected
dispatch SHA, `status: completed`, and `conclusion: success`. Also verify the
run's artifact listing contains the expected
`admin-mfa-fixtures-<RUN_UUID>` artifact and that it has not expired. If any
provenance field or result differs, do not import.

```sh
gh api repos/easwarkumarvb/brickcircle.club/actions/runs/<RUN_DATABASE_ID>/artifacts \
  --jq '.artifacts[] | select(.name == "admin-mfa-fixtures-<RUN_UUID>") | {name,expired,expires_at}'
gh run download <RUN_DATABASE_ID> \
  --repo easwarkumarvb/brickcircle.club \
  --name admin-mfa-fixtures-<RUN_UUID> \
  --dir <LOCAL_OWNER_ONLY_DIRECTORY>
```

Download the artifact into a local owner-only directory. Run the import helper
from the trusted repository source at that verified dispatch SHA. Supply the
private key path, plus the independently recorded expected dispatch SHA and
run UUID; do not derive those two values from metadata. The helper validates
the strict payload and ownership shapes, IDs, key fingerprint, AAD binding,
source SHA, run ID, and private-key permissions before contacting `gh`. It
uses only the fixed repository and environment below. It refuses to overwrite
any existing target secret or run variable and pipes secret values to
`gh secret set` via stdin; no secret is put in an argument or printed.

```sh
node scripts/import-admin-mfa-fixtures.mjs \
  --payload <LOCAL_DIR>/admin-mfa-fixtures.encrypted.json \
  --metadata <LOCAL_DIR>/admin-mfa-fixture-ownership.json \
  --private-key <LOCAL_KEY_DIR>/private-key.pem \
  --expected-dispatch-sha <INDEPENDENT_40_CHARACTER_SHA> \
  --expected-run-id <INDEPENDENT_RUN_UUID> \
  --confirm IMPORT_STAGING_ADMIN_MFA_FIXTURES
```

The only values imported are these five protected staging secrets and one
environment variable:

| Name | Type |
| --- | --- |
| `BC_ADMIN_MFA_MEMBER_EMAIL` | Secret |
| `BC_ADMIN_MFA_MEMBER_PASSWORD` | Secret |
| `BC_ADMIN_MFA_ADMIN_EMAIL` | Secret |
| `BC_ADMIN_MFA_ADMIN_PASSWORD` | Secret |
| `BC_ADMIN_MFA_ADMIN_TOTP_SECRET` | Secret |
| `BC_ADMIN_MFA_RUN_ID` | Variable |

If any target name already exists, import fails closed without changing any
value. There is no overwrite switch. A separately authorized operator must
resolve pre-existing configuration and review any proposed replacement before
using a fresh provisioning run; do not remove or replace protected values as
part of this procedure. If `gh` fails after one or more writes, the helper
prints a fixed incomplete-import diagnostic and suppresses all command output;
inspect protected *names* before retrying.

## Independent connector work and subsequent positive run

Only after a successful provisioning run has been reviewed and its provenance
verified may the independent staging connector reviewer use the ownership
metadata to inspect both Auth UUIDs. Verify that both are distinct,
disposable `@example.test` accounts with the exact server-owned run marker;
the member is not allowlisted; and the admin has exactly one real, verified
TOTP factor matching the reported factor UUID. Confirm the admin's account
ownership and verified factor independently. This review must precede any
allowlist change.

Case/support fixture creation and admin allowlisting remain independent
connector operations and are not automated here. For the later positive
**Hosted admin MFA release readiness** run, the connector owner must prepare
all of the following using the existing authorized staging process:

* `BC_ADMIN_MFA_CASE_ID` and `BC_ADMIN_MFA_SUPPORT_ID`: fresh UUIDs for an
  owned staging case and support request, distinct from each other and the
  `BC_ADMIN_MFA_RUN_ID`; the support request is actionable, references that
  case, has `requested_by` set to the newly created member UUID, revision `0`,
  and initial note exactly
  `Owned staging admin smoke <RUN_UUID>`. Record the expected exchange state
  and event page before the run. Store these two IDs as
  `hosted-supabase-staging` environment variables after connector review.
* Verify both users and the exact run marker again. Verify the member is not
  in `private.exchange_admins`, then independently add **only the verified,
  owned admin UUID** to that existing allowlist using the authorized
  connector process. Do not allowlist the member or any other identity. Make
  no schema, RPC, grant, application-connector permission, or other access
  changes.
* Independently establish that the staging notification path is outbox-only
  and cannot send provider/email notifications. The readiness runner's
  `BC_STAGING_NOTIFICATION_MODE` environment variable must be exactly
  `outbox-only`; it is an assertion, not a dispatcher control.

Only after those connector checks and the outbox/provider safety review are
recorded may the protected positive run be approved. Dispatch the existing
**Hosted admin MFA release readiness** workflow from `main` with PR `178`,
merge SHA `e135cde511440f73d36c34a4058383f9169d530e`, and confirmation
`RUN_STAGING_ADMIN_MFA_READINESS`. Keep its existing legacy PR 124
public-key-only runner and the PR 178 positive runner unchanged.

The provisioning workflow's evidence is limited to staging Auth account
creation and real MFA API enrollment/verification. The later readiness
runner's evidence is limited to its server-side Supabase Auth/API checks and
the exact fixture IDs it reports; neither workflow proves browser behavior,
physical UI readiness, deployment, production safety, or a production
allowlist. Do not represent either as a hosted application or production
readiness claim.

Retain owned fixture accounts, factors, support/audit evidence, and any
admin-only allowlist row through review. There is no automatic account/factor
reset or deletion. Retirement, including any separately authorized removal
of the admin-only allowlist row, is a distinct owner-approved process that
must verify ownership and preserve required audit history.

# Disposable authenticated admin smoke — review checkpoint

This follow-up is a **prepared harness, not hosted execution evidence**. Do not run
it or dispatch its workflow until Codex reviews the source, credentials/fixture
ownership, and retained-audit plan. No production authorization is granted.

## Route and prerequisites

`scripts/hosted-admin-smoke.mjs` accepts only the exact URL
`https://tteyypklldgwwicrgjzt.supabase.co`, PR 124, a 40-character reviewed SHA,
and two different `example.test` identities. It refuses invalid configuration
before constructing clients, restricts every SDK/Edge request to that project's
Auth/REST/Functions paths, and refuses redirects. No production frontend is loaded.

The operator must explicitly provision **owned disposable** member/admin identities
(confirmed without email delivery), passwords and one verified admin TOTP factor.
Do not reuse real accounts, reset passwords, replace factors or forge JWT claims.
Set each identity's server-owned `app_metadata.staging_admin_smoke_run` to the
approved run UUID during provisioning. The script verifies that marker against
Auth's `getUser()`, not editable profile metadata. Connector must verify the member
is not allowlisted and grant only the owned disposable admin if needed:

```sql
-- Reviewed connector selected ONLY for tteyypklldgwwicrgjzt.
-- Bind :admin_id to the independently verified owned disposable Auth UUID.
insert into private.exchange_admins(user_id) values (:admin_id);
```

This is a specific connector request, **not executable literal SQL with placeholders**.
No helper RPC, table, migration, service-key bootstrap or default privilege change
is part of this follow-up. The service key cannot safely grant this via Data API.

Provide an explicitly designated disposable case baseline and support fixture whose
`requested_by` is the disposable member, status is actionable, and note is exactly
`Owned staging admin smoke <run UUID>`. Connector may prepare that single support
sidecar directly after review, capturing the existing case state/version without
transitioning it, sending messages or invoking notification-producing lifecycle RPCs.
Record complete case/events/messages baselines for independent post-run comparison.
The harness compares case detail and the first event page/count; it does **not**
claim complete message/custody or concurrent-change verification.

## Protected inputs and exact local command

Inject these names through a protected runner/operator environment, never chat,
repository files, command-line values, `.env` files, shell tracing or artifacts:

- Existing environment secrets: `BC_STAGING_SUPABASE_URL`, `BC_STAGING_SUPABASE_PUBLISHABLE_KEY`.
- Newly provisioned protected secrets: `BC_ADMIN_SMOKE_MEMBER_EMAIL`,
  `BC_ADMIN_SMOKE_MEMBER_PASSWORD`, `BC_ADMIN_SMOKE_ADMIN_EMAIL`,
  `BC_ADMIN_SMOKE_ADMIN_PASSWORD`, `BC_ADMIN_SMOKE_ADMIN_TOTP_SECRET`.
- Non-secret fixture settings: `BC_ADMIN_SMOKE_RUN_ID`, `BC_ADMIN_SMOKE_CASE_ID`,
  `BC_ADMIN_SMOKE_SUPPORT_ID`.
- Selection: `BC_ADMIN_SMOKE_PR=124`, `BC_ADMIN_SMOKE_EXPECTED_HEAD_SHA=<reviewed exact head>`,
  `BC_ADMIN_SMOKE_CONFIRMATION=RUN_OWNED_DISPOSABLE_ADMIN_SMOKE`.

After review and explicit execution approval, with **all** those variables injected:

```sh
node scripts/hosted-admin-smoke.mjs
```

No service key is read. Generated OTPs, login tokens and refresh tokens are masked
before checks; provider/assertion details are never printed. TOTP secret is used
only in memory to call actual Auth `challengeAndVerify`; no JWT is fabricated.
Evidence artifact `artifacts/hosted-admin-smoke.json` contains only selection,
phase/status, fixture UUIDs, checks and cleanup disposition. UUIDs are staging
fixture identifiers, not credentials. Protect artifact access nevertheless.

## Workflow routing

`.github/workflows/hosted-supabase-admin-smoke.yml` is dedicated and manual-only.
It uses the existing `hosted-supabase-staging` environment, **not** the exchange
bootstrap or server secret. Configure required reviewers and default-branch
restrictions before use; reviewers must independently approve the exact source SHA
and confirm staging secrets target the disposable project. The selection checks
open same-repository PR 124, exact branch/head, default-branch workflow provenance,
immutable checkout, and repeats the head check immediately before credential use.

GitHub requires a `workflow_dispatch` workflow to exist on the **default branch**:
https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
This new branch-only workflow therefore **cannot be dispatched yet**. Installing
it on default requires a separately approved routing change/merge; none is
authorized here. After review, the protected local command above is the available
alternative. Do not modify or dispatch the canonical exchange workflow for PR 124.
Environment credential names/configuration remain concrete setup blockers until
provisioned; existing exchange secrets alone are insufficient.

## Checks, retention and cleanup

The run proves ordinary-member denial; allowlisted AAL1 `mfa_required`; actual
TOTP verification and Auth-issued AAL2; overview, structured support filter and
history/event detail; append-only note, exact immutable replay and conflicting
payload denial; unchanged support revision/status and visible case/event baseline;
and saved-token denial (401 or 403) after local-session sign-out. Denials must be
error-only envelopes, including no `summary`, and responses must be `no-store`.

Only test sessions are automatically signed out. No accounts, factors, allowlist
entries or database records are automatically deleted. **One run-owned internal
audit note is intentionally retained as disposable staging evidence**, including
unknown delivery on failures. It is not a collector message. Connector review may
retain it or separately authorize exact cleanup using artifact request/support/
actor IDs and ownership checks. A narrowly reviewed cleanup request is:

```sql
-- First SELECT and independently verify the exact owned run's row.
select * from private.marketplace_admin_audit
where actor_id=:admin_id and request_id=:request_id
  and entity_type='support' and entity_id=:support_id::text and action='support_note';
-- Only after explicit cleanup approval, DELETE using those same predicates.
```

Do not delete historical/shared audit, reset accounts, touch shared lifecycle
records, or remove factors from reused identities. Account/allowlist/fixture
retirement is a separate connector-owned, specifically scoped action. On failure,
the safe phase and possible note request key identify what to inspect; no cleanup
success is inferred. Process termination can prevent sign-out/report generation,
so operator session review is required after interrupted runs.

UI private-content suppression and physical-device checks remain outstanding.
The frontend hardcodes production and is deliberately excluded; a separately
reviewed staging-only route with all production traffic blocked is required for
live UI evidence. The script's denied saved-token check is backend evidence only.

Offline regression command (no hosted requests):
`node --test tests/hosted/hosted-admin-smoke.test.mjs`.

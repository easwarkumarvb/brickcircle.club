# Canonical exchange rollout and smoke-test runbook

This runbook is for an isolated staging project only. It does not authorize a production migration or deployment.

## Preconditions

- Apply the migration to a disposable PostgreSQL 17/Supabase environment reconstructed from the approved baseline.
- Run the canonical state-machine SQL gate, Supabase database lint, security advisors, and the full browser matrix.
- Confirm no row in an open legacy workflow is omitted from exchange_cases and every non-terminal physical item has exactly one exchange_case_item_locks row.
- Review every migration_review_required case before enabling writes.
- Keep the previous web release available for frontend rollback; database rollback is forward repair only.

## Administrator legacy-quarantine reconciliation

This procedure runs only from the approved server-side administration service with the `service_role` credential. The service must authenticate the human administrator, pass that administrator's UUID as `p_administrator_id`, and confirm that UUID already exists in `private.exchange_admins`. Never expose the service credential or either reconciliation RPC to a browser. Ordinary participants intentionally have no `EXECUTE` privilege and no access to the lock or reconciliation tables.

### Preconditions

1. Pause exchange writes for the affected legacy cases. Do not alter or delete the legacy `exchange_requests` or `exchanges` rows.
2. Record the migration backup identifier, operator identity, incident/ticket reference, and current case versions.
3. Obtain direct evidence for the physical holder of every affected set. Acceptable evidence must identify the exact physical set and holder; a legacy status alone is not custody evidence.
4. For a set verified with its registered owner, use that owner's UUID and a null `lock_case_id`. For a set held by somebody else, identify the affected case that involves that holder, supply it as `lock_case_id`, and keep every case reporting that set consistent. Any case containing non-owner custody must use `DISPUTED`.

### Inspect the complete evidence bundle

Call this through the server administration service before making a decision:

```sql
select public.exchange_quarantine_report(:approved_administrator_id);
```

Conflict groups may mix request-only proposals with exchange-backed cases. For every case, review `legacy_source_kind`, `legacy_request`, `legacy_exchange`, both `items`, each `current_lock`, all `referencing_cases`, and `recorded_custody`. `request-only` means no legacy `exchanges` row exists; `request-and-exchange` means both source records exist; `exchange-backed` identifies the defensive exchange-only form. A missing source record is not evidence of custody, and the report deliberately makes no custody inference from legacy status.

### Record each case decision

Submit each quarantined case once with its current `state_version`, a unique durable idempotency key, a specific reason, and exactly one outcome for each case item:

```sql
select public.reconcile_exchange_quarantine_case(
  :approved_administrator_id,
  :case_id,
  :expected_state_version,
  :resolution, -- CANCELLED, COMPLETED, or DISPUTED
  :reason,
  jsonb_build_array(
    jsonb_build_object(
      'item_id',:item_a,
      'verified_holder_user_id',:verified_holder_a,
      'lock_case_id',:lock_case_a,
      'evidence',:custody_evidence_a
    ),
    jsonb_build_object(
      'item_id',:item_b,
      'verified_holder_user_id',:verified_holder_b,
      'lock_case_id',:lock_case_b,
      'evidence',:custody_evidence_b
    )
  ),
  :idempotency_key
);
```

The first decision in a connected conflict group records an immutable audit event but does not release any group lock. Once every connected case has a consistent decision, the final call atomically updates all cases, item locks, owner-review flags, audit rows, events, and participant notifications. Owner-held items become unavailable and require owner review before re-enabling. Non-owner-held items retain a `MANUAL_REVIEW` lock assigned to the explicitly selected disputed case.

Apply this resolution matrix:

- A request-only case may be `CANCELLED` when both physical items are verified with their registered owners.
- A request-only case must be `DISPUTED` when any item is verified with a non-owner. It can never be `COMPLETED`, because no legacy physical exchange record supports that result.
- A case with a legacy exchange may be `CANCELLED`, `COMPLETED`, or `DISPUTED`, but any non-owner-held item forces that case to remain `DISPUTED`.
- Every connected case that reports the same item must record the same verified holder and `lock_case_id`. The selected lock case must involve both the item and non-owner holder.

After each call, inspect `pending_related_cases` and the returned report. A value greater than zero means the component is intentionally still quarantined: identify the cases in each item's `referencing_cases` that have no `reconciliation` record, gather their evidence, and submit those cases separately. Do not interpret a recorded first decision as permission to release any item.

### Audit after reconciliation

Run the report again and retain it with the incident record. Verify the database invariants through the server-side audit connection:

```sql
select id,state,state_version,migration_review_required,migration_note
from public.exchange_cases
where id = any(:connected_case_ids)
order by id;

select ci.id,ci.user_id,ci.available_for_exchange,ci.exchange_review_required,
       l.case_id,l.lock_kind
from public.collection_items ci
left join public.exchange_case_item_locks l on l.item_id=ci.id
where ci.id = any(:affected_item_ids)
order by ci.id;

select case_id,event_type,actor_user_id,idempotency_key,metadata,created_at
from public.exchange_case_events
where case_id = any(:connected_case_ids)
  and event_type in ('legacy_quarantine_decision_recorded','legacy_quarantine_reconciled')
order by created_at,id;
```

Confirm that every reconciliation row is finalized, every owner-held item has no lock and has `exchange_review_required=true`, and every non-owner-held item has exactly one `MANUAL_REVIEW` lock attached to the recorded case. The owner may call the normal availability action only after the lock is absent and the physical set has been reviewed.

### Failure recovery

- If the server loses the response, retry the identical payload with the same idempotency key. The existing decision is returned without another event, notification, lock change, or version increment. Do not generate a new key for the same intended decision.
- If a resolution is rejected (including `COMPLETED` on a request-only case), correct the proposed decision only after reviewing the source evidence. The rejected transaction leaves no decision, event, notification, or lock mutation.
- If evidence conflicts with an earlier recorded outcome, stop. The function rejects the call and leaves the connected group quarantined. Escalate for evidence review; do not delete or edit audit rows.
- If a stale version is reported, regenerate the quarantine report, confirm the current version and pending connected cases, and reassess before submitting a new intended action.
- If only some cases are recorded, leave the NULL-attributed `MANUAL_REVIEW` locks in place. Continue with the remaining explicit decisions; never delete those locks manually.
- If the atomic finalization fails, the transaction rolls back case, lock, item, event, and notification changes together. Correct the input or database fault, then retry with the same key.
- A non-owner custody result remains `DISPUTED` and locked. After a separately verified return, use the existing administrator resolution workflow; preserve its reason and evidence in the audit trail.

## Two-user smoke test

### Automated hosted Supabase release gate

`scripts/hosted-exchange-smoke.mjs` automates the hosted boundary checks without applying migrations or deploying application code. It uses the public Supabase client for three independent password-authenticated sessions and a server-only staging secret solely to inspect protected notification delivery evidence. The secret must never be exposed to browser code or stored in the repository.

The harness deliberately retains its completed canonical case, events, messages, notifications and two synthetic collection items as staging audit evidence. It never deletes an Auth user, existing collection item, legacy record, canonical audit row or notification. Reset or replace the isolated staging project between release candidates when retained evidence should be discarded.

#### GitHub environment setup

The manual dispatcher must first exist on the repository default branch. Review and merge the dedicated prerequisite dispatcher PR before attempting to run the PR #102 gate. The dispatcher validates the requested open, same-repository PR, exact `codex/canonical-exchange-state-machine` branch and immutable head SHA in a secret-free job. Only a successful validation allows the protected environment job to start. The workflow remains manual-only and never runs for `push`, `pull_request`, `pull_request_target` or a schedule.

Create a protected GitHub environment named `hosted-supabase-staging`. Require an approving reviewer and restrict it to the intended staging branch. Configure these environment secrets:

- `BC_STAGING_SUPABASE_URL`: direct `https://<project-ref>.supabase.co` staging URL.
- `BC_STAGING_SUPABASE_PUBLISHABLE_KEY`: staging publishable key, or the legacy staging anon key.
- `BC_STAGING_SUPABASE_SECRET_KEY`: staging server secret/service-role key. It is used only by the Node process to read protected outbox evidence.
- `BC_STAGING_USER_A_EMAIL` and `BC_STAGING_USER_A_PASSWORD`.
- `BC_STAGING_USER_B_EMAIL` and `BC_STAGING_USER_B_PASSWORD`.
- `BC_STAGING_USER_C_EMAIL` and `BC_STAGING_USER_C_PASSWORD`.

Configure these non-secret environment variables:

- `BC_STAGING_SUPABASE_PROJECT_REF`: exact project ref parsed from the staging URL.
- `BC_PRODUCTION_SUPABASE_PROJECT_REF`: production project ref. The harness refuses to run if it matches staging.
- `BC_STAGING_SET_A` and `BC_STAGING_SET_B`: two different set numbers already present in the staging catalogue.
- `BC_STAGING_NOTIFICATION_MODE`: exactly `outbox-only`.
- `BC_STAGING_ALLOWED_EMAIL_DOMAIN`: exactly `example.test`, or the same dedicated staging sink domain configured below.
- `BC_STAGING_APPROVED_SINK_DOMAIN`: optional dedicated staging sink domain. It is required when the allowed domain is not `example.test`.

Users A and B must be disposable adult-confirmed staging accounts in the same normalized city and country. User C must be a third, unrelated adult-confirmed staging account. All three emails must use the exact allowed domain. The harness accepts the reserved non-routable `example.test` domain or one explicitly approved staging sink; it rejects mixed domains, common public providers and `brickcircle.club` identities before authentication or database mutation. Do not use production users. The approved canonical migration, notification-email migration and notification Realtime publication must already exist in staging; this workflow does not apply them. Pause notification delivery workers and remove real provider credentials, or route them to the approved staging sink, before setting `BC_STAGING_NOTIFICATION_MODE=outbox-only`. The variable remains an operator acknowledgement in addition to the machine-enforced email guard; it does not reconfigure Edge Functions or cron jobs.

Before enabling the workflow, run the guard tests locally:

```sh
npm ci
npm run test:hosted:guard
```

#### Running the gate

1. Open **Actions → Hosted Supabase Exchange Smoke → Run workflow** from the default branch dispatcher.
2. Enter the open PR number in `pull_request_number`.
3. Enter the PR's exact full 40-character head SHA in `expected_head_sha`.
4. Enter `RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE` in `confirmation`.
5. Confirm the secret-free PR-validation job passed, then approve the protected `hosted-supabase-staging` environment after independently confirming the selected project ref is not production.
6. Retain the uploaded `hosted-exchange-smoke-<sha>` artifact and the GitHub run URL with the release evidence.

The workflow refuses a malformed or mismatched commit SHA. The Node harness independently refuses an unconfirmed run, HTTP/local/custom-domain target, URL/project-ref mismatch, staging/production ref equality, reused public/server key, duplicate user identity, or identical product pair.

The automated path verifies:

- Supabase Auth and `getUser()` for three separate sessions.
- eligible same-city profiles, catalogue reads, authenticated collection/wishlist writes and reciprocal matching through PostgREST/RPC.
- proposal creation, a 30-to-60-day counterproposal, the complete meetup/handoff/return lifecycle, completion and one canonical review.
- accepted lock ownership, disappearance from reciprocal matching, exact handoff-to-return duration, archived-conversation readability and write closure.
- explicit owner review/re-enable, reciprocal rematching, and a second accepted case cancelled before handoff with atomic release and idempotent retry.
- rejection of ordinary cancellation after mutual physical handoff followed by the locked early-return path.
- stale-version rejection without state, event, notification or lock mutation.
- one reusable client switching from User A to User C only after local sign-out and Realtime channel removal, followed by third-user isolation checks.
- both-arrived enforcement for initial and return inspection.
- persistent case messages plus recipient delivery and third-user suppression through Realtime notification subscriptions.
- participant visibility plus third-user RLS denial for cases, events and messages.
- committed-response-lost retries for proposal, transition and message with exactly one case/event/message/notification outcome.
- completed item lock release, owner-review status and collector rating update.
- durable `notifications` records, unique dedupe keys and exactly one server-only `notification_email_deliveries` row for every queue-eligible case notification.

The harness does not invoke Brevo, Web Push delivery, cron/reminder jobs, or any real notification credential. `notifications` remains the durable push source; `push_delivery_log` records actual asynchronous delivery attempts rather than a separate queue. Real provider delivery and scheduled reminder/expiry execution therefore remain separate staging gates.

#### Hosted failure recovery

- Treat any partial run as retained staging evidence. Do not delete its case, users, events, locks or notifications to make a retry pass.
- Correct missing profile/catalogue prerequisites or environment configuration, then start a new run. New intended actions receive a new run ID; retries inside one action retain the same idempotency key.
- If the Realtime subscription times out but notification rows exist, verify that `public.notifications` is in the staging `supabase_realtime` publication and that recipient RLS is active. Do not weaken RLS.
- If notification rows exist without email-delivery rows, inspect the staging `marketplace_notification_email_outbox` trigger and canonical allowlist. Do not call the delivery provider from this gate.
- If a lifecycle step fails, preserve the case and inspect `exchange_case_events`, item locks and the redacted artifact. Repair staging forward or replace the disposable staging project; never point the harness at production.
- A failure report contains project ref, run ID, tested PR/SHA and a sanitized error only. Success artifacts hash UUIDs and contain no credentials, API keys, passwords, URLs, Auth responses or user emails.
- Replace or reset the isolated staging project between release candidates when retained canonical evidence is no longer required. Never use broad cleanup queries against production-like data.

### Manual two-user product smoke

Use two ordinary adult accounts in the same city. Each account needs an owned set with an owner photo, condition and completeness, and each must wishlist the other set.

1. User A marks one owned set Available to Exchange. Confirm matching shows exactly one reciprocal result.
2. User A proposes a 60-day exchange. Confirm both items become Proposal pending and User B receives one in-app notification.
3. Retry the proposal action. Confirm the same case opens and no duplicate case, event, notification or item lock is created.
4. User B counters with 30 days. Reload both browsers and confirm the single case, changed version, deadline and conversation survive.
5. User A accepts. Confirm both sets show Reserved and neither appears in matching.
6. Propose and accept a future public meetup. Confirm the other participant cannot silently overwrite an accepted meetup.
7. Both users acknowledge the safety checklist, mark arrival, and approve inspection. Confirm handoff remains unavailable until both inspections exist.
8. User A confirms handoff. Attempt cancellation and confirm the case becomes a handoff issue and both items remain locked; use a separate clean case for the happy path.
9. On the clean case, both users confirm handoff. Confirm ACTIVE begins only after the second confirmation and return_due_at is exactly the chosen duration after handoff_at.
10. Send and retry one case message. Confirm one durable message and one recipient notification.
11. Request early return, propose and accept a public return meetup, then have both users arrive, inspect and confirm physical return.
12. Confirm COMPLETED, archived conversation, no item locks, and both sets show Needs owner review and remain unavailable.
13. Explicitly re-enable each reviewed set. Confirm it becomes matchable again.
14. Repeat a proposal and cancel before handoff. Confirm each owner preference is restored.
15. Block one collector. Confirm the pair disappears from matching and proposal creation is rejected in either direction.
16. As a third ordinary account, verify cases, events, messages and notifications are unreadable and no lifecycle table is directly writable.
17. Report an issue. Confirm the case stays locked, messages remain readable, and only a user recorded in private.exchange_admins can execute the resolution RPC.

## Failure and recovery checks

- Disconnect during a transition and retry with the same idempotency key; expect the original result.
- Submit an action with a stale state_version; expect a refresh-required error and no event.
- Simulate email/push delivery failure; the user transition must commit and the delivery row must remain retryable.
- Let a proposal deadline pass and run expire_exchange_cases as service_role; expect EXPIRED and restored preferences.
- Run queue_exchange_case_reminders twice for the same window; expect one notification/outbox record per dedupe key.
- Confirm a database error is rendered as a recoverable UI message and reload restores the server state.

## Rollout sequence

1. Freeze overlapping exchange PRs and record the exact main SHA.
2. Back up and count legacy requests, exchanges, meetups, returns and exchange-linked messages.
3. Apply the forward-only migration in staging; compare source and migrated counts plus item-lock coverage.
4. Reconcile every `migration_review_required` conflict group through the administrator procedure above; do not manually delete NULL-case locks.
5. Deploy the versioned frontend to staging and complete this runbook in Chromium, Firefox, WebKit and 390px mobile.
6. Obtain technical, security and product approval for the migration report.
7. Schedule production separately with monitoring for RPC errors, lock conflicts, notification-outbox backlog and migration-review rows.
8. If frontend validation fails, restore the prior web assets and keep canonical rows locked/read-only. Repair forward; do not drop the canonical tables or rewrite custody history.

## Exact residual risks

- The repository migration history does not reconstruct the oldest foundational schema without QA bootstrap fixtures. Production-equivalent reset must be solved before deployment approval.
- Legacy ambiguous custody states cannot be inferred safely; they require human resolution.
- PostgreSQL CI proves server behavior but not a real hosted Supabase gateway, Realtime or Edge Function delivery. Run the guarded hosted workflow and retain its artifact before approval; real provider delivery remains a separate staging check.
- Browser automation uses deterministic fixtures; the final two-person physical handoff/return smoke test remains a human gate.
- Old lifecycle tables remain for audit and compatibility. Their write privileges are revoked, but removal is intentionally deferred to a separately reviewed migration.

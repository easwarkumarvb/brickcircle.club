# Canonical exchange rollout and smoke-test runbook

This runbook is for an isolated staging project only. It does not authorize a production migration or deployment.

## Preconditions

- Apply the migration to a disposable PostgreSQL 17/Supabase environment reconstructed from the approved baseline.
- Run the canonical state-machine SQL gate, Supabase database lint, security advisors, and the full browser matrix.
- Confirm no row in an open legacy workflow is omitted from exchange_cases and every non-terminal physical item has exactly one exchange_case_item_locks row.
- Review every migration_review_required case before enabling writes.
- Keep the previous web release available for frontend rollback; database rollback is forward repair only.

## Two-user smoke test

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
4. Resolve or quarantine every migration_review_required case.
5. Deploy the versioned frontend to staging and complete this runbook in Chromium, Firefox, WebKit and 390px mobile.
6. Obtain technical, security and product approval for the migration report.
7. Schedule production separately with monitoring for RPC errors, lock conflicts, notification-outbox backlog and migration-review rows.
8. If frontend validation fails, restore the prior web assets and keep canonical rows locked/read-only. Repair forward; do not drop the canonical tables or rewrite custody history.

## Exact residual risks

- The repository migration history does not reconstruct the oldest foundational schema without QA bootstrap fixtures. Production-equivalent reset must be solved before deployment approval.
- Legacy ambiguous custody states cannot be inferred safely; they require human resolution.
- PostgreSQL CI proves server behavior but not a real hosted Supabase gateway, Realtime or Edge Function delivery. Staging must cover those boundaries.
- Browser automation uses deterministic fixtures; the final two-person physical handoff/return smoke test remains a human gate.
- Old lifecycle tables remain for audit and compatibility. Their write privileges are revoked, but removal is intentionally deferred to a separately reviewed migration.

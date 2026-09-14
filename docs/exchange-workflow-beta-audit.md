# Exchange workflow beta audit

Status: implementation is blocked on this contract being reviewed. No production database, user, storage, email, push, or deployment action is authorized by this document.

## Current findings

The workflow is not yet a single state machine. Historical migrations define overlapping versions of request acceptance, cancellation, meetup, return, and notification functions. The browser still calls several workflow RPCs directly and reads several independently maintained views. Earlier isolated fixtures also implemented direct `exchange_requests` inserts while newer code expects a server-owned proposal RPC. This explains stale-branch conflict churn and tests that disagree about expected behavior.

The baseline contains two notification concepts (`notifications` and `member_notifications`) plus email outbox and push subscriptions. `notifications` is the exchange lifecycle source used by the app; `member_notifications` is growth automation. They must not be conflated.

## Canonical state map to implement

| Domain | State | Allowed transition | Actor |
|---|---|---|---|
| Match | discovered | proposal requested | either matching owner |
| Request | pending | accepted / declined / cancelled / released | recipient / requester / either owner for release |
| Exchange | accepted | meetup proposed | either participant |
| Exchange | meetup planned | handoff confirmed | either participant |
| Exchange | handoff pending | active | both participants confirm |
| Exchange | active | return planned / early-return requested / disputed | either participant |
| Exchange | return pending | completed | both participants confirm |
| Exchange | any pre-handoff state | released | either set owner |
| Exchange | active | disputed | either participant |

`released` is terminal and distinct from `completed`. A pre-handoff release cancels the request/exchange and releases both reservations. An active exchange cannot be silently released: it becomes an early-return request or dispute while reservations remain intact.

## Actor contract

| Action | Server checks | Records | Recipient notification / deep link | Reservation |
|---|---|---|---|---|
| Create proposal | caller owns offered item; reciprocal eligibility; both items available; duration | request + event | recipient, `#exchanges/{request}` | pending reservation |
| Accept / decline | recipient and pending request | request, exchange/event on accept | requester, `#exchanges/{id}` | reserve on accept; release on decline |
| Cancel / release pre-handoff | caller owns one of the items; not active | request/exchange + event | other party, exchange/request deep link | release both relevant items |
| Propose/confirm meetup | exchange participant; valid current state | meetup + event | other party, `#exchanges/{id}` | unchanged |
| Confirm handoff | exchange participant; meetup state | exchange + event | other party | remains reserved; active only after both |
| Message | derive recipient from exchange participants | message + event | other party, `#exchanges/{id}` | unchanged |
| Return / early return / dispute | exchange participant and active state | return/dispute + event | other party, `#exchanges/{id}` | release only on completed return |

All actions require `auth.uid()`, row locking/constraints where concurrent reservation is possible, idempotency keys/events, and server-derived recipient IDs. Email and web push are best-effort outbox consumers and must never block the transaction or in-app notification.

## Data ownership audit

- `collection_items`: owner-controlled collection metadata; availability/reservation changes only via workflow transitions once a request exists.
- Reciprocal matches: derived read model, not mutable browser state.
- `exchange_requests` and `exchanges`: server-owned lifecycle records.
- `messages`: participant-only; recipient derived from exchange record.
- `notifications`: durable lifecycle inbox, recipient-scoped by RLS.
- `member_notifications`: separate growth/onboarding channel; not exchange source of truth.
- `email_outbox` and `push_subscriptions`: secondary delivery; no lifecycle authority.
- New workflow events: append-only audit source for idempotency and traceability.

## Security and RLS acceptance criteria

1. All exposed tables have RLS and ownership/participant policies.
2. Browser roles cannot insert/update/delete request or exchange lifecycle state directly.
3. Every privileged function uses explicit `auth.uid()` authorization, locked target rows, restricted execute grants, and a safe search path.
4. Messages, notifications, subscriptions, and collection items are inaccessible cross-user.
5. A database test proves unavailable/reserved items cannot enter competing active exchanges.

## Notification event matrix

Required durable inbox events: match discovered; proposal sent/received; accepted/declined/cancelled/released; message received; meetup required/proposed/confirmed; handoff required/confirmed; active/return reminder/return confirmed; early-return/dispute; completed/review requested. Every lifecycle notification carries an exact authenticated deep link. Duplicate retries must resolve to one event per actor/action/entity.

## Release/unreserve behavior

| Stage | Owner action | Result |
|---|---|---|
| Pending proposal | Release this set | request cancelled/released, both pending reservations removed, counterparty notified |
| Accepted before handoff | Release this set | exchange released, both items available, counterparty notified |
| Active after handoff | Request early return / contact participant / report issue | no silent unreserve; active reservation remains until safe return or dispute resolution |

## Implementation and test plan

1. Consolidate lifecycle mutations into one versioned server contract and remove superseded browser mutations only after parity tests exist.
2. Add deterministic two-user and third-user-isolation fixtures that exercise every transition and retry/concurrency path.
3. Add UI Next Step cards sourced only from canonical state.
4. Test Chromium locally, then Firefox/WebKit, mobile accessibility, SQL/RLS/invariant gates in CI.
5. Require all checks green and a clean two-user smoke test before requesting merge.

## Production-data deletion plan

No deletion is authorized. Before any cleanup: take a reversible non-sensitive export, report exact counts for auth users, profiles, collection items, requests, exchanges, messages, notifications, email outbox, push subscriptions, and owner-photo objects; preserve the owner/admin account; then obtain an explicit final confirmation for the exact scope. Delete dependent records in foreign-key-safe order only after that confirmation.

## Known risks

- Existing historical migrations and stale branches cannot be treated as a verified canonical deployed schema without a read-only environment review.
- Current CI failures must be fixed, not waived; isolated fixtures must mirror the final RPC contract.
- Email delivery is unverified until an approved staging-safe test succeeds.

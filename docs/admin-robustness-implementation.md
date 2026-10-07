# Robust BrickCircle administration: implementation brief

Status: architecture and source review only; application changes are not implemented by this document.
Owner workflow: Codex architecture/review; OpenCode implementation using one worker.
Starting point: current main after merged PR #123, extending PR #120.

## Product contract

Build on the existing /admin.html console. The admin is a last-resort platform operator.
Collectors retain control of proposals, terms, acceptance, meetups, handoffs and returns.
Do not add forced exchange completion/cancellation, custody transfers, fault adjudication,
compensation, rating edits, broad private-message access or routine lifecycle arbitration.
Support remains reachable at support@brickcircle.club.

The existing console already provides MFA, a trusted admin allowlist, live-session checks,
member lookup, catalogue visibility, exchange events, internal support triage and audit records.
Preserve these controls. Re-registration after the previous reset does not automatically
restore authorization; recover access only through the established trusted allowlist process.

## Source review findings

Reviewed admin.html, admin-dashboard.js, the Edge handler, the marketplace-admin migration,
tests/isolated/admin-console.spec.ts and docs/marketplace-admin-console.md on main.

1. api() has abort controllers for session purge but no elapsed-time deadline. A hung read
   or write can leave controls pending indefinitely.
2. Authentication service errors and definitive invalid sessions share the same purge path.
   Separate temporary outages from confirmed sign-out while keeping authorization fail closed.
3. load() clears all results before a refresh. Failed refreshes lose usable context.
4. A query string is the only list filter. Support priority/age and exchange-stage views
   require manual searches.
5. Member collection/wishlist and exchange events stop at 100 records. The UI labels this,
   but administrators cannot navigate the full history.
6. Support notes currently live in mutation reasons in the global audit log. There is no
   dedicated request detail/history or standalone internal-note action.
7. The legacy administration document still says staging-only although the PR rollout
   record reports production deployment. Correct documentation after checking actual state.

These are source observations, not a completed penetration test or a fresh production audit.

## Implementation order

### 1. Reliability and safe session handling

Implement this first as a reviewable change on this branch.

- Add a bounded whole-operation deadline (proposed 15 seconds, measured from api() entry)
  covering session/user verification, fetch and response parsing. Do not rely on fetch
  cancellation alone: SDK calls also need a deadline race and stale-result guards.
- Track operation generation and account identity across every await. Ignore late results
  after timeout, account switch, navigation or purge.
- Use structured errors: timeout, unavailable, unauthenticated, forbidden, mfa_required,
  conflict, validation and not_found. Treat explicit server denial as authoritative.
  SDK transport failures do not prove logout.
- Immediately erase private content on confirmed sign-out, account change, revoked session,
  denied access and MFA downgrade. Temporary failure must never reveal previously hidden data.
- Retain previously authorized same-account read results on ordinary refresh failures,
  with a clear last-updated time and stale warning. Disable mutation initiation while
  access is uncertain; a fresh server-authorized read is required before enabling it.
- Preserve the exact pending mutation envelope and request ID after timeout/unknown delivery.
  Retry is explicit and uses the existing idempotent RPC. Do not automatically replay writes.
  Canceling a dialog does not imply that a timed-out write was rolled back.
- Clear timers, abort controllers and listeners correctly. No token, setup key, private
  payload or pending mutation in logs, URLs, local storage or service-worker caches.
- Preserve existing MFA enrollment/cancellation behavior and the admin asset release contract.

### 2. Find and inspect records

Extend server contracts additively; existing clients must continue to work.

- Add allowlisted structured filters for support status and exchange stage; support age
  filters use server time. Use explicit filter fields, never SQL fragments from clients.
- Make overview counts navigable to the equivalent filtered list. Count definitions and
  generated_at must be consistent; missing/failed data is unavailable, not zero.
- Add pagination for member collection/wishlist and exchange events. Stable order requires
  a unique tie-breaker. Exact totals and bounded page sizes remain server-controlled.
- Preserve section, filters and list position when closing record details. Put no search
  terms, member emails or other private values in shareable URLs.
- Keep mobile cards, 44px targets, focus return, keyboard dialogs and no horizontal overflow.

### 3. Support desk

- Provide a dedicated support detail view containing the submitted request, current internal
  triage status, linked exchange timeline and administrator note/status history.
- Separate append-only internal notes from status changes. Add a narrow audited note RPC,
  enforcing the same trusted-admin, live-session and AAL2 checks in the database.
- Notes use actor-scoped request IDs and payload-bound replay. Status changes retain
  optimistic revisions and audit entries in the same transaction.
- Internal resolved means the support workflow is resolved. It does not resolve a peer issue,
  modify an exchange or send a message to collectors.
- No email/WhatsApp sending is included in this build.

### 4. Platform safety follow-up

Suspension, fraud and content controls are within the product's admin role, but implement
them only after mapping all server write paths and existing policies. A UI-only suspension
is unacceptable. Any future restriction must preserve affected collectors' ability to arrange
safe return of items and read their existing case history. Document enforcement and release
semantics before introducing a new suspension action.

Do not add arbitrary SQL, bulk identity deletion, admin impersonation, MFA bypass or an
email-based administrator promotion endpoint.

## Security and database boundaries

Browser -> admin-dashboard Edge Function -> narrowly scoped RPC -> private admin state/audit.
Browser uses publishable key and the signed-in token. No service-role key in the client.
Both Edge and database authorization remain mandatory; editable metadata cannot grant access.
Every privileged read/write must recheck trusted admin membership, active session and AAL2.
Keep fixed function search paths, explicit grants, input bounds, allowed origins and no-store.

Before changing Supabase features, verify current official documentation and relevant changelog.
Create additive migration files using the repository's Supabase CLI workflow. Use disposable
staging for database tests and advisors. Never run destructive fixtures against production.
Preserve the canonical exchange tables/state machine and existing catalogue hide-import override.

## Required evidence

For reliability changes, add meaningful isolated cases for a hung SDK call, hung response,
malformed response, temporary auth outage, definitive denial, timeout followed by a late
response, sign-out/account switch during a pending request, and successful same-key retry
after a write commits but its response is lost. Validate that uncertain access disables writes.

For new filters/details/support actions, test Edge allowlists, pagination totals/order,
escaping, ordinary-member denial, AAL1 denial, expired/revoked sessions, allowlist revocation,
same-key replay, conflicting replay and stale revisions. Run real-role rollback-only staging
checks as well as injected tests.

Run:
- npm run typecheck
- npm run syntax-check
- npm run release:check
- npm run test:security-contracts
- targeted admin-console isolated tests in Chromium, Firefox and WebKit with one worker
- accessibility and 320/390/768/1440px layout checks
- full required PR CI and Beta Release Gate before merging

A successful mocked test is not evidence of production authorization or physical mobile behavior.
Report exact commands/results, final commit and outstanding checks. Do not claim deployment
until the deployed release is independently observed.

## OpenCode handoff

Check repository instructions and a clean working tree before editing. Fetch main and confirm
PR #123 is merged. Use this branch, or rebase it on current main without discarding others' work.
Verify an authenticated OpenCode provider with a small model call. If unavailable, report the
specific blocker; do not silently substitute Codex implementation.

Implement phase 1, validate and request Codex review; then implement phases 2 and 3 with their
database/API/UI tests. Keep the PR draft until functional changes and required evidence exist.
Do not deploy, merge, modify production accounts or run a new data reset as part of this brief.

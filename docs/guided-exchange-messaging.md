# Guided exchange conversations

Messages is the collector-wise inbox: one row per counterparty, sorted by latest direct message, exchange message, or case activity. The row combines unread counts and shows the latest snippet. Opening it presents a single chronological timeline of direct and case messages and durable case events. Every case entry retains its ID and can focus that case without changing collectors. The destination selector defaults to general chat for a collector-row entry; an exact case link selects that case, never an arbitrary newest case. Per-destination drafts survive switching and retries. A case action reads the selected server row; text never advances custody or the lifecycle. Matched-item proposals, counters, meetup and return forms appear within Messages. Legacy exchange URLs and lifecycle notifications resolve to an exact Messages case; a message notification also focuses its exact message when available. Unauthenticated links remain in the URL for post-login resumption; unavailable cases show no participant detail. The older exchange-detail renderer is retained only for compatibility, not reached by normal navigation.

The guide derives its primary action from the current server record and signed-in participant. It shows either **Your turn**, **Waiting for partner**, or **Closed**. Messages never accept terms, confirm inspection or change custody.

| Step | Explicit confirmation | Waiting behavior |
| --- | --- | --- |
| Proposal | Recipient accepts, declines or counters | Proposer waits for response |
| Meetup | One collector proposes place/time; the other accepts | Proposer waits for agreement |
| Safety | Both confirm the checklist | First confirmer waits |
| Arrival | Both confirm they are physically present | Inspection stays locked until both arrive |
| Inspection | Each inspects and approves | Handoff stays locked until both approve |
| Handoff | Each confirms actual physical custody change | Exchange starts only after both confirmations |
| Experience | Agree a normal or early return | Sets stay reserved |
| Return meetup | One proposes; the other accepts | Proposer waits for agreement |
| Return | Both arrive, inspect, then confirm their sets are back | Completion waits for both return confirmations |
| Closed | Read-only conversation | Peer review remains available inline; owners re-enable sets in My LEGO |

Agreed venue/time appears next to the next step. A collapsed checklist shows the two independent confirmations. Other options are separate from the primary action. The complete journey is available under a disclosure rather than competing with the current action.

## Delivery and refresh

Both direct and exchange sends use sender-scoped idempotency keys. The database serializes retries with a transaction advisory lock and a unique key; an exact retry returns the same message, while a changed recipient/case/body is rejected. The message and its notification commit together. A user may deliberately send identical text again after a successful send with a new key.

Drafts stay in memory during navigation. An uncertain delivery preserves the draft and request key, so the collector can safely retry. Account changes clear protected message state. Operation reconciliation is scoped to the initiating account.

The visible conversation refreshes every 15 seconds and on reconnect/visibility restoration. It skips hidden/offline pages and pending sends, prevents overlapping reads, and stops when the view is replaced or the page leaves. Refresh preserves draft, caret, focus, loaded history and scroll. A workflow action rechecks the conversation instead of taking the collector to another page. If a read was already running, a second refresh follows it so an older snapshot cannot suppress the new step.

Existing recipient notification realtime remains in place. This refresh fallback does not depend on adding database publication membership.

## Security and deployment

Apply `20261005173802_guided_exchange_messaging.sql` **before** releasing the frontend. It adds a nullable direct-message request key and invoker RPC, and strengthens the existing canonical writer without changing lifecycle rules. Old clients remain compatible; old direct writes simply have no key.

The new direct writer uses invoker security and existing message RLS. The existing canonical writer keeps its required fixed-search-path definer implementation, verifies the real participant, and rejects new messages in terminal cases. An exact replay of an already committed message remains available after closure; it does not create a new message or notification. Anonymous execution is denied. Direct table TRUNCATE/TRIGGER/REFERENCES privileges are removed from client roles.

Validation: `supabase/tests/guided_exchange_messaging.sql` is a staging-only rollback suite with real roles, RLS and notifications. The isolated browser suite covers both collectors at each stage, third-collector denial, exact-case notifications and login resume, pagination/colliding IDs, displayed-message unread watermarks, drafts/reconnect, mobile overflow and both lost-response retries. Hosted three-user and staging SQL checks remain separate release prerequisites.

## Three-user smoke test

Use three separate browser profiles/accounts, A, B and C. A and B should each add an assembled set with an owner photo, mark it available and want the other's set. C is an unrelated collector.

1. A sends B a proposal. Verify one conversation, proposal notification and A's waiting state.
2. B accepts from the conversation, proposes a public meetup, and A accepts it.
3. Each confirms safety and arrival. Confirm inspection remains locked while only one has arrived.
4. Each inspects and then confirms the physical handoff. Confirm the exchange starts only after both handoffs.
5. Send messages in both directions. Disconnect/reconnect, retain a draft, and retry an uncertain send without duplicates.
6. Arrange the return. Each arrives, inspects their own set and confirms it is back. Verify read-only chat on completion.
7. Leave peer reviews and re-enable each owner's set. C must not read or act on A/B's exchange or its messages.
8. In a separate proposal, counter the duration and cancel before mutual handoff. Verify shared terms and reservation release.

## User-data reset boundary

No reset is part of this migration. As inspected on 2026-10-05, production contains 5 authentication accounts, including 1 administrator, 7 canonical exchanges, 3 direct messages, 1 exchange message, 2 collection items, 28,560 catalogue sets and 7 stored objects. Re-inventory immediately before deletion.

The requested reset must name the production project, whether the administrator account is included, and uploaded user files. Preserve catalogue/reference/configuration data. Remove dependent legacy/canonical user records as well as profiles/auth accounts; cascades alone leave several non-cascading references and anonymized analytics records. Revoke sessions before deleting identities. Remove stored files through the Storage API before deleting their owners, not by deleting Storage metadata. Verify empty user-owned tables and successful new registrations before smoke testing. Never expose user identities or message contents in a public PR/reset report.

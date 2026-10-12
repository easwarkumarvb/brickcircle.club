# BrickCircle — Person-first Conversations Architecture

Status: DESIGN PROPOSAL / not production code. Prepared 2026-10-12 for Codex architectural critique before implementation.
Owner constraint: One collector → one conversation; WhatsApp-level navigation simplicity. Keep authoritative server-owned exchange state, audit trail, custody locking, safety and RLS. Local, in-person adult-collector exchanges only.

## Product contract

1. A collector taps **Messages** and sees one row per person, not a row per exchange case. Every row shows avatar, real display name, city, a recent message/event preview, accurate action-needed state, and a true unread count if backed by a durable server cursor. No misleading green online/read receipts.
2. Tapping a person opens a single chronological conversation with normal bubbles, date separators, unobtrusive system event cards, and one bottom-anchored composer. Back returns to the named-person inbox; deep links into a case or message resolve to the same person's conversation at the relevant card.
3. A compact pinned card summarizes an ongoing reciprocal exchange: both named physical LEGO sets with images, human-readable stage, whose turn it is, expected return date, and **one primary action**. The card is collapsible, does not displace the composer, and does not hide the chat.
4. If two exchanges coexist with a person, compact identified exchange chips keep their physical copies and stages unambiguous. Default general chat is always available, and choosing an exchange card creates explicit contextual action/reply mode; the UI never asks the collector to choose a database table, direct-vs-case thread, or 'message destination'.
5. Chat is conversation, not an authority to change terms. Buttons/sheets are the sole means of proposal/acceptance/meetup/handoff/return transitions. Typed agreement is not acceptance. Server decides permissions and transitions, never the UI.
6. **Messages never disappear** because a proposal is declined, a pre-handoff exchange is cancelled, an exchange is completed, or a case is disputed. Individual closed-case records may remain read-only, but the person-to-person composer stays available subject to trust/safety restrictions.

## Why the current implementation feels difficult

- The inbox now logically groups by peer (filteredConversationGroups, messageRow), but the composer exposes a technical 'Message destination' dropdown (collectorDestinationMarkup), with general and case-scoped chat as competing destinations.
- renderDirectThread creates the main person timeline, while selectCollectorCase binds the composer to a selected case and navigates on destination changes. This can feel like leaving the conversation or losing the draft.
- Proposed exchanges also appear in Matches, Exchanges > Needs action, exchange detail, and inside Messages. These are different workflow entry points for the same real-world relationship.
- Events are rendered as raw-ish collapsible case entries with repeated set names and case IDs, and the main case action guide is a full card. A small screen must scroll past operational controls just to converse.
- The message index fetches all paged direct messages, case messages, and cases, then loads each peer's case events separately. That is a latency and failure-amplification risk as the product grows.
- Device-local read watermarks are described as unread; they cannot truthfully synchronize multiple devices. Preserve the label 'unread on this device' until a server-side read cursor exists.

## Target mobile experience

**Inbox** (full width): compact search over counterpart display names; All / Unread / Needs my action; rows: avatar + **collector name** + preview + time + unread/action indicator. One row per person even with several exchange cases. Navigation to this screen works from Home, Matches, Exchanges, notifications and the bottom nav.

**Conversation screen** (mobile-first, single pane):

```text
←  Maya R.                  Bengaluru       ⋯
   [Ferrari ↔ McLaren  |  Meet-up planning ⌄]
   [Your turn: Review meetup details]  [Review]
                  Today
Maya: Hi! Would Sunday morning work?
You: Yes, let's meet at the café.
        ◇ Meetup suggested · Sun 11:00
        [Review meetup]
                 [Message Maya…] [Send]
```

The exchange card collapses to a 1–2 line chip once viewed, and the keyboard never obscures the composer. The person header always remains visible. The chat owns the page; case detail is a bottom sheet, not a different destination.

**Multiple cases:** show two small labeled chips with actual physical item names and distinct statuses. A case chip can open that case's action sheet and contextual reply chip, but all messages remain in the one person stream. Never silently send a case-specific message to a different case. One ordinary composer defaults to general-person messages; selecting 'Reply about this exchange' puts an explicit, removable context chip above it and uses the existing case-scoped send RPC. If no case is selected, messages use the direct RPC. Close/cancel actions do not remove general chat.

## Interaction / lifecycle spec

| Real-world moment | Single-chat UX | Server-owned operation / guard |
|---|---|---|
| Reciprocal match | From Match tap 'Message Maya'; in chat an inline 'Propose Ferrari ↔ McLaren' action | Validate reciprocal pair, physical item owner, availability |
| Send proposal | One small sheet: Your set / Their set / 30–60–90 days / optional note; Send | create_exchange_case, idempotent; one case ID |
| Receive proposal | Chat event card with actual set images, period and 'Accept', 'Suggest change', 'Decline' | exchange_case_transition with expected version |
| Negotiate | Counteroffer replaces the action card in the *same* chat; no duplicate case | counter transition with expected version; preserve history |
| Accept | 'Agreed — plan meetup' card in conversation | reserve exact physical items atomically, never implicitly |
| Plan meetup | Compact form for public place, date and time; partner gets 'Confirm / Suggest new plan' | proposal/acceptance canonical transitions; neither side can unilaterally finalize |
| Safety + arrival | One tap 'I agree to safety checklist'; later 'I've arrived' with both progress statuses visible | Each participant's independent confirmation |
| Inspect + handoff | Show actual-set photos and ownership/condition checklist. Two distinct confirmations: inspect, then hand over. Never a single auto-handoff tap | Server requires both parties' gates before custody changes |
| Build period | 'You have McLaren · return by DATE'; normal chat remains below | ACTIVE state, durable due time, reminders without claiming delivery |
| Return | 'Plan return' → public meetup → both inspect → both confirm returned sets | Canonical return states, independent verification |
| Complete | Conversation shows completion summary and optional private review card | Immutable case closure, review release rules |
| Cancel before custody | 'Cancel exchange' under More; confirmation of consequences, sets released | Canonical pre-handoff cancellation and locks released |
| Early return / issue | Contextual 'Request early return' or 'Report an issue' without stopping messages | Return/dispute rules; no admin intervention unless last-resort support |

Never put actions in a disappearing toast. Progress and failures remain visible in the chat or as a small retryable card. Make the primary button action-driven: 'Confirm venue', not a bare 'Continue'.

## Domain architecture: one presentation, existing authority

**Do not rewrite the custody state machine.** Keep exchange_cases, exchange_case_events, exchange_case_messages, collection_items locking, transitions, audit, reputation and RLS authoritative. Retain send_collector_message and send_exchange_case_message RPCs.

Logical root is an unordered (user_a,user_b) collector pair. Render a unified feed of event kinds: direct_message, exchange_message, exchange_case_event, proposal_snapshot (only when needed for legacy history), and locally pending message. Server feeds must only expose authorized participants. Every exchange event names its case_id and physical item_a/item_b. 'One conversation' is a view/interaction contract, not permission to merge independent exchange cases in the database.

Message send contract: default compose sends to the verified peer using send_collector_message; contextual compose binds to one visible exchange case and uses send_exchange_case_message. A deterministic key incorporating sender + peer/case + client-generated message ID supports idempotent retry. Never infer case from 'most recent' or from free-form message text.

Data access: initially combine existing three protected sources into one client timeline to minimize risky migrations; in the next backend step expose a paged authenticated conversation feed/read model ordered by (occurred_at, type, source_id), with stable cursors, person rows and unread/action counts. Avoid N+1 case event queries. Enforce matching/participant membership in SQL/RLS, no service role in browsers, no arbitrary user IDs from clients. Prevent duplicate proposal and message delivery across refresh/reconnect.

Session and transport: account switch clears all prior messages, images, drafts and pending sends. Refresh tokens for the SAME account preserve drafts and scroll. Interrupted network must not render an empty account or say a message was delivered. Retry the same intent safely with the same idempotency key; never auto-generate duplicate proposals or handoffs. Notifications deep link to the relevant peer conversation and specific case event; no browser/OS notification contents before auth. Handle case permission changes mid-composition.

Data retention: closed exchange events remain immutable/read-only, ordinary chat remains unless blocked/restricted by actual trust policy. Never invent delivery, read, online, or typing indicators. Server-side unread cursor per authenticated user should replace the current device-only watermark once implemented; clearly label device-only unread until then.

## Mobile interaction requirements

- Portrait viewport widths 320, 360, 390, 430; desktop 768, 1280; 200% text zoom; screen readers and keyboard.
- One-column chat on mobile, sticky compact header (safe-area aware), fixed composer above keyboard and bottom nav, no page-wide horizontal scrolling, >=44px tappable targets.
- User-name search, back/forward persistence, unread indicators, visible composer, and easily reversible contextual reply selection.
- On-screen system cards summarize intent in plain language; no exposed state enums (PROPOSED / MEETUP_PLANNING), database IDs, 'Case' jargon, or 5-stage technical lifecycle.
- Scroll preserves location when older messages load. Auto-scroll only when user is near bottom, with a 'new messages' affordance otherwise. Input expands to a sensible maximum and maintains drafts per peer and case context.
- Text messaging must never be hidden by a pending action, rejected proposal, dispute, temporary API failure, or completed exchange.

## Non-negotiable acceptance gates

1. Three isolated staged collectors A, B, C. A↔B reciprocal match; A↔C independent chat; each name has exactly one inbox row. Cross-account conversation isolation verified.
2. Within A↔B run proposal, counter, accept, meetup, both safety, both arrival, both inspections, both handoffs, active period, return agreement, both return inspections, both return confirmations, completion and review without leaving the person conversation.
3. A↔B have two distinct cases (sequential, or concurrent only if distinct available physical copies). Both are readable in the same person conversation. A reply explicitly tied to one case never lands in the other.
4. Hard failures: declined proposal, cancelled pre-custody, offline send, delayed response, repeated taps, stale state_version, user A→B→A swap, refresh while saving, network timeout, closed case, participant-only RLS, and blocked deep links. No duplicate transitions or messages.
5. Each user sees correct, independently confirmed custody and return statuses. No administrator action needed in an ordinary completed exchange; admin only last-resort support.
6. Full browser checks for Android-sized 390px, small 320px, iPhone safe-area/keyboard, desktop, WebKit/Firefox/Chromium. Accessible contrast, touch targets, logical focus and no stranded overlays.
7. Metrics (privacy conscious): open peer chat → first reply time; match → proposal; proposal → acceptance; acceptance → agreed meetup; meetup → successful custody; return completion; cancellation and stage drop-off. Metrics are aggregate, not exposed user private chat content.

## Implementation sequence (separate PR; do not mix with current beta QA PR #134)

**A. Navigation and interaction shell**: one per-person inbox, persistent collector header, one chat stream, unified composer without technical destination dropdown, compact action card and case chips, bottom sheets. Keep existing RPCs.

**B. Server-informed conversation read model**: peer-level summary, cursor pagination, action-needed/unread, stable event ordering, secure deep links and indexed performance, with additive migrations only if needed.

**C. Full case action coverage**: proposal, counter, scheduling, safety, two-party handoff, returns, cancellation, after-custody issues/reviews entirely from contextual cards/sheets. Remove duplicative journey navigation; old deep links redirect safely.

**D. Failure resilience / polish**: send retries and draft persistence, offline status, auth/session safety, auto-scroll behavior, notifications, three-collector staged smoke, three-browser a11y/visual QA.

Release gate: Codex architecture review, focused acceptance specs, passing isolated Chromium/Firefox/WebKit, hosted isolated staging with real accounts and phone inspection. Do not merge, deploy or migrate production without explicit approval.

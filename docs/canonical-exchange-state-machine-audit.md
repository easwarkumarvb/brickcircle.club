# Canonical exchange state-machine audit

Base: `3f838046fc87ed80396013b59ef9778502573b39` (`main`, 2026-09-16 audit)

Safety status: this work is repository-only. No production database, storage, user, email, push, migration, or deployment action is authorized or performed.

## Executive finding

BrickCircle does not currently have one exchange aggregate. The live browser reads and mutates a request record, an exchange record, a meetup record, a return record, messages, collection availability, and notifications independently. Historical migrations repeatedly replace the same functions and state constraints. The latest “canonical” migration adds a release RPC but deliberately leaves that split lifecycle intact.

The replacement in this branch introduces one versioned `exchange_cases` record from proposal through terminal closure, append-only events, exactly one conversation per case, participant-only messages, item locks, one durable notification source, and one transactional action RPC. Legacy tables are retained read-only for compatibility and migration evidence; destructive cleanup is explicitly deferred.

## Runtime inventory

The production shell is `v2.html`. It loads one Supabase client and core owner (`app-v3.js`), plus `catalogue-discovery-v1.js` and `zen-ux-v1.js`. Numerous older root-level scripts remain in the repository (`auth-v3-hotfix.js`, `exchangeable-persistence-v1.js`, `meetup-submit-hotfix.js`, `session-persistence-v1.js`, older `v2*` runtimes), but they are not loaded by `v2.html` at this base.

Release assets are synchronized through `release-assets.json`, `v2.html`, and `catalogue-cache-sw.js`. PWA registration remains disabled by the current beta runtime and must stay disabled.

## Existing lifecycle and competing owners

| Concern | Existing owner(s) | Finding |
|---|---|---|
| Reciprocal match | Several historical `find_matches()` definitions | Derived correctly in principle, but lock exclusion follows legacy `exchanges`, not one case lock source. |
| Proposal | `exchange_requests`; `create_exchange_request()` | Server-created now, but retry identity is inferred from row values rather than a client idempotency key. No counterproposal versioning or 48-hour contract. |
| Acceptance | Repeated `respond_exchange_request()` definitions | Creates a second authoritative `exchanges` row and changes collection availability. Historical variants disagree on terminal states. |
| Meetup/handoff | `exchange_meetups`; `setup_meetup()`; `meetup_action()` | Separate mutable record. “confirmed” is overloaded as handoff. |
| Active exchange | `exchanges.state = swap_active` | Legacy state constraint still admits deposit, payment, shipping, building, and return-shipping states. |
| Return | `exchange_returns`; `setup_return_meetup()`; `return_action()` | Separate mutable record; completion currently makes items available automatically. |
| Release/cancel | Multiple `cancel_in_person_exchange()` definitions and `release_exchange_item()` | Functions disagree about disputed/active behavior and availability restoration. |
| Messages | Direct browser insert to `messages`; trigger derives recipient | Better than browser-selected recipient for case messages, but still not an explicit server action/idempotency contract. |
| In-app notifications | `notifications` plus many triggers/functions | Exchange source used by the app. Event keys are inconsistent and not universally case-scoped. |
| Growth notifications | `member_notifications` | Separate growth/onboarding channel. It is not the exchange notification source and must remain outside lifecycle authority. |
| Email/push | `notification_email_deliveries`, `push_delivery_log`, Edge Functions | Secondary outboxes are non-authoritative, but their allowlists reflect only part of the lifecycle. |
| Availability | Browser updates `collection_items.available_for_exchange`; triggers guard some states | Owner preference and operational locks are overloaded into one boolean. |

## Confirmed defects and risks

- Historical migrations replace `respond_exchange_request`, `cancel_in_person_exchange`, `find_matches`, notification producers, and meetup functions multiple times. Migration order—not one source file—decides behavior.
- `exchange_requests.status` and `exchanges.state` form two lifecycle authorities. Meetup and return tables add two more.
- Legacy exchange states include `deposit_pending`, `photos_pending`, `shipping`, `building`, `return_shipping`, `payment_status`, `deposit_amount`, and tracking-era behavior in an in-person product.
- The browser directly updates availability and directly inserts messages. It also composes several independent records to infer what happens next.
- Existing proposal idempotency is value-based and direction-specific. A retry with changed copy can create ambiguity, and counterproposal is not modeled.
- Existing completion sets both items available automatically. This conflicts with the required owner-review/re-enable rule.
- Existing cancellation/release code can force both items to available instead of restoring each owner’s captured preference.
- Existing append-only events lack previous/resulting state, state version, and a mandatory idempotency key.
- Current notification deduplication is entity-oriented and incomplete for repeated lifecycle events on one case.
- `notifications` and `member_notifications` have different consumers. Combining them would break growth automation and lifecycle semantics.
- Several security-definer functions are historical `public` RPCs with `search_path=public`; later functions are better hardened, but the effective schema remains difficult to reason about.
- Admin UI visibility uses a hard-coded browser user ID. Workflow authorization must not rely on it or editable user metadata.
- The repository’s migration chain begins after foundational production tables already existed. A literal fresh `supabase db reset` cannot reconstruct the whole application schema without the QA bootstrap fixtures. This is a migration-history risk that must be resolved separately before claiming a full production-equivalent bootstrap.
- Open PR #87 overlaps exchange UI/Reatime behavior; PRs #70, #68, #43, #28, and #10 overlap adjacent notification, availability, collection, or UX behavior. This branch intentionally does not stack on them.

## Impossible or unsafe combinations in the old model

- A request may be `accepted` while its exchange is `released`, `cancelled`, or absent.
- An exchange may be active while one item’s availability flag is true.
- A disputed exchange can be treated as terminal by one function and active/locked by another.
- One participant can have confirmed handoff while the legacy exchange still looks cancellable.
- Return completion can make both sets immediately matchable before either owner reviews the returned set.
- Notifications can exist without a stable case/version/event identity.

## Canonical replacement retained in this branch

### Remains

- Auth, adult attestation, profiles, city normalization, catalogue, canonical LEGO product aliases, wishlists, collection metadata/photos, reviews, analytics, membership, existing durable notification table, and secondary email/push delivery infrastructure.
- `collection_items.available_for_exchange` as the owner’s preference only.
- `find_matches()` return shape for frontend compatibility.

### Replaced

- `exchange_requests` + `exchanges` + `exchange_meetups` + `exchange_returns` as active workflow authorities.
- Browser-driven availability transitions and direct message inserts.
- Independent proposal/respond/meetup/return/release RPCs in the canonical frontend.
- Automatic re-availability after completion.

### New authoritative model

- `exchange_cases`: one lifecycle row, optimistic `state_version`, deterministic physical-item match key, deadlines, meetup/return agreement, independent participant confirmations, custody timestamps, and terminal timestamps.
- `exchange_case_item_locks`: one row per locked physical item, preventing competing proposals/reservations across either side of a case.
- `exchange_case_events`: append-only transition history with previous/resulting state, actor, version, idempotency key, and safe metadata.
- `exchange_case_conversations`: exactly one persistent conversation per case.
- `exchange_case_messages`: participant-only messages created through a server RPC.
- `exchange_case_transition()`: the only participant workflow mutation after proposal creation.
- `create_exchange_case()`: reciprocal revalidation, deterministic case identity, soft holds, conversation creation, event, and notification in one transaction.
- `set_exchange_item_availability()`: owner preference change with lock-aware behavior.

## Canonical transition table

| Current state | Action | Result | Actor |
|---|---|---|---|
| — | propose | `PROPOSED` | either reciprocal owner |
| `PROPOSED` | counter | `PROPOSED`, version increment | recipient/proposer alternates |
| `PROPOSED` | accept | `ACCEPTED` | current recipient |
| `PROPOSED` | decline / withdraw / expire | `DECLINED` / `WITHDRAWN` / `EXPIRED` | recipient / proposer / service |
| `ACCEPTED` | propose meetup | `MEETUP_PLANNING` | either participant |
| `MEETUP_PLANNING` | accept meetup | `MEETUP_CONFIRMED` | non-proposer |
| `MEETUP_CONFIRMED` | acknowledge safety | `MEETUP_CONFIRMED` or `INSPECTION` | each participant |
| `INSPECTION` | arrive / approve inspection | `INSPECTION` or `HANDOFF_PENDING` | each participant |
| `HANDOFF_PENDING` | confirm handoff | `HANDOFF_PENDING` or `ACTIVE` | each participant |
| pre-handoff | cancel | `CANCELLED` | either participant, only before either handoff |
| after one handoff | cancel / issue | `HANDOFF_ISSUE` | either participant |
| `ACTIVE` | request early return | `EARLY_RETURN` | either participant |
| `ACTIVE` / `EARLY_RETURN` | propose return | `RETURN_PLANNING` | either participant |
| `RETURN_PLANNING` | accept return | `RETURN_INSPECTION` | non-proposer |
| `RETURN_INSPECTION` | arrive / inspect / confirm return | `RETURN_INSPECTION` or `COMPLETED` | each participant |
| non-terminal custody state | report issue | `DISPUTED` | either participant |

Completion clears locks but sets both items to `NEEDS_OWNER_REVIEW`; owners must explicitly re-enable them. Cancellation restores the captured owner availability preference. After either handoff confirmation, locks remain until mutual return or authorized resolution.

## RLS and Data API contract

- `anon` receives no privileges on cases, locks, events, conversations, messages, or notifications.
- Participants receive SELECT only on their own cases, events, conversation, and messages.
- No participant receives direct INSERT/UPDATE/DELETE on lifecycle tables.
- Notification recipients retain SELECT and `read_at` update only on their own rows.
- Item locks and delivery outboxes are never browser-readable.
- Transition functions authenticate with `auth.uid()`, lock case/item rows, authorize participants, validate state/version, mutate atomically, append one event, and add recipient notifications.
- All new security-definer functions use `search_path=''`, schema-qualified names, `PUBLIC`/`anon` revocation, and minimal authenticated/service grants.
- Because Supabase’s 2026 Data API default no longer auto-exposes new tables, grants are explicit and are tested separately from RLS.

## Existing-data containment plan

- Pending requests migrate to `PROPOSED` with a 48-hour deadline based on creation time.
- Accepted legacy rows migrate to `ACCEPTED`; `swap_active` migrates to `ACTIVE`; completed/cancelled/released migrate to terminal equivalents.
- Legacy deposit/shipping/building/return-shipping/ambiguous inspection states are migrated to `DISPUTED` with `migration_review_required=true`. Physical custody is not guessed and item locks remain.
- Existing IDs are preserved in `legacy_request_id` / `legacy_exchange_id`; old records are not deleted.
- Existing messages remain preserved. Case conversations accept migrated message copies only when a deterministic legacy case association exists.
- Legacy code and tables are not dropped in this migration. Their browser write grants and RPC execution are revoked only after canonical frontend parity.

## Rollback and containment

The migration is forward-only. Rollback means disabling canonical frontend actions and restoring the previous release assets, not dropping migrated data. If validation fails, keep new cases locked/read-only, leave legacy records untouched, and repair forward. Destructive legacy cleanup requires a later, separately approved migration after production counts and reference verification.

## Verification required before rollout

- PostgreSQL 17 fresh canonical bootstrap and upgrade fixture.
- Transition, concurrency/idempotency, item-lock, notification, audit immutability, and actor-matrix tests.
- Two independent authenticated browser contexts against an isolated database-backed environment.
- Chromium plus Firefox/WebKit, mobile, keyboard/accessibility, reload/recovery, and network-failure tests.
- Supabase lint/advisors on a local or staging stack.
- Human two-user staging smoke test.

Production rollout is not part of this PR.

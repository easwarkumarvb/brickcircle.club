# BrickCircle Beta Reliability Audit

Status: **feature freeze / release-gate validation in progress**
Baseline: `main` at `ec4409d53cb2f6f73b66444e5879dc168df66d1e`  
Audit started: 2026-09-09  
Stabilization branch: `codex/beta-reliability-consolidation`

## Scope and safety boundary

This branch is limited to beta-critical reliability, deterministic recovery, and consolidation of overlapping runtime ownership. It must not add product features, redesign the product, change matching semantics, upgrade dependencies, deploy, merge itself, or read/write production Supabase data. Database work, if justified by an isolated reproduction, must be expressed as reviewed migrations and exercised only against isolated test infrastructure.

The beta is a **NO-GO** until the three-user workflow, database invariants, race cases, mobile workflow, soak run, and cross-browser release gates have recorded evidence in this document.

## Architecture invariants

These are the target truths against which every repair is evaluated.

1. `app-v3.js` is the single browser owner of authentication, session state, route state, core data state, core mutations, notification presentation, and render scheduling.
2. A user action has one mutation path. Supplemental scripts must not intercept the same event, issue the same write, or trigger an independent full refresh.
3. Rendered DOM is an output, never a domain-state source. Product state comes from the canonical in-memory state populated from Supabase.
4. An older async response must never overwrite state produced by a newer session, route, or mutation generation.
5. Exchange and proposal transitions are atomic at the database boundary or fail without partial lifecycle state.
6. Collection deletion cannot leave active exchange references or orphaned product state.
7. Realtime and polling may request reconciliation, but cannot independently own notification state or presentation.
8. Database authorization is enforced by RLS/RPC policy, not by client UI. `SECURITY DEFINER` functions use a safe search path and restricted execute grants.
9. Beta PWA behavior is controlled by one explicit flag. With `BETA_PWA_ENABLED=false`, there is no install prompt, new service-worker registration, shell caching, or Web Push dependency; in-app notifications continue to work.
10. All three named fixture users are isolated test identities. No production account or production row is used for verification.

## Database truth and lifecycle model

The exact schema and policy behavior will be verified against migrations and the isolated PostgreSQL/Supabase harness before fixes. The intended product-level truth is:

- `profiles`: one current profile per authenticated user; location and onboarding state are read consistently with the authenticated session.
- `user_collection`: one logical owned product per user; exchangeability and owner-photo metadata are properties of that row and converge after reload.
- `user_wishlist`: one logical wanted product per user; duplicate user/product rows are suppressed by database constraints or canonical mutation behavior.
- reciprocal match: derived from both users' collection availability and reciprocal wishlist product identity, with same-city/same-country and no self-match constraints.
- exchange proposal: a single durable lifecycle record whose create/accept/reject/cancel/complete transitions cannot be partially applied.
- notifications: durable notification rows are the source of truth; realtime is delivery acceleration and polling/reload is recovery.
- storage owner photos: object lifecycle follows the committed collection row. Failed uploads or writes must not produce an unbounded orphan/duplicate path.

No claim above is considered proven until its constraint, RLS/RPC implementation, and isolated behavior are linked in the evidence section.

## Runtime inventory

Load order is defined by `v2.html`. The current page loads one Supabase client owner (`app-v3.js`) but many scripts attach competing auth, mutation, refresh, render, and document-observer behavior around it.

| Asset | Current responsibility / hooks | Supabase or shared-state touch | Ownership/race risk | Proposed disposition |
|---|---|---|---|---|
| `analytics.js` | Small analytics bootstrap | analytics only | Low | Keep, verify failure isolation |
| `product-analytics.js` | Capture-phase click tracking; DOM observation | reads labels/routes | Medium: text/DOM coupling | Keep only if observer can be bounded without changing analytics contract |
| `session-persistence-v1.js` | Wraps `createClient`; auth lock fallback; auth/resume/focus/page listeners | auth events; invokes `bcV3Refresh` | **High:** second session/recovery owner and overlapping refreshes | Integrate proven recovery behavior into canonical auth/session runtime, then unload |
| `observability-v26.js` | Error/telemetry helper | shared global only | Low | Keep |
| `locations-v3.js` | Static location behavior/data | no core writes found | Low | Keep |
| `web-push-config.js` | Public Web Push configuration | global config | Low alone | Reuse as the single beta feature-flag boundary |
| `web-push-v1.js` | PushManager subscription and endpoint reconciliation | `push_subscriptions`; auth/sign-out | **High for beta:** SW/Push lifecycle and account-switch coupling | Leave file isolated but do not load while beta PWA flag is false |
| `app-v3.js` | Supabase client; auth; routes; state; rendering; CRUD; matching; proposals; notifications; PWA setup | authoritative `BC_SUPABASE`, `BC_V3`, state `S` | **High centrality:** refresh generations and mutation atomicity need proof | Make the sole runtime owner |
| `catalogue-discovery-v1.js` | Rewrites browse catalogue UI from a document observer | reads canonical globals/DOM | **High:** second catalogue renderer and unbounded observer | Integrate required discovery behavior into canonical browse render, then unload |
| `install-promo.js` | Install-prompt UI and document observer | depends on app PWA globals | **High for beta:** duplicate PWA/install owner | Do not load while beta PWA flag is false |
| `collection-owner-photo.js` | Capture interceptors for add/edit/toggle; upload/sign/delete; match-card DOM injection | collection + Storage reads/writes | **Critical:** second collection mutation owner; network activity from DOM observation | Move required photo transaction/render behavior behind canonical collection actions, then unload |
| `owner-photo-dedupe-v1.js` | Removes duplicate owner-photo nodes after render | DOM only | **High signal:** symptom patch masking competing renderers | Remove after owner-photo render has one owner |
| `collection-remove-safety.js` | Capture interceptor for remove/toggle; reference checks, deletes, cleanup | collection, exchanges, Storage | **Critical:** second multi-step deletion owner | Preserve safety rules in canonical/atomic path, then unload |
| `exchangeable-persistence-v1.js` | Capture interceptor, write/read-back verification, refresh | collection writes | **Critical:** duplicate toggle owner and stale rapid-write risk | Add ordered canonical mutation/reconciliation, then unload |
| `meetup-submit-hotfix.js` | Observer patches missing submit type | DOM only | Medium: symptom patch | Fix canonical markup and unload |
| `exchange-lifecycle-notifications.js` | Separate auth/realtime channel, 30s polling, visibility/online recovery, dialogs/toasts | notifications/exchanges | **Critical:** second notification/session/presentation owner | Fold proven recovery into one notification reconciler, then unload |
| `admin-nav.js` | Auth listener/getUser; observer-injected navigation | auth/profile/admin state | Medium: extra auth/render owner | Render from canonical shell state; unload observer |
| `login-match-notification.js` | Auth listener; `find_matches` after login; prompt | RPC + sessionStorage | **High:** duplicate matching query and notification UI | Fold one-time presentation into canonical notification/match state, then unload |
| `membership-v31.js` | Auth/focus/hash refresh; root observer; capture invite action | membership RPCs | **High:** independent refresh/mutation owner | Integrate membership slice/actions into canonical runtime while preserving contracts |
| `a11y-v1.js` | Capture handlers and repeated DOM patching | DOM only | Medium: render lifecycle collision | Move stable attributes/behavior into canonical markup where feasible |
| `phase-2f-first-match.js` | Observer scrapes DOM and injects first-match coach | infers domain state from DOM | **High:** non-canonical state source | Render coach from canonical state, then unload |
| `legal-links.js` | Observer injects legal footer/disclosure | DOM only | Medium | Put stable legal markup into canonical shell/auth markup, then unload |
| `zen-ux-v1.js` | Observer moves/hides/relabels canonical DOM | DOM only | **High:** post-render UI ownership and churn | Integrate required presentation into canonical render/CSS, then unload |
| `catalogue-cache-sw.js` | Shell/catalogue/image caches; push events; immediate takeover | Cache API, Push API | **Critical for beta:** mixed-generation/cache drift | Unregister and clear BrickCircle-owned caches when beta PWA is disabled |
| `manifest.webmanifest` | Installability metadata | none | Medium for beta install surface | Do not link while beta PWA is disabled; retain isolated asset |

### Current dependency/ownership graph

```text
v2.html
  ├─ session-persistence-v1.js ─ wraps Supabase factory/auth/refresh
  ├─ web-push-v1.js ─────────── auth + PushManager + push_subscriptions
  ├─ app-v3.js ──────────────── BC_SUPABASE + BC_V3 + canonical state/render
  │   ├─ refreshCore ────────── profiles/collection/wishlist/exchanges/notifications/matches
  │   └─ setupPWA ───────────── service worker + install prompt
  ├─ collection-owner-photo.js ─┐
  ├─ collection-remove-safety.js ├─ competing collection event/write owners
  ├─ exchangeable-persistence.js ┘
  ├─ exchange-lifecycle-notifications.js ─ competing auth/realtime/poll/UI owner
  ├─ login-match-notification.js ─────── competing auth/match/prompt owner
  ├─ membership-v31.js ──────────────── competing auth/refresh/action owner
  └─ catalogue/coach/zen/legal/admin/a11y scripts
       └─ document-wide observers mutate canonical rendered output
```

The target graph is one event/mutation/render path:

```text
user/auth/realtime event
  → app-v3 action/reconciler (generation guarded)
  → Supabase query or atomic RPC
  → canonical state commit
  → one render pass
  → passive analytics/observability
```

### Consolidated runtime disposition

The release page now loads `app-v3.js` as the only Supabase/auth/session/core-mutation/notification owner. Session persistence, owner-photo handling, removal safety, exchangeability persistence, meetup semantics, lifecycle notifications, admin navigation, login-match presentation, membership, accessibility, first-match coaching, and legal markup were moved into that owner and their supplemental assets were removed from `v2.html` and `release-assets.json`. `catalogue-discovery-v1.js` and `zen-ux-v1.js` remain as presentation-only extensions: both are driven by the explicit `bc:render` lifecycle and neither owns Supabase state, auth, mutations, timers, or a root/body observer. Analytics and observability remain passive.

Instrumented acceptance target after consolidation: one Supabase client, one auth subscription, one notification channel, and zero document/body-wide MutationObservers.

## Open pull-request inventory

Classification is provisional until migration/content parity is checked against `main`. No PR will be merged or closed from this audit without review.

| PR | Branch | Observed state | Provisional action | Reason |
|---|---|---:|---|---|
| #70 | `codex/push-subscription-reconcile` | open, merge conflict | Hold / supersede for beta | Web Push is outside the beta-critical path while PWA is disabled |
| #68 | `codex/zen-first-time-ux` | open, merge conflict | Supersede | Equivalent Zen UX commit is already present on `main` |
| #43 | `codex/one-exchangeable-set` | open, merge conflict | Supersede | One-exchangeable behavior landed through later mainline work |
| #28 | `fix/collection-item-delete-dependencies` | open, merge conflict | Supersede after invariant comparison | Later collection/exchange cleanup fixes exist on `main` |
| #22 | `codex/fix-growth-events-rls` | open, clean | Inspect before classification | Must confirm whether its policy migration is already represented on `main` |
| #10 | `ux-v3-frictionless` | draft, merge conflict | Supersede | Broad historical UX branch predates the stabilized runtime |

## Initial findings register

These findings come from static ownership inspection. Reproduction fields remain deliberately unclaimed until the deterministic baseline is run without repairs.

| ID | Severity | Component | Reproduction/evidence | Root cause hypothesis | User impact | Required repair/test | Status |
|---|---|---|---|---|---|---|---|
| BR-001 | P1 | Notifications | Instrumented startup registered 5 auth subscriptions and 2 notification realtime subscriptions | Notification state and presentation have multiple owners | duplicate/missed/stale proposal and match notices | deterministic notification recovery + single-owner parity tests | Fixed locally: 1 auth subscription / 1 notification channel |
| BR-002 | P0 | Collection mutations | Three capture interceptors overlap canonical add/edit/remove/toggle events | same action can enter different direct-write workflows | lost updates, partial deletion, inconsistent reload state | action-count spies, lifecycle invariants, one mutation path | Fixed locally: canonical actions own add/edit/remove/toggle; DB invariant CI pending |
| BR-003 | P1 | Owner photos | DOM observer performs async photo reads/render injection; separate dedupe observer removes duplicates | network-backed rendering races canonical render | repeated photo nodes, unnecessary reads, stale photo | canonical state-backed photo render and failure cleanup tests | Fixed locally: canonical upload/render/cleanup with static and isolated regressions |
| BR-004 | P1 | Exchangeability | Delayed first toggle followed immediately by a newer toggle persisted the older value (`true`) | rapid writes were not serialized or generation-checked | displayed/persisted exchangeability diverges | delayed-response rapid-toggle regression | Fixed locally; focused test passes after canonical serialized/coalesced action and supplemental runtime unload |
| BR-005 | P1 | Auth/session | Instrumented startup registered 5 auth subscriptions | overlapping session recovery owners | startup stalls, wrong-account/stale session data | session-generation guards and account-switch/reload tests | Fixed locally: one canonical subscription; persisted client and resume recovery covered |
| BR-006 | P1 | PWA/cache | SW caches shell/runtime/data and claims clients; install and push have separate owners | cached generations can outlive page release boundary | stale mixed runtime, install/push-only failures | explicit beta-off cleanup and no-registration/cache tests | Fixed locally: beta flag off, registration/install/push disabled, owned cache cleanup covered |
| BR-007 | P2 | Meetup form | observer repairs missing submit type | canonical markup defect is masked after render | intermittent form semantics/timing | markup fix + submit regression | Fixed locally: canonical submit markup; hotfix unloaded |
| BR-008 | P1 | Rendering | Instrumented startup registered 9 document/body-wide MutationObservers; a notification-row click also remained continuously unstable for 30s in two attempts | rendered DOM is treated as mutable shared state | controls can be visible but not reliably actionable; loops, flicker, duplicate listeners, CPU/network churn | observer counters, direct actionability regression, canonical render parity | Fixed locally: 0 root/body observers; explicit render lifecycle and route-soak pass |
| BR-009 | P1 | Core refresh | `refreshCore()` fans out broad queries with no proven latest-generation commit gate | older refresh can commit after newer route/session/action | stale state reappears after action/account switch | controlled promise-order race tests | Fixed locally: generation guard discards older responses at each async boundary |
| BR-010 | P1 | Exchange lifecycle | proposal/removal paths include client-managed multi-step behavior | lifecycle changes may be partially committed | orphaned references or invalid active proposal state | DB invariant queries + transaction/RPC decision | Protected locally; PostgreSQL 17 invariant job added and pending CI |
| BR-011 | P1 | Error handling | client handlers pass raw errors through general failure UI in several paths | database/internal text can become user-visible and recovery is inconsistent | confusing or sensitive errors; dead-end flows | error taxonomy and retry/reconcile tests | Open; static |
| BR-012 | P2 | Membership | auth/focus/hash/observer triggers can repeat membership RPCs | independent slice refresh owner | avoidable load and inconsistent invite UI | request-count and parity tests | Fixed locally: membership state/actions use canonical refresh and shell |
| BR-013 | P1 | Web Push | open account-reconciliation patch conflicts with current main | push account switching remains a moving subsystem | wrong/missing system notifications | disable for beta; retain in-app notification proof | Mitigated for beta: Web Push disabled; durable in-app notifications retained |

## Deterministic three-user matrix

All rows below must run in an isolated harness using fixture identities and seeded fixture rows. Names are scenario labels, not permission to access similarly named production accounts.

| Actor | Owned / exchangeable fixture | Wishlist fixture | Expected reciprocal behavior | Proposal role |
|---|---|---|---|---|
| Easwar | Product A available; Product C unavailable | Product B | exactly one reciprocal match with Ramya | creates proposal to Ramya |
| Ramya | Product B available | Product A | exactly one reciprocal match with Easwar | receives, accepts/rejects/cancels per case |
| Dhyan | Product D available | Product A | no match until a deliberate reciprocal leg is added | isolation/control user |

The final fixture must use canonical product identifiers exercised by the existing matching contract, create no duplicate collection/wishlist rows, and reset only its own isolated data.

## Required baseline workflow (observe before fixing)

1. Signed-out load with PWA state both absent and previously registered.
2. Email sign-up/sign-in, OAuth callback simulation, onboarding, reload recovery, account switch, sign-out.
3. Easwar adds/edits/removes collection rows, adds/removes wishlist rows, and rapidly toggles availability.
4. Easwar and Ramya obtain exactly one reciprocal match in both directions; Dhyan remains excluded.
5. Proposal create → recipient notification → reload recovery → accept/reject/cancel/complete paths.
6. Referenced collection removal is blocked or atomically resolves dependent lifecycle state according to the verified contract.
7. Mobile navigation and the full workflow at 390px without duplicate actions or horizontal overflow.
8. Repeated navigation/reload/online/visibility cycles with query, observer, listener, and console-error counters.

## Database invariant queries to establish

The isolated database gate must provide explicit assertions for:

- duplicate `(user_id, canonical_product_identity)` collection and wishlist rows;
- multiple active proposals for the same logical pair/product exchange where the contract forbids them;
- active exchange references to missing or unavailable collection rows;
- self-matches, cross-city/country matches, non-reciprocal matches, or duplicate `find_matches()` rows;
- notification rows pointing at inaccessible/missing exchange state;
- RLS denial for cross-user mutation and anonymous access;
- restricted `EXECUTE` and safe `search_path` for security-definer functions;
- storage object ownership and cleanup behavior for failed/replaced owner-photo writes.

## Repair plan (gated by baseline evidence)

1. Establish the beta PWA-off boundary and prove in-app notification independence.
2. Build deterministic fixtures, workflow driver, request/listener/observer counters, and invariant SQL.
3. Run the unfixed baseline and attach failures to the findings register.
4. Group failures by ownership root cause rather than patching individual symptoms.
5. Add generation guards and a serialized/per-entity mutation contract to the canonical runtime.
6. Integrate only behavior proven necessary from collection, exchangeability, session, notification, membership, catalogue, and presentation supplements.
7. Remove each superseded script from `v2.html` only after its parity test passes; keep isolated source until review.
8. Validate targeted Chromium after each ownership change, then the complete isolated Chromium flow.
9. Use CI for Firefox/WebKit, visual/accessibility, and the broader release gate.

## Release checklist and evidence

- [x] Baseline SHA and runtime/PR inventory recorded
- [x] PWA flag false: manifest/install/Web Push/SW registration disabled
- [x] Previously registered BrickCircle SW/cache cleanup proven
- [x] In-app notifications proven with PWA disabled
- [x] Deterministic Easwar/Ramya/Dhyan fixture and reset implemented
- [x] Unfixed three-user workflow results recorded
- [ ] Database invariants and RLS/RPC security gate passed
- [x] Async race tests passed (session, refresh, toggle, proposal, notification)
- [x] One owner per auth/session/core mutation/render/notification responsibility
- [x] Superseded runtime scripts removed from page load after parity
- [x] Full isolated Chromium passed
- [x] Mobile 390px workflow and overflow checks passed
- [x] Soak/repetition gate passed with stable listener/query/observer counts
- [ ] Firefox passed in CI
- [ ] WebKit passed in CI
- [ ] Visual/accessibility gate passed in CI
- [x] Release asset identifiers/manifests/cache references synchronized
- [x] No production Supabase access or mutation
- [ ] Draft/final review PR opened; not merged; no deployment

### Evidence log

| Date | Gate | Command / environment | Result | Artifacts / notes |
|---|---|---|---|---|
| 2026-09-09 | Branch baseline | `git rev-parse origin/main` | Pass | `ec4409d53cb2f6f73b66444e5879dc168df66d1e` |
| 2026-09-09 | Static runtime inventory | `v2.html`, loaded JS, service worker, release manifest inspection | Pass (inventory only) | Competing owners recorded above; no behavior changed |
| 2026-09-09 | Open PR inventory | GitHub CLI read-only PR inspection | Pass (inventory only) | Six open PRs classified provisionally above |
| 2026-09-09 | Focused PWA/in-app notification baseline | Isolated Chromium, install + push test files | Partial: 5 passed, 1 failed twice | PWA cleanup passed. Visible notification row never became stable enough for a trusted click; BR-008. Test run manually stopped after reporter failed to exit. |
| 2026-09-09 | Focused PWA/in-app notification rerun | Isolated Chromium against separately controlled loopback server | Pass: 6/6 | System-notification UI absent; selective SW/cache cleanup and durable in-app match notification passed in 7.6s. |
| 2026-09-09 | Existing isolated Chromium baseline | Full pre-consolidation suite | Pass: 58/58 | 1.3m. Existing counterparty behavior is largely a single-user mock and is not multi-user proof. |
| 2026-09-09 | Deterministic three-user workflow | Easwar → Ramya reciprocal both directions; Dhyan isolation; proposal delivery/acceptance | Pass: 1/1 | Shared loopback-only state: exactly 3 collection rows, 2 wishlist rows, 1 accepted request, 1 exchange. Initial fixture defects (actor reset; stale local state; expected proposal overlay) were corrected without product changes. |
| 2026-09-09 | Ownership/race baseline | Instrumented isolated Chromium | Fail as intended | 5 auth subscriptions (target 1), 2 notification channels (target 1), 9 root/body observers (target 0), and stale delayed availability write reproduced. |
| 2026-09-09 | Availability repair | Focused delayed-write Chromium regression | Pass: 1/1 | Canonical per-set operations coalesce or serialize writes; the latest user intent persists. `exchangeable-persistence-v1.js` is no longer loaded. |
| 2026-09-10 | Runtime ownership and refresh races | Focused isolated Chromium | Pass: 4/4 | One client/auth/channel owner, zero broad observers, latest refresh wins, and 60 route transitions retain stable ownership. |
| 2026-09-10 | Auth/session and first-match parity | Focused isolated Chromium | Pass: 18/18 | Join/referral, Google/email/reset, onboarding, recovery, coach, mobile and canonical session behavior pass. |
| 2026-09-10 | Owner-photo consolidation | Static QA plus isolated Phase 2A/ownership | Pass | Required upload, validation, cleanup, signed-photo rendering and safe removal live in `app-v3.js`; duplicate runtimes unloaded. |
| 2026-09-10 | Full isolated browser release gate | Chromium | Pass: 64/64 | Includes deterministic three-user truth, auth/session, collection/wishlist/matching/proposals, notification recovery, PWA-off, 390px mobile and route soak. |
| 2026-09-10 | Database invariant gate | PostgreSQL 17 CI job added | Pending CI | Applies the three existing removal/cancel migrations to a minimal isolated schema; asserts cancellation snapshots, FK detachment, pending-block, RLS, grants and safe search path. |
| 2026-09-10 | Visual/accessibility preflight | Local Chromium, non-isolated harness | 1 passed / 2 not runnable locally | Static mobile homepage passed. `v2.html` cases could not boot because the harness requires the external Supabase CDN, which is blocked in the local sandbox; CI is the authoritative cross-browser gate. |

## Decision record

- 2026-09-09: Work occurs in a dedicated worktree because the pre-existing checkout contains unrelated user changes. Nothing in that checkout was modified.
- 2026-09-09: Beta PWA functionality will be disabled, not deleted. Web Push and install assets remain available for later post-beta repair, while in-app notification delivery remains release-critical.
- 2026-09-09: Static findings do not authorize fixes by themselves. Except for the explicitly required PWA-off boundary, runtime consolidation starts only after deterministic baseline evidence exists.

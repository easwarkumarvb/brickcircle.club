# PR125 protected hosted staging

Status: **prepared and locally tested, not hosted execution evidence**. Product PR125
remains at `1eb64e59f000f3a93f55906ff55e9a194a70eee0`. This bootstrap changes only
test/workflow infrastructure and documentation; it does not change application,
database, Auth, grants, publication, delivery-worker or environment configuration.
Do not merge PR125 on the strength of offline/mock results.

## Trust boundary

The existing canonical workflow and its exact canonical-branch selector are
unchanged. `.github/workflows/hosted-supabase-pr125.yml` is a separate manual-only
dispatcher requiring `refs/heads/main`, repository `easwarkumarvb/brickcircle.club`,
open same-repository PR125, main base, the actual conversation-first branch, and
the single allowlisted immutable SHA above. Selection is rechecked after the
environment review to reject closed, moved or retargeted PRs.

Trusted harness, pinned dependencies (`@supabase/supabase-js` **2.57.4** and
Playwright **1.62.1**), provisioning and server smoke all come from the dispatch
commit on main. No candidate Node script, package script, dependency install,
migration or workflow is executed. Candidate browser assets are checked out at
the validated SHA under `candidate`, without persistent Git credentials. Node
22 is used. The runner shares the canonical staging concurrency mutex.

The browser serves those assets through a loopback route with two in-memory
configuration substitutions in `app-v3.js`: Supabase URL and public key. No
messaging behavior is replaced. The pinned SDK's UMD bundle comes from trusted
`node_modules`, not a live CDN. Analytics are disabled, third-party assets are
blocked, service workers are blocked, and HTTP/WebSocket traffic is allowlisted
to staging Auth/PostgREST/storage and the exact staging Realtime socket. Any
production request or unexpected socket fails the final browser evidence.

The server secret is step-scoped to trusted account provisioning, existing
server smoke and read-only outbox audit; it is absent from the browser process.
Three fresh confirmed adult `example.test` accounts are created using the
existing bootstrap (no real email sends). Completed fixtures and audit rows are
retained; no users or existing evidence are deleted. The supplied read-only
connector audit reports exactly **three** staging catalogue sets. The browser
requires the two existing configured sets plus one third set (selected outside
configured A/B); no catalogue, account-count or configuration change is needed.
Missing configured sets or a missing third set fail closed before item inserts.

| Suite / case | Collector A owns | Collector B owns |
| --- | --- | --- |
| Browser first case | configured SET_B | configured SET_A |
| Browser second case | third set | same third set |
| Existing server smoke | configured SET_A | configured SET_B |

Each browser owner inserts two unique catalogue sets. Collection uniqueness is
`(owner,set_number)`, not global set-number uniqueness; all four browser item IDs
are distinct, and the server smoke's two owner/set slots remain unused. The
second browser case uses distinct physical items of the same catalogue set,
which the existing proposal RPC permits. Both cases have the same peers; the
first match is selected by its two different rendered set numbers, with exact
offered/requested IDs asserted. Cross-combinations may also match, so selecting
the first match is not safe. Wishlist entries cover both reciprocal pairs;
case destinations, notifications, locks and lifecycle assertions use case/item
IDs, not globally distinct catalogue numbers. The server smoke uses exact item
IDs for matching and scoped case evidence, so existing browser rows do not
replace its own fixtures or require an empty account after the browser run.

## Coverage required before PR125 approval

The real Chromium run uses three independent mobile-width contexts, actual
email/password sign-in forms, browser SDK and hosted gateway. It asserts:

- inline proposal from the exact physical-item match; opening alone creates no
  case/reservation; submitting uses the server RPC;
- one collector inbox row for two same-peer cases and direct chat;
- chronological direct/case messages, exact destination persisted in actual
  database rows, separate general/case drafts, and mobile overflow guard;
- direct and case committed-response-lost retries: let the hosted RPC commit,
  abort only its response, refresh and retry the original intent, assert one row;
- actual proposal and case-message notification clicks selecting the exact
  case/message, and displayed-source read watermarks that leave a third
  collector's unread message alone;
- outsider browser unavailable state, absence of composer/actions, denied
  case/event/message reads and denied case-message RPC;
- accept/meetup/safety/arrival/inspection/handoff/build/return/completion through
  inline next-step actions, draft retention, final server state and readable
  closed chat archive. Physical custody confirmations are synthetic staging
  fixture actions, not claims that real LEGO was transferred.

The unmodified existing server smoke additionally requires recipient Realtime
delivery, outsider suppression, RLS, complete lifecycle/counterproposal, stale
versions, locks, idempotency, reviews, cancellation/early-return and durable
notification/outbox evidence. It runs even if the browser fails, provided fresh
accounts were successfully provisioned. Neither suite can replace the other.
The final read-only audit requires every delivery row for these three fixture
users to remain **pending with attempt_count=0**; a queued row alone is not proof
of outbox-only execution. It does not invoke or reconfigure delivery workers.

Only three explicit JSON reports are uploaded for 30 days. No console capture,
credentials, emails, raw IDs, browser storage, traces, screenshots or request
bodies are uploaded. Browser failures retain only a fixed stage and completed
checks, withholding raw Playwright/SDK errors. Reports identify tested PR/SHA;
retain the GitHub run URL and main dispatch commit as runner provenance too.

## Existing human/security gate (read-only observation, 2026-10-09)

`hosted-supabase-staging` permits **main** and the existing canonical branch. Its
required reviewer is **easwarkumarvb**. No access/permissions/reviewer changes are
needed or proposed. Do not dispatch this runner from the bootstrap or PR125
branch, spoof the canonical branch, approve as the agent, or use admin bypass.

This session has no local `BC_STAGING_*` or `SUPABASE_*` credential variables.
Its GitHub integration can read protection/branch policies but returns **403
Resource not accessible by integration** for environment secret names and
variables. Secret values were not requested or printed. Existence/contents of
the protected credentials therefore remain unverified here.

Actual execution is blocked until a human independently reviews this concrete
bootstrap and puts it on main. **The agent must not merge it.** Then a human
reviews the pending environment job, verifies the exact staging ref and
existing credentials/variables, and confirms delivery workers/provider
credentials cannot cause sends before approving. The `outbox-only` variable is
an acknowledgement, not a switch that disables workers. If delivery cannot
already be kept outbox-only within authorized protection, stop at that gate;
do not silently change production, reviewers, worker config, Auth or grants.

Proposed dispatch (not yet executed):

```sh
gh workflow run hosted-supabase-pr125.yml --ref main \
  -f pull_request_number=125 \
  -f expected_head_sha=1eb64e59f000f3a93f55906ff55e9a194a70eee0 \
  -f confirmation=RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE
```

Dispatch ref: **main**. Tested ref: **opencode/conversation-first-exchanges**.
Tested SHA: **1eb64e59f000f3a93f55906ff55e9a194a70eee0**.
Only target: **tteyypklldgwwicrgjzt** (Mumbai staging).
Forbidden target: **nsxtromjdpdscknadxez** (production).

The exact future runner SHA is the main commit containing this reviewed
bootstrap, not PR125's SHA; record `head_sha` from the dispatch run before
approval. Never pretend a bootstrap-branch SHA is trusted main.

## Offline validation

```sh
npm ci --ignore-scripts
npm run test:hosted:guard
BC_HOSTED_CANDIDATE_PATH=/workspaces/brickcircle-messaging \
  node scripts/hosted-pr125-browser.mjs --offline
node --check scripts/hosted-pr125-browser.mjs
npm run typecheck
npm run release:check
git diff --check
```

Passed after the three-set prerequisite correction: **75/75** selection/target/transport/configuration/outbox/existing guard
tests; real offline Chromium transport probe and three-actor PR125 mock
selector/destination/draft/isolation check; syntax, typecheck, release check and
diff check. Workflow lint passed with checksum-verified **actionlint 1.7.7**.
The earlier bootstrap validation also ran PR125's guided messaging suite with
**48/48 Chromium** tests passing and retries disabled; that product suite was
not rerun for this fixture-only correction. These results establish harness readiness,
not hosted staging success.

## Browser harness authentication repair (2026-10-09)

Hosted run [37912613882](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/37912613882)
used trusted main `063450af5bca0ed8d1c335dc52245918c895c5e6` and candidate
`1eb64e59f000f3a93f55906ff55e9a194a70eee0`. Its browser authentication stage
failed; validation, provisioning, server canonical/RLS/Realtime/outbox smoke and
final zero-provider-attempt audit passed. The three disposable users were retained.

Concrete offline reproduction with that exact candidate, the pinned real SDK and
trusted mock HTTP transport reaches the real password Auth request exactly once,
verifies the browser user, and renders the visible profile control. Notifications
exists but is hidden by candidate `app-v3.css` at the harness's 390px viewport.
The original post-login visibility assertion therefore cannot pass at this width;
the session-injected three-actor mock did not exercise this assertion. This is a
harness selector/viewport defect, not evidence of bad credentials or a product
authentication defect. The earlier hosted report retained only the broad fixed
stage, so it does not establish which individual login step completed there.

The repair verifies exact browser email and the independently authenticated user
ID, plus the visible profile control and closed login form. Login failures retain
only fixed collector A/B/C and fixed substage labels. Notification clicks temporarily
use 1280px, then restore mobile width even on failure. Mobile chat overflow checks
remain unchanged. Offline fixtures and SDK come from the trusted harness; only
browser assets come from the immutable candidate. No workflow, project/SHA guards,
reviewer policy, fresh-trio provisioning, outbox policy or secret boundaries changed.

Local evidence: **77/77** hosted guard tests; changed-module and repository syntax,
typecheck, release and diff checks; and the real-form/pinned-SDK offline
reproduction, desktop notification interaction, mobile restoration, existing
three-actor messaging mock and transport probes passed. The command used
`BC_HOSTED_CANDIDATE_PATH=/tmp/opencode/pr125-auth-candidate`, an archive of the
exact candidate SHA above. These are **offline results only**. A reviewed repair
on trusted main and a separately approved protected hosted rerun are still required;
do not merge PR125 based on these results.

## Supabase semantics and current documentation

Read the current [Postgres Changes documentation](https://supabase.com/docs/guides/realtime/postgres-changes)
and [changelog](https://supabase.com/changelog) on 2026-10-09. Publication
membership and RLS matter: staging publishes **notifications only**, so neither
case/message Postgres events nor broader grants may be assumed. Browser
collector updates intentionally exercise explicit refresh; the server smoke
separately requires the actual filtered notification Realtime event. Durable
rows cannot substitute for that delivery.

The guided direct-message writer is SECURITY INVOKER; the canonical writer is
SECURITY DEFINER with empty search_path, explicit authenticated participant
checks, terminal-state closure, sender-bound idempotency and an advisory lock.
Server-owned state transitions, outbox/lock tables and deny-by-default RLS are
intentional boundaries, not reasons to add permissive policies to silence an
advisor. Existing smoke asserts the meaningful outsider and mutation semantics.
Generic definer warnings are not proof of a bug. `pg_trgm` in public and leaked
password protection are separate hardening/operational topics; no extension or
Auth changes are part of this runner. The supplied connector health/migration
audit is context, not a new execution claim.

Relevant current changelog notices include the April 2026 Data API exposure
change (enforcement announced for October 30) and July 2026 Realtime schema
lockdown. Do not alter managed Realtime schemas or grants as a workaround. Keep
the SDK pinned rather than opportunistically upgrading it. No Supabase CLI is
installed locally and no CLI operation is required here; before any future CLI
command consult the installed version's `--help` and specific subcommand help.

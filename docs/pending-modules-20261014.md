# BrickCircle module completion ledger — 14 October 2026

Repository baseline: `f3e8de109d8741cf405ce8f67209055f36b345ae`.
This ledger distinguishes implemented modules, unmerged fixes, and verification
that cannot be replaced by mocks. It is not production rollout approval.

| Requirement | Current implementation and evidence | Remaining work |
| --- | --- | --- |
| Registration, adult attestation, verification, resend, recovery | Canonical `app-v3.js`; registration/confirmation/privacy/account-switch isolated suites; `docs/registration-verification-audit.md` | Actual email delivery and physical-device review are separate verification |
| Owned/wanted collections, reciprocal matching, availability | Owner-scoped collection actions and canonical availability RPC; isolated collection/matching and SQL gates | Photo persistence fix below |
| Person-first conversations | PR138 merged; collector inbox/feed, ordinary chat, explicit case context, immutable uncertain-send retries; `tests/isolated/person-conversation-read-model.spec.ts` and guided messaging suites | Physical keyboard/resume checks |
| Complete exchange lifecycle | Canonical proposal, acceptance, meetup, inspection, custody, return, early return, cancellation, release, and reviews | Preserve server-owned transitions and participant checks in every follow-up |
| Hosted conversation/exchange journey | Protected run [38338276854](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38338276854): 5 browser groups and 19 server checks, 390px synthetic collectors; no production requests or provider attempts | This historical run certifies its pinned candidate, not later changes |
| Camera, file picker, retake and owner replacement | PR132 merged; explicit camera permission, resource disposal, account-generation guards; camera and replacement isolated suites | Repair implemented on this branch, including avatars and concurrent replacement/account-switch guards; isolated CI still required |
| Private photo permissions and signed URL caching | PR143/145 merged; owner namespace binding, participant access, expiring cache and account isolation | PR148 expiry-format compatibility is draft, not hosted certification |
| Real hosted photo journey | Run [38495468640](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38495468640) passed seven HTTP groups: owner bytes, reciprocal/participant reads, outsider and foreign-write denial, cancelled archives | Expired GET returned HTTP400; expiry assertion failed. Fresh signing after expiry and final dummy-object deletion were not reached. Do not claim complete success |
| PR148 compatibility fix | Draft [PR148](https://github.com/easwarkumarvb/brickcircle.club/pull/148), head `04c2952913dedbcd95cf40db3f106f1008f5a6ee`; narrow explicit expiry discriminator, bounded safe diagnostics; CI green | Separate merge approval, protected staging rerun, confirm fresh signing and exact fixture cleanup |
| Admin console and metrics | PR124 merged; server allowlist and real AAL2 required at Edge/RPC, bounded reads and audited revision/idempotency mutations; admin API/security and SQL gates | Positive hosted MFA test needs owned disposable identities and protected fixture provisioning. Existing harness is pinned to historic PR124 and must be reviewed for current routing before use |
| Durable in-app notifications | Server-owned notification records, realtime account isolation, lifecycle regression suites | No provider activation required for in-app operation |
| Durable transactional email | Server-owned asynchronous outbox, Auth-derived recipients, bounded retries and idempotency; notification-email SQL and isolated tests | Brevo sender/domain setup, protected secrets, worker/webhook/scheduler activation and delivery verification require separate approval; no emails sent by this work |
| Landing model pairings and positioning | PR133 merged: Ferrari/McLaren, Space Shuttle/Saturn V, Tower Bridge/Colosseum; Buy Less. Build More. | Preserve these approved pairs |
| Founder story and supplied brand artwork | Selectively ported approved wording and supplied assets from PR134 onto this branch | Responsive/accessibility CI and human visual review; stale PR134 is not merged wholesale |
| Three-photo gallery | Implemented front/side/rear-detail UX with owner-bound supplementary metadata, inherited reciprocal/canonical participant reads and safe uncertain-write cleanup | Disposable real-role/browser CI; staging compatibility and schema rollout remain separately reviewed |
| Permanent mobile-first UX QA | PR144 merged; isolated browser/geometry/accessibility/checkpoint suite with synthetic data and blocked external transport | Real iOS/Android keyboard, safe areas, rotation, background/resume, touch and camera evidence; human visual approval |
| Beta PWA/web push disabled | Current canonical beta gates and install/push regression suites | Keep disabled; historical push PR70 is not authorization to enable it |
| Capacity evidence | Draft PR141 contains isolated projection/capacity measurements against its frozen candidate | Measurements are not a production SLO or launch-capacity certification |

## Current baseline checks

On the exact baseline above, this pass reran security contracts (55 admin API
tests plus both authorization scripts), conversation runtime contracts (27),
hosted harness guards (82), TypeScript, repository syntax and release sync.
All passed. Local browser installation failed because the download was not a
valid archive; browser validation is performed in the existing Codespace/CI
environment, not reported as a local success.

PR148 CI run [38496581917](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38496581917)
passed security/contracts, release checks, 421 Chromium isolated tests, 841
Firefox/WebKit isolated tests and 9 visual/accessibility tests. Other PR148 UX,
hosted guard and beta SQL checks are green. These isolated checks make no hosted
expiry or real-device claims.

## Historical PR reconciliation

- PR135 is the approved architectural design implemented by merged PR138.
  PR136/137 are superseded implementation attempts, not extra modules to merge.
- PR134 contains old versions of app, chat, tests, release metadata and photo
  policies. Importing it wholesale would remove later safety work. Founder/logo
  scope and confirmed photo persistence defects are handled separately.
- Historical PR89 branding conflicts with the later Buy Less. Build More.
  artwork. Historical PR70 push activation conflicts with the beta gate.
- PR28/87 and older lifecycle proposals cannot replace the current canonical
  state machine or weaken active custody/history retention.
- Three-angle galleries were initially assistant-proposed, but the user's later
  explicit 11 October request and OpenCode approval make them part of the current
  scope. Supplementary metadata must not authorize foreign-owner objects or
  replace existing one-photo readiness and canonical participant controls.

## Boundaries

OpenCode handles scoped coding on isolated branches; Codex reviews architecture,
authorization, uncertain-write semantics and evidence. Branch deployment must be
disabled before publication. No automatic merge, deployment, production schema
or data change, provider delivery, or real-account fixture manipulation is
authorized by this completion request. Keep staging evidence, production rollout,
provider activation and physical-device results explicitly separate.

## Combined development candidate

Branch `dev/pending-modules-completion`, release `20261014-pending-modules-r1`,
contains the photo commit/identity repair, approved three-angle gallery, founder
letter/portrait, supplied brand rollout and scoped dark-panel contrast correction.
The combined 39 actual-function safety tests and 6 signed URL/cache tests pass
locally, along with security, conversation, hosted harness, syntax, TypeScript,
release and diff checks. Browser and PostgreSQL results are recorded in the PR
checks rather than inferred from prepared tests. The original Supabase CLI
telemetry rejection was respected: gallery SQL source was prepared offline and
no database migration was applied by this work.

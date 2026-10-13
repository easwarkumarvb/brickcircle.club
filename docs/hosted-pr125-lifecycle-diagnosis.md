# PR125 lifecycle repair and offline evidence

Trusted baseline: `3c547f9c0ebd597c97af8408cd80c424e6594295`.
Original failing candidate: `1eb64e59f000f3a93f55906ff55e9a194a70eee0`.
New product head: `e12eac9244360c5b6e616484b73c3492b8ee3922` (PR125).
Hosted run 37939050340 reached the broad lifecycle stage after earlier browser
checks passed; server 19 checks and final zero-provider audit passed. The supplied
read-only aggregate shows one COMPLETED and one PROPOSED case. This does not prove
the exact hosted assertion that failed.

## Concrete offline reproduction

Archive the exact candidate assets, install trusted pinned dependencies with
`npm ci --ignore-scripts`, then run:

```sh
node scripts/offline-pr125-lifecycle.mjs /tmp/opencode/pr125-old-lifecycle-assets --expect-old-composer-failure
```

The trusted HTTP transport intercepts all staging requests and closes sockets.
Both collectors use the actual form and pinned SDK, not injected sessions. The
same harness action sequence executes all 19 lifecycle transitions with canonical
action-named events, state versions, actor identities and timestamps. The replay
reproduces the old failure at **closed composer**, before completion-label
evidence. The explicit negative-regression flag accepts only this precise
failure after all 19 transitions; it is never used by the hosted or positive
offline workflow:

- case1 COMPLETED, one canonical `return_confirm` event resulting in COMPLETED;
- correct case selected, guide says Closed, composer still visible;
- two `Return confirm` timeline rows, zero `Completed` timeline rows;
- earlier diagnosis showed that reselecting the same case hides the composer;
  neither positive nor negative replay now uses that workaround;
- case2 remains PROPOSED (unchanged by the lifecycle).

The exact candidate collector `refreshThread` branch (app-v3.js:2089–2104)
refreshes selected case metadata, guide and timeline but does not apply terminal
composer state or update `ctx.caseRow`. `selectCollectorCase` (2176–2189) does
update both, explaining the earlier successful reselect. The authorized product
fix reuses `selectCollectorCase` during collector refresh and avoids assigning
unchanged draft values so focus/caret remain intact. It includes completed and
cancelled refresh, canonical closing action, General reopening, second-case
drafts and late case/account response regressions with synchronized release assets.

There is a separate harness event-label mismatch: canonical SQL inserts
`clean_action` as `event_type` (canonical migration:893–895), so completion is
`return_confirm`; `exchange_completed` is the notification kind. Candidate
timeline markup (app-v3.js:1812) renders `Return confirm`, not `Completed`. Fixing
that assertion alone would not fix the composer defect. The shared lifecycle
helper now verifies all 20 canonical events (creation plus 19 actions), distinct
event identities, intended actors, sequential state versions, exactly one
resulting COMPLETED event (second `return_confirm`, actor B, final state version),
and the exact rendered ordered labels/count. It retains the strict hidden
composer, Closed guide and archived message body assertions without reselect.

The positive offline workflow uses the same shared helper after two real-form
logins through the pinned SDK and trusted HTTP transport, not injected sessions.
It keeps case2 PROPOSED, blocks all hosted traffic, and requires all 19 actions.
The one exact new candidate head must be reviewed together with this separate
harness PR before the protected repeat. Main/open-PR/same-repository/head/project
checks, reviewer policy, fresh trio, outbox-only and secret-step boundaries remain
unchanged. No hosted mutation, environment/security change, data deletion, PR
merge or dispatch occurred. Offline success is **not hosted browser success**.

Positive exact-head command:

```sh
BC_HOSTED_CANDIDATE_PATH=/tmp/opencode/pr125-e12eac9-assets node scripts/hosted-pr125-browser.mjs --offline
```

The archive is created with `git archive e12eac9244360c5b6e616484b73c3492b8ee3922`;
only browser assets are served from it. Candidate scripts and dependencies are
not executed. `PR125_SHA` contains this one new SHA; the old SHA is explicitly
rejected even when both dispatch input and PR metadata agree on the old head.
Historical run evidence in the staging guide deliberately retains the original
SHA. Approval of both immutable PR heads is still required before a protected run.

Local harness checks: **82/82** guards, **55/55** security contracts, **9/9**
static regressions, changed-module/repository syntax, typecheck, release and diff
checks passed. The exact-new-head positive offline workflow and explicit-old-head
negative regression both completed with their required outcomes. No CI or hosted
success is inferred from these local checks.

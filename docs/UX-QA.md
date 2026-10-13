# Permanent isolated UX QA

`npm run test:ux` runs the dedicated loopback server and 189 reproducible tests:
24 public checkpoints on Chromium desktop/Android, WebKit iPhone and Firefox,
plus 165 existing isolated Chromium journeys. Tests have no retries. The existing
full CI browser matrix continues to test these journeys on Firefox and WebKit.

The reused suites cover consent/signup/OTP errors and account changes, successful
and failing OAuth/PKCE callbacks, mock camera capture/cleanup and photo upload
rollback, administrator denial/MFA/session revocation, canonical exchange
proposal/meetup/inspection/handoff/return/cancellation/reviews and person-first
message idempotency/draft separation/outsider isolation. Fixtures contain fake
accounts and responses; these tests cannot certify hosted services or physical
custody. No real email, OAuth login, camera hardware, storage or admin mutation
is used.

Every test context, including manually created collector contexts, blocks all
HTTP except the exact loopback test origin. SDK and admin API fixtures fulfill
requests locally. WebSockets and service workers are blocked. The UX config
rejects external-server overrides; never relax this for production testing.

## Evidence and triage

The CI job retains `ux-report/results.json`, HTML, failure screenshots/traces,
redacted `triage.md`/`triage.json`, and `gallery.html` with synthetic screenshots.
The gallery only copies explicitly named synthetic PNG attachments inside the
isolated artifact directory. Run `node scripts/ux-gallery.mjs` after browsers;
run `BC_UX_REQUIRE_BROWSER_REPORT=1 node scripts/ux-triage.mjs` to summarize.
`npm run test:ux:guards` validates transport restrictions and report selection.

The screenshots support human review; no stale PR134 brand images or pixel
baselines are imported, and no snapshots are automatically accepted. A future
approved baseline must be captured against the reviewed current product. The
historical unguarded Lighthouse CLI job is omitted: external asset requests do
not meet this suite's isolation requirement. Performance budgets remain pending.

Prioritize blocked journeys as P1, accessibility/responsive regressions as P2
and polish as P3. Include route, browser, steps, expected/actual result, relevant
artifact and regression assertion in each human-reviewed fix. Failure and
missing-evidence triage does not substitute for the browser check result.

Real iOS/Android keyboard, safe-area and touch QA remains manual. Hosted RLS,
Realtime, outbox and canonical server certification remains in the separately
approved protected staging workflow; its pins and transport guards are unchanged.
Production capacity/lock budgets, approved visual baselines, and administrator
configuration of required branch checks remain separate requirements. No agent
or workflow auto-merges, deploys, or changes production.

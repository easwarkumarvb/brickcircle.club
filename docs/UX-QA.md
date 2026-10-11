# BrickCircle permanent UX quality assurance

## Existing infrastructure (audit, 2026-10-10)
The repository already has Playwright 1.62.1, axe-core/playwright 4.13, multi-browser projects, isolated server, hosted staging guard tests and cross-browser accessibility tests. Reuse those. This addition targets read-only public UX coverage and CI evidence rather than duplicating authenticated exchange-state tests.

## Commands
```bash
npm ci
npx playwright install chromium firefox webkit
npx playwright test --config playwright.ux.config.ts
npm run test:isolated
npm run test:hosted:guard
```

## Safety
- The UX suite starts its own loopback-only isolated server and refuses BC_BASE_URL/BC_EXTERNAL_TEST_SERVER overrides.
- No signup, OAuth token use, email delivery, database writes, messages, cancellation or handoffs in these tests.
- For authenticated journeys use the existing hosted staging harness with disposable users and exact staging transport allowlist; never point the browser at production. Only enable mutating journeys after fixture validation and cleanup have been independently reviewed.
- Never commit storageState, passwords, access tokens, screenshot secrets or production credentials. Restrict CI artifact access appropriately.

## Evidence and triage
Each run creates ux-report/results.json, HTML report and failure screenshots/traces. Lighthouse emits ux-lighthouse/home.json. Review errors in priority order:
P0 security, data leakage or incorrect exchange custody; P1 blocked registration/exchange journeys; P2 broken responsive UI, accessibility or performance; P3 polish.
Issues must include URL/route, device and browser, reproducible steps, screenshot/trace, expected/actual, proposed change, and a regression test.

## Next coverage increments (not yet implemented)
1. Wire isolated auth fake responses to deterministic registration/verification and OAuth callback fixtures. Never contact real Gmail or Google accounts.
2. Integrate hosted staging fixture flow for two reciprocal collectors and one admin to exercise collection, camera/file chooser, messages, proposal, counter, cancellation and return.
3. Add screenshot baseline reviews with explicit masks for dynamic text/images; do not auto-accept baseline changes.
4. Add Lighthouse assertions/budgets once a stable baseline exists; CI currently captures performance evidence, not a pass/fail performance budget.
5. Add an AI review step consuming redacted artifacts, creating *draft* recommendations. OpenCode fixes routine issues; Codex handles complicated state-machine decisions. Keep PR review mandatory.

## Branch protection
An administrator must make UX quality gates a required check in GitHub Settings > Branches or Rulesets. The workflow cannot enforce required status checks by itself. Never auto-merge or deploy substantive fixes.

## Automated issue triage
GitHub Actions now runs `node scripts/ux-triage.mjs` after browser checks and after the Lighthouse audit. Its outputs `ux-report/triage.md` and `ux-report/triage.json` prioritize failed browser journeys as P1 and Lighthouse advisory findings as P2. They are archived as CI artifacts. The Lighthouse thresholds are **advisory**, not enforced performance budgets, and the CI jobs currently produce separate partial summaries. Review both artifacts together. A passing run does not certify authenticated user journeys.

## Three-collector mobile UX coverage (PR #134)

The PR UX workflow now invokes `node scripts/hosted-pr125-browser.mjs --offline`
with `BC_HOSTED_CANDIDATE_PATH=.` and `BC_UX_SYNTHETIC_ONLY=1`. This
reuses the existing disposable three-actor HTTP and Supabase SDK fixtures
without contacting an actual hosted Supabase project. It verifies a complete
synthetic proposal/meetup/handoff/return lifecycle, collector messaging,
draft separation, outsider isolation, mobile width and completion behaviour.
Additional read-only UX checkpoints use `scripts/ux-mobile-journey.mjs`.
Browser screenshots are captured **only** with the synthetic-only flag,
and are archived privately as CI artifacts under
`ux-report/synthetic/`. The metrics JSON never contains identities,
message contents, session tokens, URLs or request bodies.

The existing hosted PR125 staging run is intentionally locked to its exact
reviewed PR number and commit. Instrumentation has been added to its
existing script, **but PR #134 is not authorized to run that hosted workflow**.
Do not relax the exact SHA, branch or target-project checks just to run a
new PR. Before any new staged run, prepare a separately reviewed, trusted
dispatch mechanism with its own disposable accounts, host allowlist,
outbox-only delivery, isolated project, and required environment approval.

### Scope matrix

| Journey | PR #134 status |
| --- | --- |
| Public landing, join modal, catalogue, a11y, mobile | Browser CI |
| Three synthetic actors, proposal, messaging, exchange completion | Offline mocked browser harness |
| Checkpoint metrics for preproposal, messaging, unauthorized, completed | Synthetic and guarded hosted harness code |
| Real hosted staging execution of PR #134 | Not authorized / not executed |
| Email verification and Google OAuth redirects | Pending dedicated safe fixtures |
| Camera/photo upload and admin authorization | Pending dedicated safe fixtures |
| Cancel/unlock physical set in UI | Pending synthetic coverage |
| Cross-run pixel-approved screenshot baselines | Pending baseline review |
| AI reviewer and autonomous OpenCode/Codex changes | Pending controlled agent setup |

Do not interpret a successful synthetic run as certification of physical
custody or hosted infrastructure. Keep agent-generated fixes in human-reviewed
draft pull requests. Only enable required status checks after confirming
the full branch policy and CI stability.

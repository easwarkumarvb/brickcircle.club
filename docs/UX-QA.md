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

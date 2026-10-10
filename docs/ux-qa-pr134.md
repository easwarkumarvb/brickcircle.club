# PR134 permanent UX QA

## Coverage and safety

- `npm run test:ux`: local-only synthetic registration/verification, catalogue,
  keyboard dismissal, WCAG serious/critical assertions, 320px/landscape geometry,
  and committed hero image comparisons on Chromium desktop/Android, WebKit iPhone,
  and Firefox desktop. All external HTTP is blocked by the existing isolated
  fixture. Signup submission is mocked; no verification email is delivered.
- `scripts/hosted-pr125-browser.mjs`: reuse the protected fresh A/B/C bootstrap,
  exact staging target, immutable candidate selection and public-key browser
  transport. Validate provisioned adult/local profiles and ordinary collector
  admin role denial before inserting fixtures. Both owners inspect exact collection
  copies, then exercise matching/proposal, messaging/retries, outsider isolation,
  handoff/return/completion, and accepted-case cancellation. Cancellation checks
  exact item release and closed archives for both collectors. The offline replay
  executes the same collection/cancellation helpers with the pinned SDK.
- Mobile composers require an accessible name, 44px send target, 16px editor
  font, visible next-step guide, and no horizontal clipping. Hosted diagnostics
  remain fixed stage labels and safe geometry/booleans, never screenshots/traces.
- Positive administrator/MFA tests remain in the separate existing protected
  `hosted-supabase-admin-smoke.yml` fixture; do not promote any of the three
  collectors or bypass MFA. Collector role denial is not proof of every admin API
  authorization path; the existing admin API/security contract tests supplement it.

No hosted workflow dispatch, merge, deployment, production access, data deletion,
or reviewer/secret/transport allowlist change is part of this implementation.
The hosted dispatcher remains pinned to PR125: PR134 changes its trusted test
infrastructure, not the tested product selector. After human review, that harness
must be available on trusted main before a separately approved staging rerun.

## Evidence

Local validation on 2026-10-10 (not hosted success):

- UX browsers: **24/24**, no retries; includes four committed baseline comparisons.
- Hosted/UX guard tests: **90/90**.
- Triage plus existing hosted admin harness unit tests: **12/12**.
- Security contracts: both static scripts passed; admin marketplace API **55/55**.
- Typecheck, repository syntax, release synchronization and diff whitespace checks passed.
- Offline replay: real-form/pinned-SDK proposal, collection, 19-action lifecycle,
  accepted-case cancellation and item release, three-actor draft/isolation and
  transport guards passed. Three synthetic mobile checkpoints retained locally.

Initial failures were harness setup issues: default mock actor was signed in,
registration needed the Create account tab, and cancellation needed explicit
thread refresh after peer acceptance. Those are corrected without product changes.
New screenshot baselines were captured locally and still need human PR review.

CI runs independent guard/replay steps even after a browser failure and publishes
triage to the job summary. Visual regressions point to expected/actual/diff images;
reproduction includes file/line/project with retries disabled. Retry recovery is
P2, missing required browser evidence is P1. Evidence is ignored by git; only
synthetic expected baselines are committed. Never update snapshots blindly to
make a failed visual gate green.

Hosted execution is **not run**: this workspace has no staging URL/public-key
configuration. A human-approved protected run is still required; mock results
cannot establish hosted registration, RLS, Realtime, admin/MFA or outbox success.

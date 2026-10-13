# Admin robustness validation

## Phase 1 checkpoint — 6 October 2026

- `npm run typecheck` — passed.
- `npm run syntax-check` — passed.
- `npm run release:check` — passed.
- `npm run test:security-contracts` — canonical contracts and 31 injected Edge cases passed.
- `npx playwright test --config=playwright.isolated.config.ts tests/isolated/admin-console.spec.ts --project=chromium --project=firefox --project=webkit --workers=1` — 69 passed (1.9 minutes), including 320/390/768/1440px layout checks and axe accessibility.

An earlier run passed 36 Chromium/Firefox cases but the shell's 120-second limit
stopped it before WebKit. Its orphaned local test server was identified and stopped;
the complete final run above used no shell timeout. No browser cases were skipped.

These are isolated/injected tests, not production authorization or physical-device
evidence. No deployment, push, merge, account reset or collector lifecycle operation
was performed. Disposable staging credentials are not present in this worker's
environment; real-role staging/advisors were outstanding at this checkpoint.
Subsequent independently reported staging evidence is recorded below. Full required
PR CI/Beta Release Gate must pass for the final implementation head before merge.

## Phases 2/3 database and Edge checkpoint

Both additive migration files were generated with `npx --yes supabase@2.119.0 migration new`:

- `supabase/migrations/20261006090341_admin_record_inspection_v2.sql`
- `supabase/migrations/20261006090654_admin_support_desk.sql`
- Rollback-only real-role suite: `supabase/tests/admin_robustness_v2.sql`.
- Also run `supabase/tests/admin_marketplace_console.sql` for the catalogue hide/import override invariant.

`npm run typecheck`, `npm run syntax-check`, `npm run release:check` and
`npm run test:security-contracts` passed; the latter includes 55 injected Edge cases
plus canonical authorization/migration contracts. SQL has **not been executed by
this worker**; Codex's subsequent execution through the approved disposable staging
connector `tteyypklldgwwicrgjzt` is attributed below. No remote database push,
deployment or reset was performed by this worker.

Official [database function security](https://supabase.com/docs/guides/database/functions)
and [MFA enforcement](https://supabase.com/docs/guides/auth/auth-mfa) documentation
were checked before feature edits, alongside the Supabase changelog and retry entry
linked in the console documentation. No new SDK feature/version is adopted.

UI and browser coverage are a separate checkpoint. The first expanded
three-browser run returned 80 passed / 1 WebKit failure: response validation was
tightened during that run while its worker retained an older support-event mock
without the required ID. A subsequent clean run passed all 84 cases on 6 October;
the final 7 October run includes the hover-contrast correction and additional
support-history boundary coverage. PR CI/Beta checks for phase 1
reported by the parent are distinct from the older doc-only CI installation timeout
and do not validate this new checkpoint.

### Independently reported disposable staging execution

Codex, through its approved Supabase connector, fetched and reviewed committed
`35d2e27f09b58b5a6b519c23ff8d91ed833777f2` via GitHub and applied
`20261006090341_admin_record_inspection_v2.sql`, then
`20261006090654_admin_support_desk.sql`, to **disposable staging only**
(`tteyypklldgwwicrgjzt`). Both migrations succeeded.

Codex executed the **exact committed** `supabase/tests/admin_robustness_v2.sql`
without SQL errors and confirmed `plpgsql.check_asserts` was on. Post-rollback,
the baseline remained 30 profiles / 18 exchanges, with zero robustness fixture sets
and zero tied-history notes. This evidence is attributed to Codex's connector,
not execution by this worker, and is not production evidence.

Codex's advisor review identified authenticated SECURITY DEFINER warnings as
intentional: these RPCs have mandatory authorization gates and tested ordinary-role
denial. Deny-all/no-policy RLS on the private audit/revision tables is intentional.
Existing `pg_trgm` in public and disabled leaked-password protection configuration
advisories were unchanged.

Codex subsequently reported successful execution and rollback of the **exact
committed** `supabase/tests/admin_marketplace_console.sql` at the same backend
commit on the same disposable project. Catalogue hide/import preservation and
restore, replay, stale revisions, triage lifecycle boundaries and session checks
passed. Assertions were enabled for both suites. The original suite uses postgres
with JWT claims; the v2 suite additionally executes RPCs under actual
`SET LOCAL ROLE authenticated`. Both suites passed, but their role evidence is
distinct. Neither report is an authenticated production audit or a deployment.

## Final UI checkpoint — 7 October 2026

Builds on phase 1 `5df1c8bed42de39ef08708c4c5bff1a0f13d1f95` and backend
`35d2e27f09b58b5a6b519c23ff8d91ed833777f2`. The staging-verified migrations,
RPCs and SQL tests were not changed by this UI checkpoint.

- `npm run typecheck` — passed.
- `npm run syntax-check` — passed.
- `npm run release:check` — passed.
- `npm run test:security-contracts` — passed: canonical contracts and 55 injected Edge cases.
- `git diff --check` — passed.
- `npx playwright test --config=playwright.isolated.config.ts tests/isolated/admin-console.spec.ts --project=chromium --project=firefox --project=webkit --workers=1` — **90 passed (4.1 minutes)**, foreground execution with shell timeout disabled; no skips, failures or retries.

Coverage retains all phase 1 reliability cases and adds structured filter/drilldown
requests, unavailable metrics, member/event pagination beyond 100, support-history
page boundaries, escaped support notes and immutable same-request note retry after
a committed write's response times out and its dialog is canceled/reopened.
Uncertain access disables new status/note changes while the explicit retry remains
available. Closing details preserves search, filters, list page, scroll position and
opener focus. Layout checks exercise 320/390/768/1440px; axe checks cover overview,
support detail at all four widths, and the dark metric's hover/keyboard-focus
contrast. Browser emulation is not physical-device or production evidence.

All six remaining UI/docs/test files are included in the final checkpoint:
`admin-console.css`, `admin-dashboard.js`, `admin.html`,
`docs/admin-robustness-validation.md`, `docs/marketplace-admin-console.md`, and
`tests/isolated/admin-console.spec.ts`. No temporary CLI files are included.

Outstanding before merge: parent/Codex final-head review, full required PR CI and
Beta Release Gate for that exact head, and physical-device checks where required.
Phase 1 gate results do not substitute for final-head CI. The PR remains draft;
this worker did not push, deploy, merge, reset accounts, send collector messages,
modify production or perform collector lifecycle/custody actions.

## Parent-reported final-head gates and staging deployment — 7 October 2026

Parent subsequently verified runtime head `09648753d5438564742f64a30e77df6590c91bff`:
CI run `37576881882`, quality job `112647652242`, completed **SUCCESS**, including
Firefox/WebKit functional and all three-browser visual/axe steps; Beta Release
Gate run `37576881847` passed. Codex final source review reported no blocking
issues. These supersede the outstanding final-head gate/review statement above
for that runtime head, not any subsequent harness commit.

Codex reported exact runtime-head `index.ts` + `handler.mjs` deployed exclusively
to disposable `tteyypklldgwwicrgjzt`: `admin-dashboard` version 2 ACTIVE,
code SHA `298d2ce0355b03a0f6c2cbd55d4633438215b45dae40a040138696f46ced6cc3`.
`verify_jwt=false` retained custom handler authentication gates. Parent's actual
missing-token and invalid-token HTTP probes both returned **401 unauthenticated**,
no private payload and `Cache-Control: no-store`. This worker did not duplicate
those probes or perform that deployment.

The follow-up harness/workflow in `docs/hosted-admin-smoke.md` is prepared for
review only. No privileged/credentialed hosted execution or dispatch occurred.
Authenticated real-MFA staging execution, live staging UI suppression and
physical-device evidence remain outstanding. Neither SQL claims nor injected
harness regression tests substitute for real MFA login proof.

Follow-up local validation (no hosted requests):
- `node --test tests/hosted/hosted-admin-smoke.test.mjs` — 9 passed, zero failures/skips.
- `node --check scripts/hosted-admin-smoke.mjs` — passed.
- `npm run typecheck`, `npm run syntax-check`, `npm run release:check` — passed.
- `git diff --check` — passed.

The tests inject SDK/HTTP doubles and check guards, RFC TOTP calculation, masking,
error-only denials including `summary`, account matching, API sequence, replay,
401/403 revocation and failure sign-out. They do not establish hosted Auth behavior.
Workflow source guard assertions passed; live workflow execution remains blocked
by default-branch routing, environment provisioning and review. No unchanged
90-browser/security-SQL suites were rerun, and runtime/backend files are unchanged.

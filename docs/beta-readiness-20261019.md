# Beta release-readiness audit — 19 October 2026

## Outcome

**Not beta-ready.** The HIGH expired-proposal counter defect identified below has a forward-only fix in this working branch, but its SQL execution on an isolated database and the hosted, device, and exact-candidate gates remain pending.

## Candidate and provenance

- Candidate: `aa1c6fb8608104f366d9d42f977298af7ad6b9cb`
- `origin/main`: `66ca962eae2faa9d4aa66f8ab638fd23359870d6`
- Candidate is two commits ahead of, and descends from, `origin/main`; the candidate-only changes are client deadline guards, mirrored asset/release files, one isolated browser test and a runbook edit. No migration/schema change is included.
- Worktree had an untracked `node_modules` directory at inspection; it was left untouched.
- The local `origin/fix/issue-153-reliability` tip (`0e44c62a3a7674f2e77b48c656fbdfea1d90437a`) is an ancestor of both `origin/main` and this candidate. Issues #41 and #96 have no locally available descriptions/refs. No remote issue or PR data was fetched; old PR descriptions were not treated as current evidence.
- Relevant newest material is `docs/hosted-beta-release-staging.md` (17 October) and `docs/canonical-exchange-runbook.md` (18 October). The October 14 audit/ledger documents describe older pinned baselines and do not certify this SHA.

## HIGH finding

| Severity | Evidence | Reproduction | Minimal fix |
|---|---|---|---|
| HIGH | `supabase/migrations/20260916052934_canonical_exchange_state_machine.sql:761-768` allows `clean_action='counter'` after checking only `PROPOSED` and recipient; unlike `accept` at lines 770-772, it never compares `response_deadline` with `now()`. The RPC is executable by `authenticated` (`:1241-1243`). A successful late counter rewrites the proposal and starts a fresh 48-hour deadline. | As the current recipient, call `exchange_case_transition(case_id, current_state_version, 'counter', unique_key, '{"duration_days":60}')` after the case's deadline while it remains `PROPOSED`. It succeeds and increments the version. This is a source-derived repro; no database was used. The candidate's `app-v3.js:1407,1438,1441-1444` guard only blocks browser actions; `tests/isolated/expired-proposal-deadline.spec.ts` uses the browser mock and asserts no RPC call, not server enforcement. | Reject `counter` when `response_deadline <= now()` inside the RPC before mutation, matching the server-side `accept` guard. Add a real-role SQL regression proving no state/version/deadline/event/notification changes on an expired counter. Keep `decline`/`withdraw` available. |

No other BLOCKER/HIGH implementation defect was established from the inspected source. The current client behavior and its mock test are useful UX regression coverage, not proof of server enforcement.

## Follow-up — RPC fix and evidence

- CLI: Supabase CLI `v2.121.0`; created `supabase/migrations/20261019030051_reject_expired_exchange_counters.sql` with `supabase migration new`.
- The migration rewrites only the expected `counter` authorization fragment in `pg_get_functiondef('public.exchange_case_transition(uuid,bigint,text,text,jsonb)')`, adds the same `response_deadline <= pg_catalog.now()` rejection used by `accept`, and fails closed if the fragment is absent or ambiguous. It does not add grants, alter ownership, change the function signature, or touch any other transition. No later migration redefines this RPC.
- `supabase/tests/expired_exchange_counter.sql` uses `SET LOCAL ROLE authenticated` for participant and outsider calls. It tests expired/equal-deadline rejection, future counter success, outsider denial, late decline/withdraw success, unchanged case row/version/deadline, item locks, events/idempotency keys, in-app notifications and notification-email outbox, plus SECURITY DEFINER, empty `search_path`, and existing execution grants.
- `.github/workflows/beta-release-gate.yml` runs that test against the canonical pre-fix RPC first and requires its specific expired-counter failure, then applies the new migration and runs it again before the full canonical SQL tests. This pre-fix/pass sequence is defined but has not run in this environment.
- `npm run test:security-contracts` passed, including the new migration-scope contract (55 existing admin API tests passed). PostgreSQL 15.19 client and server toolchain are present; executing the server requires interactive permission unavailable in this non-interactive session, so no SQL database was started and the real-role SQL tests remain pending. The no-secret loopback Postgres 17 workflow job is the next database validation.
- Reviewed the follow-up for forbidden `auth.users.user_metadata` authorization, broadened grants, and client-side secret exposure; none were introduced. No hosted DSN or external service was used.

## Evidence and remaining gates

| Gate | Evidence available in-tree | Missing evidence / next action |
|---|---|---|
| Signup through review; person-first Messages; admin UX | Isolated suites cover registration, mobile collection/wishlist/matching, lifecycle stages, person-first conversations and admin console. Canonical SQL workflow/state-machine tests cover server transitions, locks, RLS and reviews. | Obtain exact-candidate CI results; test contracts and mocks do not establish hosted Auth/Admin behavior. |
| Full isolated browser matrix | `.github/workflows/ci-hardening.yml` runs Chromium isolated tests and Firefox/WebKit isolated tests, plus visual/accessibility checks. | Do not rerun while CI is running. Verify all required jobs pass on this exact SHA; prior docs/runs are for older heads. |
| Static/runtime contracts and auth/session isolation | CI invokes typecheck, syntax/release checks, security and conversation contracts, owner-review/avatar contracts, and isolated browser coverage. Account-switch, confirmation, logout and notification-auth isolation tests are present. | Verify exact-head results, including static contracts and targeted account-switch/logout/session-isolation cases; do not infer from the fixture-only beta journey. |
| Photo/gallery permissions | `.github/workflows/photo-storage-permissions.yml` defines disposable-Postgres owner, participant, outsider/anonymous, forged-reference, gallery and orphan-cleanup checks; runtime URL-cache/gallery tests are also present. | Verify the exact candidate's SQL and runtime checks. This is not hosted Storage evidence. |
| SQL no-secret local gate | No dedicated SQL-secret scanner/check is defined in `package.json` or the inspected CI workflows. Database workflows use disposable Postgres services; that is not a source-secret scan. | Add/execute a source-only scan of tracked SQL and review results before any SQL gate. Keep it offline; do not use a hosted DSN. |
| Proposal expiry operation | `expire_exchange_cases` is service-role-only and the runbook describes manually invoking it. No in-repository cron/scheduler invocation was found. | Verify an approved staging scheduler invokes expiry regularly, or document the operator-owned trigger. Otherwise elapsed proposals may remain `PROPOSED` with item holds until a participant closes them or a worker runs. |
| Hosted staging | The merged-beta workflow is manual, protected, and pinned to PR168 / its recorded SHA; it provisions synthetic accounts and audits without provider delivery. It does not certify this unmerged candidate. | After the server fix and exact-head CI, use a separately reviewed trusted workflow selection for the merged candidate; verify staging schema, expiry/counter behavior, Auth/session isolation, photos, Realtime and outbox. No secrets or hosted services were accessed in this audit. |
| Physical phones | Browser emulation and camera/gallery mocks exist; prior docs explicitly distinguish them from devices. | Record real iOS and Android signup, permission, photo/gallery, keyboard/safe-area, rotation and background/resume checks. No device evidence is present here. |
| Admin authority | Source contracts and isolated console tests exist; `docs/hosted-admin-smoke.md` says the AAL2 smoke remains prepared/not executed. | Keep positive admin MFA and real-session isolation as a separately approved staging gate; do not treat mocked authorization as hosted evidence. |

## Next commands / sequence

1. Run the updated beta-release-gate canonical job on the exact candidate; it must prove the pre-fix regression fails, the post-fix regression passes, and the full canonical SQL tests still pass on disposable PostgreSQL 17.
2. When the current CI run is complete, verify its result for this SHA. Existing coverage includes `npm run typecheck`, `npm run syntax-check`, `npm run release:check`, `npm run test:security-contracts`, `npm run test:conversation-contracts`, `npm run test:owner-review-recovery`, `npm run test:collector-avatar`, `npm run test:isolated:chromium`, then `npm run test:isolated -- --project=firefox --project=webkit` and `npm run test:cross-browser`.
3. Verify the photo-permissions workflow and offline SQL secret scan; then run only the approved, protected hosted-staging flow for the exact merged candidate.
4. Complete and retain real-phone checks before making a beta-ready claim.

No full browser suite or real database was run, no hosted endpoint/API was accessed, and there was no push, merge, deployment or billing action.

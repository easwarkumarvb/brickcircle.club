# Proposal response deadlines and resend invites

Pending proposals and counters show the exact deadline in the browser's local time zone, a live countdown, and guidance for the current decision maker. Requests, Messages and the exchange dialog share the deadline display. The timer updates text and action controls without replacing counter or message drafts. Resend completion captures the auth epoch and route/conversation identity; it refreshes shared data but updates the originating surface only while it is still current. Release `20261103-proposal-deadlines-r1` updates the manifest, HTML asset versions and shell cache through the existing sync script. At expiry the current proposer, including a counter proposer who is user B, can resend from Messages or the case. Both elapsed `PROPOSED` rows and `EXPIRED` rows are supported.

`resend_exchange_case_invite` authorizes the current proposer before replay lookup, locks the case, checks the expected version, then locks physical collection items in ID order. It rechecks ownership, availability, review flags, condition/completeness/photo fields, adult profiles, city, blocks and reciprocal wishlists. Only the same pending case's proposal holds are reusable; reservations are never overwritten. Conflicting active cases or unique lock conflicts abort the transaction. A resend grants the usual 48 hours and records the previous deadline/cancellation fields in a new audit event. Elapsed pending rows get an expiry audit event first. The expiry worker now keys events by case/version/deadline so a resent proposal can expire again. A replay returns the canonical snapshot and produces no second recipient notification.

The server queues the existing `proposal_reminder` kind for the actual recipient in the 24-hour and 1-hour windows. A late run selects the current window rather than claiming a full hour remains. Keys include case, proposal deadline, proposal revision, stage and recipient; unrelated state-version changes do not create another reminder. Already-notified current-stage candidates are excluded before the batch limit, including both return recipients, so repeated bounded runs advance through the backlog. Case locks serialize enqueue against decisions. Reminder rows use canonical case metadata and explicit dedupe keys rather than the older single-entity index, which cannot represent two stages or daily overdue reminders. Existing return reminders, including daily overdue notices to both participants, are retained. Email and push check the current proposal revision/deadline/recipient again before delivery and refresh remaining-time wording. Already in-flight provider requests cannot be recalled after a concurrent decision.

## Validation

Run `qa/run-proposal-deadline-tests.sh` on a disposable local machine with PostgreSQL 15 and `postgresql-15-cron` installed. The runner creates only `/tmp/brickcircle-deadline-pg`, listens on loopback port 55439, applies the repository's canonical QA base, canonical migration, current counter-expiry guard and this migration. It runs the existing expired-counter SQL regression, new transactional SQL behavior tests, and real concurrent PostgreSQL sessions for replay and competing historical resends. It stops its cluster on exit and refuses to reuse an existing data directory. This exercises a representative canonical schema; it is not a full hosted Supabase migration replay.

```sh
npm ci --ignore-scripts
npm run typecheck
npm run syntax-check
npm run release:check
npm run test:security-contracts
npm run test:conversation-contracts
npm run test:isolated -- tests/isolated/expired-proposal-deadline.spec.ts tests/isolated/notification-email-core.spec.ts tests/isolated/web-push-core.spec.ts --retries=0
```

Browser tests use an isolated Supabase mock; the SQL and concurrent-session tests supply separate database behavior evidence. No provider email/push or hosted database test is performed by these commands.

## Recorded results (2026-11-03)

- Disposable PostgreSQL suite passed: existing counter regression, new deadline/resend behavior and eligibility tests, reminder batch-size-one regression across both proposal stages and daily overdue returns, and two concurrent-session races.
- Earlier Chromium run: 31/31 focused UI/email/push tests passed. Final affected Chromium/WebKit run: 18/18 passed, including deferred navigation with draft retention and the previously failing live-expiry controls.
- The earlier WebKit run was 30 passed / 1 failed because an older assertion tried clicking a control already disabled by the live timer. Those assertions now check proactive disablement and pass in the final focused run. A separate earlier cross-browser attempt was disrupted by concurrent Deno dependency installation; it is not reported as a complete cross-browser pass.
- Deno check passed for both Edge Function entrypoints. Typecheck, syntax check, release check and diff whitespace check passed. Previously run security contracts (61 Node subtests plus legacy migration assertions) and conversation contracts (27 tests) passed; they were not broadened or repeatedly rerun during final review.
- No hosted database, full hosted migration replay, provider delivery, merge or deployment was performed. Those remain rollout checks.

## Rollout still required

No hosted migration, deployment or merge is included in this change.

1. Review the target database's migration state and existing expiry/reminder schedules. Enable `pg_cron` through the approved environment process before applying this migration; absence of Cron deliberately fails migration application. Confirm the migration role can schedule and execute the two server-only workers. Resolve any older expiry schedule so there is one scheduler for these workers.
2. Deploy both updated `send-notification-email` and `send-web-push` functions before applying the migration, so reminders have delivery-time stale checks when they begin to queue. The existing dispatcher/webhook configuration and provider credentials must remain configured; the SQL Cron job does not send directly to providers.
3. Apply `20261103064244_deadline_delivery_validation.sql` transactionally through the normal migration process. It registers `brickcircle-proposal-deadlines` at `*/5 * * * *`, calling expiry (100) then reminders (500). This is an actual job registration, not a manual scheduling suggestion. Confirm the job owner and `cron.job_run_details` results, bounded backlog, recipient routing and outbox delivery in staging before production approval.
4. Release the frontend after the RPC is present. Verify the exact local deadline, draft preservation, counter proposer resend and stale reminder suppression in staging. Hosted provider delivery and a full main-schema rehearsal remain rollout checks.

To stop future processing, unschedule only the recorded `brickcircle-proposal-deadlines` job ID. Do not remove audit events or reopen cases as a rollback. Stop reminder scheduling before rolling back worker code; keep the dedicated resend RPC available while clients using it remain released.

## Supabase documentation review

Reviewed on 2026-11-03: [Cron documentation](https://supabase.com/docs/guides/cron) describes SQL scheduling and `cron.job_run_details`, and recommends no more than eight concurrent jobs and runtimes under ten minutes. [CLI migration reference](https://supabase.com/docs/reference/cli/supabase-migration-new) was checked; the migration file was created with `supabase migration new deadline_delivery_validation` before filling it.

The [Supabase changelog](https://supabase.com/changelog) entry dated 2026-10-30 reports outdated server time-zone data for Vancouver, Edmonton and Casablanca on older Postgres builds. This feature stores absolute `timestamptz` deadlines and formats local display in the browser. Review that server upgrade separately if the target uses affected server-side local-time conversions; this change does not upgrade any database.

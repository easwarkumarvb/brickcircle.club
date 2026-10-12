# PR138 staging validation

Candidate: `7d84652903b176d69bfd09e2f59f3c3ec785d1a3`. Product draft: https://github.com/easwarkumarvb/brickcircle.club/pull/138.

The separate staging runner proposal targets trusted main and never includes the product implementation. Existing PR125 runners and their pins remain unchanged. The new runner cannot execute from this proposal branch: main dispatch and protected-environment review are mandatory. No merge, deployment, production migration or policy relaxation is authorized. An infrastructure merge also needs deployment controls checked so that it does not trigger a production deployment.

The additive conversation migration was applied only to `brickcircle-exchange-staging-20260924` (`tteyypklldgwwicrgjzt`) on 12 October 2026. Its table RLS and anonymous denials were verified. Supabase security advisors reported no new conversation findings; existing unrelated advisor notices remain. This is not browser or Realtime certification.

The actual staging HTTPS preflight passed for all three RPC signatures with anonymous execution denied. A rollback-only authenticated database check passed owner RLS, authorized feed pagination, cursor monotonicity and forged-cursor rejection. Existing projected entries remained at 810 and no rollback fixture messages persisted. This checks the authenticated database role, not a browser Auth session.

The larger fixture/lifecycle SQL in `qa/pr138_hosted_projection_check.sql` is prepared but not certified: two connector requests expired without an execution result. Readback confirmed no surviving fixtures. Run it through a trusted staging database session only. Do not describe these requests as successful full hosted journeys.

## Protected hosted run

After separate owner approval of the trusted runner integration, dispatch from main with PR138, the exact candidate SHA and `RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE`. Review the candidate again at the environment gate. The runner must fail closed for missing projection RPCs, changed candidate SHA, unexpected staging URL or production target. Only new `example.test` users may be provisioned. Browser contexts receive publishable credentials only; server credentials remain in provisioning and outbox/server verification steps. Retain only allowlisted redacted reports.

Success requires two same-person cases, explicit reply destination, retry/reload recovery, general chat after closure, notifications, own read-cursor synchronization, third-person isolation and the complete canonical proposal-to-return journey. Server RLS/Realtime/outbox smoke and zero-provider-delivery audit must also succeed. A passing isolated mock test is not hosted evidence.

## Physical phone checks

Use a staging-only build of the same immutable candidate and disposable identities. Do not use production or a real collector's data. Test iOS Safari and Android Chrome at normal text size and enlarged text size.

1. Find a named collector, open chat, and search/filter the inbox. Verify clear back navigation and a reachable Send button.
2. Open the keyboard, type a long draft, rotate the device and dismiss/reopen the keyboard. Check that the caret, composer and bottom controls stay reachable without horizontal page overflow.
3. View each of two exchanges. Verify that viewing does not select a reply destination. Choose an exact reply, then remove its chip and send a general message.
4. Open each action sheet; scroll through longer meetup/inspection forms. Confirm close and focus return, readable safe areas, and no background form submission.
5. Receive messages at the bottom and while reading older history. Check automatic scroll only near the bottom and the new-message jump otherwise.
6. Lose connectivity during send, reload, reconnect and retry. Verify one committed message with the original destination/body; text must remain available after a definitive closed-case rejection.
7. Complete the physical exchange and return with two disposable collectors. Confirm archived context stays readable and general chat stays open. Verify a third collector cannot access the case or feed.

Record OS/browser versions, candidate SHA, each result and any blocking defect. These checks remain manual and unexecuted until device evidence is recorded.

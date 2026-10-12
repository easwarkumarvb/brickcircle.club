# PR138 staging validation

Revalidation candidate: `3d1fc2097780c5352e2cdf66a100a38c38141407`. Product draft: https://github.com/easwarkumarvb/brickcircle.club/pull/138. This new head has client microsecond ordering, refresh-retention and displayed-read-cursor fixes. CI and a fresh protected hosted run for this exact head remain pending.

The separate runner refresh proposal targets trusted main and never includes the product implementation. Existing PR125 runners and their pins remain unchanged. The updated runner cannot execute from this proposal branch: trusted-main integration, manual dispatch and protected-environment review are mandatory. This new runner proposal requires separate owner merge approval. Product PR138 merge, production deployment and production migration remain unauthorized. Vercel automatic deployments remain disabled for main, the existing runner branch and the product development branch; the new `qa/pr138-staging-revalidation` branch is disabled before publication too. Re-enabling automatic main deployments or manually deploying production requires separate owner approval.

## Completed previous candidate

Protected run https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38264186486 completed successfully for the previous immutable product head `7d84652903b176d69bfd09e2f59f3c3ec785d1a3`, after owner environment approval. It includes the hosted browser journey, server RLS/Realtime/outbox checks and zero-provider-delivery audit. This evidence belongs to that head only; it does not certify the new candidate. Physical-phone checks remain unexecuted.

The additive conversation migration was applied only to `brickcircle-exchange-staging-20260924` (`tteyypklldgwwicrgjzt`) on 12 October 2026. Its table RLS and anonymous denials were verified. Supabase security advisors reported no new conversation findings; existing unrelated advisor notices remain. This is not browser or Realtime certification.

The actual staging HTTPS preflight passed for all three RPC signatures with anonymous execution denied. A rollback-only authenticated database check passed owner RLS, authorized feed pagination, cursor monotonicity and forged-cursor rejection. Before the completed browser run, readback showed 810 projected entries and no rollback fixture messages; the later successful hosted run added retained staging evidence. This checks the authenticated database role, not a browser Auth session.

The larger fixture/lifecycle SQL in `qa/pr138_hosted_projection_check.sql` is prepared but not certified: two connector requests expired without an execution result. Readback confirmed no surviving fixtures. Run it through a trusted staging database session only. Do not describe these requests as successful full hosted journeys.

## Protected hosted run

The owner approved the original runner-only PR139 integration and its completed protected staging run. The narrow PR139 merge-event binding remains unchanged; normal later main pushes cannot pass it. The new candidate must use the existing manual workflow from trusted main after separately approved runner integration, with PR138, the exact candidate SHA and `RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE`. Missing manual inputs are never synthesized. Candidate selection and provenance checks repeat after protected-environment review. Review the candidate again at that gate. The runner must fail closed for missing projection RPCs, changed candidate SHA, unexpected staging URL or production target. Only new `example.test` users may be provisioned. Browser contexts receive publishable credentials only; server credentials remain in provisioning and outbox/server verification steps. Retain only allowlisted redacted reports.

Success requires two same-person cases, explicit reply destination, retry/reload recovery, general chat after closure, notifications, own read-cursor synchronization, third-person isolation and the complete canonical proposal-to-return journey. Server RLS/Realtime/outbox smoke and zero-provider-delivery audit must also succeed. A passing isolated mock test is not hosted evidence.

The trusted feed-evidence comparator now retains PostgreSQL microseconds and normalizes timezone offsets before applying source tuple tie-breaks. Its regression tests accept correctly ordered same-millisecond rows whose IDs sort in the opposite direction, reject the reversed chronology, preserve equal-instant tuple ordering and reject malformed timestamps. Hosted execution validates actual returned pages with this stricter comparator; these guard tests alone do not establish hosted coverage of a deterministic submillisecond fixture.

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

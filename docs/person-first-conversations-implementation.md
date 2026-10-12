# Person-first conversations implementation

Implements the interaction and resilience work approved in design PR #135 on `dev/person-first-conversations`. This is a draft candidate, not release-ready.

## Implemented behavior

One inbox row per collector, name search, action filter, a chronological person timeline and a permanent composer. Viewing an exchange never chooses a message destination; explicit removable context binds replies to an exact physical exchange case. Compact set chips and native sheets expose existing canonical actions. Closed exchange history remains read-only while general chat remains available. The exchange-detail page no longer provides a second message composer.

Recipient-scoped notifications refresh the visible conversation immediately, with fallback polling. Drafts and uncertain send keys survive same-tab reload for 24 hours with 4000-character / 50-destination limits, and clear on account changes/sign-out. Retries preserve sender, original body, destination and key. A closed case can reconcile an already-committed send through the existing RPC, or preserve undelivered text for an explicit Copy to general chat action. Refresh preserves input focus/caret, keeps scroll position, and offers a new-messages jump when appropriate. Successful message sources remain visible during partial retrieval failure; authorization failure clears protected content.

Canonical proposal, transition, cancellation, message and review writers remain authoritative. No custody state-machine migration, production auth setting or item-lock policy was changed.

## Validation status

Local syntax, TypeScript, release consistency, security contracts, owner recovery, collector avatar, hosted harness safety and draft VM checks passed. Hosted runners provide browser execution because local Playwright downloads returned HTML instead of browser archives. Mobile screenshots were inspected; physical-phone validation remains outstanding.

On 12 October 2026, baseline `7d84652903b176d69bfd09e2f59f3c3ec785d1a3` passed [conversation browser matrix](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38229459468) (111 tests per Chromium, Firefox and WebKit without retries), [product CI](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38229459512) (414 Chromium, 827 Firefox/WebKit plus one account-switching test passing on retry, nine visual/accessibility), [beta gate](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38229459514), and [isolated PostgreSQL 17](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38229459467), including custody, projection authorization, paging, deletion and concurrent unread/case counts.

The same exact baseline passed [protected hosted staging run 38264186486](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38264186486) after the user approved GitHub environment review. Trusted runner-only PR #139 was merged separately; product PR #138 remains draft and unmerged. Three fresh `example.test` Auth accounts at 390px browser viewports verified general chat, two explicit case destinations, reload drafts, committed-response-lost retries, server paging, visible read cursors, third-collector unread isolation, old notification links, outsider denial, the complete mutual meetup/safety/arrival/inspection/handoff/return journey, and general chat after completion. The server suite passed Realtime recipient isolation, stale-version rejection, cancellation/lock recovery, early return, review/rematching and account-switch isolation. The final audit found 122 pending fixture outbox records and zero provider attempts. Browser transport reported zero production requests and zero unexpected sockets.

The three allowlisted JSON reports are retained in [artifact 11755547093](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38264186486/artifacts/11755547093). Evidence remains in isolated staging project `tteyypklldgwwicrgjzt`. The larger rollback-only SQL connector check did not return a result and is not claimed as certified. Existing unrelated staging advisor findings are not claimed resolved.

Automatic Vercel deployment is disabled for `main`, the runner branch and this product branch. Re-enabling production automatic deployment requires separate approval. No production migration or product release is authorized by staging approval.

## Outstanding release gates

Stage B includes an additive CLI-generated projection migration and capability-scoped browser integration: collector summaries, inbox/feed paging, exact case/message links and durable own-user read cursors. The previous proposal under `supabase/proposals` is superseded. Missing RPCs use the compatible device-local legacy path; known server support never downgrades on access or transport errors. The additive migration was applied only to isolated staging; production remains untouched.

A focused review after the certified baseline reproduced a client precision defect: millisecond comparison can reorder PostgreSQL microsecond timestamps, remove an older row at a full-page refresh boundary, and choose the earlier displayed read cursor. The development follow-up preserves timestamp precision for feed ordering, inbox ordering and refresh boundaries. Its new commit requires fresh exact-head CI and hosted validation; baseline evidence must not be represented as validation of later source.

Physical iOS/Android keyboard, safe-area and touch inspection, representative projection/backfill performance checks and final release review remain outstanding. Existing trusted hosted runners pin exact approved SHAs and must not be silently repurposed.

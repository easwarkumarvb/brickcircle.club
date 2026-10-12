# Person-first conversations implementation

Implements the interaction and resilience work approved in design PR #135 on `dev/person-first-conversations`. This is a draft candidate, not release-ready.

## Implemented behavior

One inbox row per collector, name search, action filter, a chronological person timeline and a permanent composer. Viewing an exchange never chooses a message destination; explicit removable context binds replies to an exact physical exchange case. Compact set chips and native sheets expose existing canonical actions. Closed exchange history remains read-only while general chat remains available. The exchange-detail page no longer provides a second message composer.

Recipient-scoped notifications refresh the visible conversation immediately, with fallback polling. Drafts and uncertain send keys survive same-tab reload for 24 hours with 4000-character / 50-destination limits, and clear on account changes/sign-out. Retries preserve sender, original body, destination and key. A closed case can reconcile an already-committed send through the existing RPC, or preserve undelivered text for an explicit Copy to general chat action. Refresh preserves input focus/caret, keeps scroll position, and offers a new-messages jump when appropriate. Successful message sources remain visible during partial retrieval failure; authorization failure clears protected content.

Canonical proposal, transition, cancellation, message and review writers remain authoritative. No custody state-machine migration, production auth setting or item-lock policy was changed.

## Validation status

Local syntax, TypeScript, release consistency, security contracts, owner recovery, collector avatar, hosted harness safety and draft VM behavior checks passed. Browser specifications compile and include exact case routing, multiple cases, three-user isolation, partial failure, reload, keyboard focus, 320px layout and a sequential two-party exchange/return journey. Local browser execution is blocked: Playwright downloads returned HTML instead of browser archives. No screenshot or real-phone validation is claimed.

Normal GitHub PR CI runs isolated PostgreSQL and browser gates; results must be reviewed at the exact candidate commit. `vercel.json` disables automatic deployment only for this development branch. No production merge, deployment or hosted migration is authorized.

## Outstanding release gates

Stage B now includes an additive CLI-generated projection migration and a capability-scoped browser integration: collector summaries, explicit inbox/feed paging, exact case/message links, and durable own-user read cursors. The previous proposal under `supabase/proposals` is superseded. Missing RPCs use the compatible device-local legacy path; known server support never downgrades on access or transport errors. The new PostgreSQL and cross-browser gates must certify this source before it is considered validated. No hosted migration has been applied.

Hosted real-account testing is unexecuted. Existing hosted runners are pinned to older approved branches/SHAs and must not be repurposed silently. A trusted immutable candidate runner, fresh three-collector staging identities, production network exclusion and outbox-only notifications are required. Real phone/safe-area/keyboard inspection and full hosted lifecycle/RLS checks remain required before any release recommendation.

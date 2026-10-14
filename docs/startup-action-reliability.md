# Startup and action reliability

The first usable boot render was followed by referral/provider work and a second shell replacement. A collector could click an exposed control while that replacement detached it. Optional bookkeeping now runs as a bounded group before initial hydration, and the usable shell renders once. Navigation to the same hash respects the boot loading state. Late optional responses have no shell-render continuation.

Wishlist actions capture the account, authentication epoch and render token. A completed write refreshes that account's data, while its old handler cannot replace a newer view or announce success after signout/account changes. Canonical exchange writers, role gates and camera cleanup remain authoritative.

Ordinary focus no longer rehydrates a usable shell. Genuine background transitions share one bounded authentication validation per account/epoch/transition. Later transitions retire old recovery and hydration responses before shell replacement; confirmed missing authentication still clears protected UI and overlays. The existing resume grace remains unchanged.

The three-user journey helpers still assert actual fixture server state and additionally await final UI completion before navigating or changing actors. They contain no added sleeps, retries or timeout widening.

Nine controlled-delay tests execute the production application with only transport delays: startup gate, optional eight-second deadline/late completion, wishlist navigation and wishlist signout, ordinary focus, deduplicated genuine resume, newer hidden transitions, hydration invalidation and confirmed missing authentication. A dedicated three-engine workflow strictly reproduces the old exposed-control boundary against frozen c68d562 source, then exercises the repaired startup/journeys/camera scenarios three times with zero retries and runs account/callback regressions.

Prepared through GitHub after the local environment disconnected. JavaScript parsing was checked without executing application code; TypeScript, browser and full regression results must come from CI. This branch is stacked on the validated security draft. No merge, deployment, production change or physical-device certification is implied.

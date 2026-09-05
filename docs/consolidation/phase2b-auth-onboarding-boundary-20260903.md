# Phase 2B — authentication and onboarding consolidation

Base checkpoint: `095836f75e443ac8f50ce1cc3bfaa01d7da47ae9` (merged Phase 2A).

## Objective

Replace overlapping authentication, join-entry and onboarding ownership with one canonical runtime path, using the isolated Phase 2A harness to prove behavior before removing superseded layers.

## In scope

- Establish one authoritative Supabase client for the active frontend runtime.
- Consolidate the overlapping auth and onboarding behavior currently split across `app-v3.js`, `join-entry-v33.js` and `v3-auth-onboarding-hotfix.js`.
- Preserve Google OAuth, email sign-in/sign-up/reset, `?join=1`, referral capture, OAuth callback cleanup, onboarding profile persistence, sign-out and session-change behavior.
- Preserve the loopback-only isolated test boundary and add deterministic regression coverage for each consolidated path.
- Remove superseded runtime scripts from `v2.html`, release manifests, service-worker assets and syntax checks only after parity tests pass.
- Keep production routes, user-visible behavior and database contracts stable.

## Required verification

- Release asset drift check.
- TypeScript and JavaScript syntax checks.
- Static contract suite.
- Isolated Chromium, Firefox and WebKit functional suite.
- Existing three-browser visual/accessibility suite.
- No production network, Supabase mutation or credential use during isolated tests.
- No credentials, caches, browser artifacts or temporary files in the diff.

## Out of scope

- Production Supabase access or mutation.
- Database pushes, migration changes, storage/cron changes or production SQL.
- Exchange, messaging, catalogue, matching or membership redesign.
- Broad frontend restyling or route changes.
- Vercel production deployment or direct push to `main`.

Keep the pull request draft until technical review and explicit approval.

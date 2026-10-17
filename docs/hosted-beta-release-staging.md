# Merged beta release staging

Manual workflow: hosted-supabase-beta-release.yml, dispatched on main only.
Use pull_request_number 168, expected_head_sha 1cc2b24a6c2c348dc95f320fa9970a7bac8ba90a,
and confirmation RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE.

The validator pins the merged PR168 head, merge commit, repository, branches,
and trusted workflow ref. It revalidates provenance after the protected
hosted-supabase-staging environment gate. Existing PR160 and historical runners
remain pinned to their original candidates.

Staging has all five migrations applied on 17 October 2026: gallery owner
binding, profile/message write authority, admin growth reporting, avatar
namespace binding, and push provider binding. Catalog and zero-row role checks
are separate evidence from this workflow; they are not a completed hosted run.

The runner reuses staging-only HTTP photo permissions/expiry tests, canonical
exchange/Realtime checks and outbox auditing. It provisions only example.test
synthetic accounts; production targets, real email delivery and production
migrations are outside this runner. Public-key harness steps receive no server
credential. Only allowlisted redacted JSON evidence is uploaded.

A successful run validates its fixed release against the staging schema at run
time. It does not certify later commits, positive administrator MFA access,
physical phone camera/keyboard behavior, production rollout or provider delivery.

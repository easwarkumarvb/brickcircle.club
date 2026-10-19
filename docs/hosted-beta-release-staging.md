# Merged beta release staging

The manual workflow `.github/workflows/hosted-supabase-beta-release.yml` is
pinned to the exact merged PR176 provenance:

- Repository: `easwarkumarvb/brickcircle.club`
- PR head: `dev/exchange-outlier-ux-20261018` at
  `ffac9f4d77f05e9fcbf7b4a04bcc16acbb54cacd`
- Merge commit / immutable candidate: `5c5a5c4c3eb7fd4bda2e502244edf60829b90595`
- Dispatch inputs: PR `176`, that full merge SHA, and
  `RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE`

The secret-free validation job accepts only the closed, merged, same-repository
PR with the exact head branch/SHA, merge commit, `main` base, trusted
`workflow_dispatch` event and workflow ref. The staging job first checks out
trusted harness code from the dispatch commit, then repeats the GitHub PR
provenance validation after the required `hosted-supabase-staging` environment
review. Only then does it check out the immutable PR176 merge commit as the
candidate and verify its full SHA. Configure that environment with human
reviewers and default-branch restrictions; dispatch remains a separate manual
operation.

The candidate checks retain the owner-photo runtime/browser coverage and add
PR176's expired-counter migration contract and proposal-deadline browser
coverage. The workflow runs offline hosted safety/transport guards before
fixture provisioning, verifies the exact staging project before privileged
bootstrap, and never applies migrations. The staging schema must be prepared
for PR176 separately under its own approval; this source-only update does not
assert that any hosted migration has been applied or that a hosted run passed.

The target guard requires the configured staging project to differ from
production, the staging URL/project-ref pair to match, synthetic identities to
use `example.test`, and notification mode to be `outbox-only`. Public-key photo
checks receive only the staging URL and publishable key. The privileged
bootstrap, exchange smoke, and fixture-outbox audit receive the staging
secret-key credential only in their scoped steps. The workflow does not bind
production secrets or invoke a provider-delivery path.

Artifacts are restricted to the named HTTP, outbox, and exchange-smoke JSON
evidence files, with 30-day retention; the generating scripts are responsible
for their redacted schemas. No broad artifact path is allowed. The workflow is
not a production rollout, migration runner, provider-delivery test, or proof of
live administrator access.

The earlier PR160 workflow remains pinned to its original candidate and is
unchanged by this release update. The hosted release workflow itself has not
been dispatched, and no hosted database or credential was accessed while
preparing this source.

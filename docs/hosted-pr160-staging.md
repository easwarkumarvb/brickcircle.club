# PR160 protected hosted staging

`.github/workflows/hosted-supabase-pr160.yml` is a manual-only staging runner.
Its trusted workflow ref remains `refs/heads/main`: manual dispatch requires a
separate, reviewed copy of the workflow to be present on the repository's default
branch. The workflow code must be reviewed and merged there before it can be
dispatched; the product candidate is still checked out separately at the supplied
immutable PR head.

Dispatch with PR number `160`, the full 40-character head SHA shown by the open
PR, and confirmation `RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE`. The secret-free
validation job verifies the same-repository PR, its
`integration/beta-illustration-three-photos` head branch,
`integration/admin-security-reliability` base branch, and that the supplied SHA
matches the PR's actual head. It repeats those checks after the staging environment
approval, so a moved, retargeted, closed, or merged PR is rejected before staging
secrets are used.

The `hosted-supabase-staging` environment must require human reviewer approval
and be restricted to the trusted default branch. This approval is a separate
required gate between secret-free validation and staging execution. The runner is
not an application deployment or migration operation.

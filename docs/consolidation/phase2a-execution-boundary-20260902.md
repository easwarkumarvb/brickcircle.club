# Phase 2A execution boundary

Base checkpoint: `d0410924024bf59af6de89675ff820fada967720` (merged Phase 1B).

## Objective

Create an isolated branch-local application/backend test harness and use it to make authenticated and cross-browser regression checks deterministic before frontend consolidation begins.

## In scope

- Isolated test data/backend or deterministic mock boundary with no production credentials.
- Chromium, Firefox and WebKit hydration coverage.
- Auth dialog, onboarding, collection, wishlist, catalogue search, matching and lifecycle wiring regression coverage.
- Narrow fixes only when a failing deterministic test proves a current defect.
- Exact verification results and remaining-risk documentation.

## Out of scope

- Production Supabase access or mutation.
- Database pushes, migration repair, storage/cron changes or production SQL.
- Changes to historical files in `supabase/migrations/`.
- Vercel production deployment or direct pushes to `main`.
- Broad deletion or consolidation of legacy/hotfix frontend layers.

The pull request remains draft until technical review and explicit approval.

# BrickCircle Trust & Care — release runbook

Status: **Draft PR #179, staging database applied, production untouched.** Merge and deploy only after separate owner approval.

## Trust model

Build with care. Share with honesty. A LEGO set need not be 100% complete. Owner declarations are not verified piece counts; three real owner photo angles support visual inspection but cannot prove that every internal piece is present.

## Implementation boundaries

- `collection_items.inventory_review_status`: `not_checked`, `checked`, `known_gaps`. Known gaps require text Notes; older rows default to not checked.
- Server database trigger requires front, side, rear **photo metadata** on new false-to-true availability updates. Existing available listings are **grandfathered**, not silently removed from matches. A new listing can be created with only the primary photo, but it cannot become available until all three are present.
- Photo removal while available and changes while a canonical item lock exists are blocked. Owners should discuss corrections in Messages, and before handoff may cancel and repropose if the agreed condition is materially different.
- Existing immutable agreement versions remain the binding record of accepted terms. On transition to ACTIVE after both independent physical handoffs, the server captures a new read-only baseline of owner descriptors and photo **storage paths**. It does not copy photo bytes or guarantee permanent Storage availability.
- The handoff baseline is available to the two participants through Messages. No administrator arbitration, deposit or monetary liability rule was introduced.

## Staging proof (2026-10-19)

Project: `brickcircle-exchange-staging-20260924` (`tteyypklldgwwicrgjzt`) — **not** the production project.

Applied migration ledger version: `20261019083950` (`trust_care_condition_safeguards`). Filename matches ledger to avoid accidental double-applying during a later database push.

Verified by read-only SQL: inventory column exists, handoff baseline table exists and has RLS, exactly one activation guard and one handoff capture trigger exist, participant-read policy exists, anonymous SELECT permission absent.

Executed `supabase/tests/trust_care_condition_safeguards.sql` logic as a temporary-table transaction: photo-incomplete availability rejected; known-gaps without Notes rejected. Transaction rolled back without touching collector rows. Security adviser review showed no Trust & Care-specific findings (pre-existing unrelated findings remain).

Code: 6 Node contract tests, 90 isolated Chromium tests after sync with main, `npm run typecheck`, `npm run release:check`, and JavaScript syntax all passed.

## Production release checklist

1. Review/approve PR #179 and the feature's limited trust claims; **do not** describe three photos as a verified complete parts inventory.
2. Confirm frontend and server migrations use the intended project connection. Take a database backup/checkpoint.
3. Apply database migration first, then deploy release `20261019-trust-care-r1` promptly to avoid the old client inviting a single-photo availability update that will be refused by the new server guard.
4. Run a protected multi-user hosted smoke with two consenting staging testers: owner photos and notes, photo guard bypass attempt, acceptance and meetup, two independent inspections and physical handoffs, immutable handoff snapshot, return, archive and partner visibility, third-party denial, cross-account isolation. Avoid real email/push deliveries using outbox-only test configuration.
5. Exercise mobile layouts at 320px and 390px on representative Android/iOS browsers and inspect the no-horizontal-overflow invariant.
6. Verify legacy already-available sets stay available, and owners can voluntarily add the missing angles.
7. Review photo retention/privacy before promising permanent original images. Metadata snapshots persist but originals may later be cleaned up; design a bounded evidence retention policy if required.
8. Review database security advisers and unrelated warnings separately. Do not claim the entire application is hack-proof.
9. Production rollback of browser assets can use the previous release; database migration is forward-repair only. Preserve accepted and handoff records; do not delete history as a rollback shortcut.

No production migration, merge to main, or deploy performed as part of this draft.

# BrickCircle Trust & Care — release runbook

Status: **Draft PR #179, staging database applied, production untouched.** Merge and deploy only after separate owner approval.

## Trust model

Build with care. Share with honesty. A LEGO set need not be 100% complete. Owner declarations are not verified piece counts; three real owner photo angles support visual inspection but cannot prove that every internal piece is present.

## Implementation boundaries

- `collection_items.inventory_review_status`: `not_checked`, `checked`, `known_gaps`. Known gaps require text Notes; older rows default to not checked.
- Server database triggers reject a directly inserted available listing and require front, side, rear **photo metadata** on new false-to-true availability updates. Existing available listings are **grandfathered**, not silently removed from matches. A new listing can be created with only the primary photo, but it cannot become available until all three are present.
- Removal or replacement of existing photographs while available, and changes while a canonical item lock exists, are blocked. Legacy sets missing an angle can still add that photo without disabling availability. Owners should discuss corrections in Messages, and before handoff may cancel and repropose if the agreed condition is materially different.
- Existing immutable agreement versions remain the binding record of accepted terms. On transition to ACTIVE after both independent physical handoffs, the server captures a new read-only baseline of owner descriptors and photo **storage paths**. It does not copy photo bytes or guarantee permanent Storage availability.
- The handoff baseline is available to the two participants through Messages. No administrator arbitration, deposit or monetary liability rule was introduced.
- A second staging migration, `20261019091952_protect_trust_care_photo_bytes.sql`, adds restrictive Storage DELETE/UPDATE policies for currently available/locked set photos and for files recorded in a confirmed handoff baseline during an active exchange and at least 90 days after completion. This blocks direct authenticated Storage removal that would bypass UI restrictions. It does not copy images or run automatic deletion; a service-role administrator can still exercise exceptional retention/privacy controls.
- A third staging migration, `20261019092759_allow_participants_handoff_evidence_photo_read.sql`, provides only the two accepted-case participants the ability to sign the original photo URLs within the protected review period, even if the owner's current listing changes. The record in Messages provides front, side and rear view links after securely signing them.

## Staging proof (2026-10-19)

Project: `brickcircle-exchange-staging-20260924` (`tteyypklldgwwicrgjzt`) — **not** the production project.

Applied migration ledger versions: `20261019083950` (`trust_care_condition_safeguards`), `20261019091952` (`protect_trust_care_photo_bytes`), `20261019092759` (`allow_participants_handoff_evidence_photo_read`) and `20261101054637` (`trust_care_availability_insert_and_photo_integrity`). Filenames match the staging ledger to prevent accidental re-application.

Verified by read-only SQL: inventory column exists, handoff baseline table exists and has RLS, exactly one activation guard and one handoff capture trigger exist, participant-read policy exists, anonymous SELECT permission absent.

Executed `supabase/tests/trust_care_condition_safeguards.sql` logic as a temporary-table transaction: photo-incomplete availability rejected; known-gaps without Notes rejected. Transaction rolled back without touching collector rows. Security adviser review showed no Trust & Care-specific findings (pre-existing unrelated findings remain).

Code: 6 Node contract tests, 90 isolated Chromium tests after sync with main, `npm run typecheck`, `npm run release:check`, and JavaScript syntax all passed.

## November 1, 2026 security hardening

- A fourth staging migration closes two direct-API bypasses: offering a copy through `INSERT` without side/rear photos, and replacing existing photo paths while a copy remains available. The owner must switch the set unavailable before replacing saved photographs. Missing angles on grandfathered available sets may still be **added**.
- Transactional staging SQL probes confirmed: direct available inserts rejected, missing-parts statements without Notes rejected, offered front/side path changes and deletion rejected. All probes rolled back; no collector data was changed.
- Ten focused Node contracts and 21 Chromium gallery, mobile, inventory and proposal tests passed. Firefox/WebKit and GitHub CI re-runs are separate release checks.
- Three photo **metadata paths** and human inspection are the beta trust controls; they do not prove that the files contain real LEGO builds or establish a certified piece inventory. The physical meetup remains the source of final mutual acceptance.

## November 1 — protected real-session smoke preparation

- The original protected `hosted-supabase-exchange-smoke.yml` workflow is locked to the earlier canonical-exchange branch. Do **not** loosen or bypass its guard.
- **Draft PR #185** (`dev/trust-care-staging-dispatcher-20261101`) proposes a new, manual-only staging dispatcher for **draft PR #179 exclusively**. It checks the exact 40-character approved head SHA, the expected branch, confirmation phrase, staging environment, restricted staging email sink, and outbox-only delivery. This is a **workflow-only PR**, and its merge requires separate owner approval.
- PR #179's hosted harness was upgraded to upload **three valid synthetic QA PNGs** to the staging private Storage bucket through each owner's authenticated session, persist side/rear gallery rows, prove incomplete-photo availability is rejected, and self-declare checked/known gaps. The synthetic fixtures test technical upload and evidence controls; they are **not photos of actual finished LEGO sets**.
- After two independent handoffs, the harness checks immutable accepted-case condition snapshots and front/side/rear photo references, both authenticated participants' read access, third-user baseline RLS denial, and photo retrieval. It rechecks identical baseline evidence after both return confirmations and completion.
- **89/89 hosted harness contract tests passed** with a separate three-test dispatcher authorization contract suite. The actual credentialed, hosted three-user workflow has **not** been run.
- When PR #185 is independently approved and merged to `main`, invoke its `workflow_dispatch` on the current `main` workflow, passing `pull_request_number=179`, the exact then-current PR #179 head SHA, and `RUN_ISOLATED_BRICKCIRCLE_STAGING_SMOKE`. The `hosted-supabase-staging` environment approval is a separate explicit authorization gate. Never use production credentials.
- Continue to require explicit approval for both PR merges and production deployment.

## Production release checklist

1. Review/approve PR #179 and the feature's limited trust claims; **do not** describe three photos as a verified complete parts inventory.
2. Confirm frontend and server migrations use the intended project connection. Take a database backup/checkpoint.
3. Apply all four database migrations in ledger order first, then deploy release `20261101-trust-care-r2` promptly to avoid the old client inviting a single-photo availability update that will be refused by the new server guard.
4. Run a protected multi-user hosted smoke with two consenting staging testers: owner photos and notes, photo guard bypass attempt, acceptance and meetup, two independent inspections and physical handoffs, immutable handoff snapshot, return, archive and partner visibility, third-party denial, cross-account isolation. Avoid real email/push deliveries using outbox-only test configuration.
5. Exercise mobile layouts at 320px and 390px on representative Android/iOS browsers and inspect the no-horizontal-overflow invariant.
6. Verify legacy already-available sets stay available, and owners can voluntarily add the missing angles.
7. Confirm the minimum 90-day post-completion photographic evidence protection against the privacy policy and consent disclosures before production release. Metadata snapshots persist but originals may be removed after the protected period. There is no automatic deletion job. Owners need a documented privacy-support route for exceptions.
8. Review database security advisers and unrelated warnings separately. Do not claim the entire application is hack-proof.
9. Production rollback of browser assets can use the previous release; database migration is forward-repair only. Preserve accepted and handoff records; do not delete history as a rollback shortcut.

No production migration, merge to main, or deploy performed as part of this draft.

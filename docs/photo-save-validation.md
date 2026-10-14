# Photo metadata commit safety

Development branch: `dev/photo-commit-safe-completion`; base main `f3e8de109d8741cf405ce8f67209055f36b345ae`. No database migrations, RLS changes, exchange transitions, deployments or production requests are part of this change.

## Behavior

Adding, attaching a legacy set photo, replacing a set photo and uploading an avatar require one returned metadata row matching the captured owner, target identity and new path. Replacements compare the previous path in the UPDATE predicate so a stale picker cannot overwrite a newer photo. The previous object is removed only after positive commit confirmation and a current owner/session check.

Storage and metadata are separate transactions. A transport failure, 5xx, ambiguous error or malformed representation can follow a committed write. These outcomes retain the uploaded candidate, retain the previous object and ask the collector to refresh before retrying; a read showing old metadata is not proof of rollback. Definitive SQLSTATE rejection (classes 22, 23, 42; 40001; 40P01) or a successful zero-row representation permits cleanup of the unused candidate only. A session change after positive commit never cleans up the newly saved object.

Avatar uploads capture account identity and the photo identity generation before awaiting. `getUser()` verifies it before uploading and before metadata persistence. A→B and A→B→A changes invalidate the operation; same-owner token refresh remains allowed. Updates always target the captured owner. Provider URLs are never submitted to Storage deletion. Failure messages contain no raw database or provider diagnostics.

## Executed locally

- Baseline actual replacement function, simulated successful zero-row metadata response: reproduced deletion of the old object and false `Set photo updated.` success.
- `node --test tests/static/photo-metadata-commit-runtime.test.mjs`: 23 passed, including ambiguous/lost commit retention, definitive rejection cleanup, pre/post-commit owner changes and actual delayed avatar uploads through A→B, A→B→A and same-owner refresh.
- `node --test tests/static/owner-photo-signed-url-runtime.test.mjs`: 6 passed.
- Collector avatar static contract, JavaScript syntax checks and TypeScript check passed.
- Release asset synchronization/check and `git diff --check` passed.

## Added verification requiring browser runner

The browser mock now distinguishes definitive policy rejection from service-unavailable errors and supports metadata writes that commit before the response is lost. Eight new browser cases cover zero-row and committed/lost responses for add, legacy attachment, replacement and avatar. Existing rejection cleanup tests now use explicit 42501, rather than incorrectly treating 503 as guaranteed rollback. The returning representation uses pre-update matched identities, as real UPDATE RETURNING does when the previous-path predicate changes.

Local browser binaries are unavailable. These browser cases and the existing camera, avatar and full exchange regressions must run in Codespace/CI before approval. Physical iOS/Android camera and lifecycle checks remain separate. No hosted or production behavior is claimed from these synthetic checks.

## Operational limitation

Ambiguous saves intentionally may leave an unreferenced candidate or a previous object behind. Reconciliation requires confirmed ownership and current metadata; this change does not introduce automatic orphan sweeping, which could delete an object from an in-flight commit. Development branch deployments are disabled in `vercel.json`.

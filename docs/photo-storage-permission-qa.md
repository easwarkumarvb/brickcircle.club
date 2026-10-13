# Canonical participant photo access repair and isolated QA

Canonical proposals reserve both physical copies and remove the pair from
reciprocal matching. The existing collection SELECT policies authorize owners,
legacy request/exchange participants and reciprocal matches, but omit newly
created canonical case participants. Storage reads inherit that collection RLS,
so counterpart photographs stop being readable after proposal or acceptance.

Initial PR143 commit `5d6e20f468acb51317143bf81e82f7aa085ca471` reproduced this
in isolated PostgreSQL 17.11 [run 38347684063](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38347684063).
Core permission tests passed. Actual canonical proposal/acceptance returned
PROPOSED/ACCEPTED with zero legacy requests/exchanges and zero reciprocal matches.
The matched photograph was readable before proposal and unreadable afterwards;
the unrelated outsider remained denied.

The CLI-generated migration `20261013044724_canonical_participant_collection_photo_access.sql` creates one authenticated SELECT policy on
`collection_items`: a collector may read the exact two physical items in a
canonical case involving them. Case RLS remains participant-only, including
archived history. Existing Storage read policy inherits this decision.
No Storage policy, grant, owner write, matcher, transition, lock, state-machine,
provider or application code is changed. The migration is transactional and
safe to reapply. Production deployment/application requires separate approval.

## Regression evidence

The workflow uses a disposable PostgreSQL 17.11 GitHub Actions service, synthetic
`example.test` collectors and no secrets, hosted endpoints or provider sends.
Automatic deployment is disabled for this branch. The base loads actual
repository migrations in chronological order: collection privacy (August29),
pre-photo alias matching (September6), owner photos (September8) and canonical
cases/current matcher (September16). Authorization predicates are never copied
into test-only policies. The repair is excluded from this baseline.

1. Run the owner/match/legacy-participant core permission test.
2. Strictly reproduce the original gap with `expect_missing=true`. This requires
   matched access before proposal, denied counterpart reads for both collectors
   in PROPOSED/ACCEPTED, denied archive access after cancellation with wishlists
   removed, correct actual states, no legacy records and all privacy checks.
   Unexpected success or a different failure stops CI; errors are not ignored.
3. Apply the repair twice to check idempotency.
4. Rerun unchanged owner/path/bucket write and privacy assertions.
5. Require counterpart reads for both participants in PROPOSED/ACCEPTED and
   archived cancellation history after reciprocal matching is removed. Require
   denial of unrelated hidden photos, counterpart update/delete, outsider
   case/object reads and anonymous object reads.

Before/after reports contain only fixed labels, booleans, states and counts.
No identity, credentials or message text is retained. Each test rolls back its
synthetic records. Run the same files only in a fresh disposable database:

```sh
psql "$DSN" -v ON_ERROR_STOP=1 -f qa/photo-storage/base.sql
psql "$DSN" -v ON_ERROR_STOP=1 -f qa/photo-storage/permissions.sql
psql "$DSN" -v ON_ERROR_STOP=1 -v expect_missing=true -f qa/photo-storage/canonical-participant.sql
# Apply the repair migration, then rerun both test files without expect_missing.
```

Minimal Storage tables, `foldername`, grants and `auth.uid` simulate the SQL
layer. This does not certify Storage HTTP signed URLs, upload MIME/byte checks
or deployed migration state. Physical camera permission and iOS/Android keyboard
checks remain separate tasks. Local PostgreSQL binaries and Docker were absent;
new repair acceptance requires the fresh CI run, not static review alone.

## Signed photo URL lifetime regression

An actual-helper VM reproduction found that a 900-second Storage signed URL
was returned unchanged after 901 seconds, with only one signing request. The
browser cache now stores `{url, expiresAt}` and refreshes after 840 seconds,
anchored before the signing request to allow a 60-second safety margin. A
response that arrives beyond that safe lifetime is discarded. Existing auth
epoch and logout guards still prevent late responses from returning or caching
retired-account URLs; failed or empty signing responses do not poison the cache.
Concurrent signing semantics remain unchanged.

`node --test tests/static/owner-photo-signed-url-runtime.test.mjs` runs six
regressions against the extracted application helper. The isolated permission
workflow also runs these contracts whenever application/helper test files
change. No hosted Storage request is needed for this validation; deployed URL
availability still depends on the separately approved Storage policy repair.

Local follow-up evidence: six helper contracts and 38 Chromium camera/photo
replacement browser tests passed without retries. Typecheck, app syntax, release
synchronization, both static security contracts, 55 admin API contracts and
diff whitespace checks passed. SQL policy files are unchanged by this follow-up.

# Bind collection photo reads to the actual owner

An authenticated collector could insert or update their own collection row with
another owner's known photo path. The original Storage SELECT policy accepted
any visible collection row with that path, so the forged reference exposed the
object even though the real owner's collection row remained inaccessible.

Strict isolated PostgreSQL 17.11 reproduction passed at commit
`5df1d0458df794360c07f4d56827c2f84720449b`,
[run 38365939295](https://github.com/easwarkumarvb/brickcircle.club/actions/runs/38365939295).
Both insert and update references exposed the object; initial object denial,
victim row denial, reference removal and anonymous denial were independently
required. Tests use actual collection/Storage policies, current column grants,
synthetic fixtures and rollback. This is SQL authorization evidence, not a
claim that a live hosted signed URL was retrieved.

Migration `20261013080000_bind_collection_photo_reads_to_owner.sql` replaces
one Storage SELECT policy. A matching visible collection row now must belong
to the owner UUID in the Storage object's first folder. Existing owner-only
upload/update/delete policies and canonical server-owned transitions, locks,
RPCs and collection visibility stay unchanged. It adds no grants or definer
helper. Incorrect legacy references no longer authorize a foreign photograph;
valid owner-folder paths keep their existing owner, match, legacy participant
and canonical participant read behavior.

CI first requires the original exposure, applies the repair twice, reruns all
core and canonical proposal/acceptance/archive permission tests, then requires
both forged insert and update references to remain denied. The branch disables
automatic deployment. No hosted or production migration is run by these tests.

Hosted verification requires the merged canonical participant migration and
this owner-binding migration on the dedicated staging project before its
functional permission checks can pass. A signed URL is a bearer capability:
this repair blocks unauthorized creation of new URLs; it does not revoke
previously issued URLs, which expire according to their existing lifetime.
Production application and deployment require separate owner approval.

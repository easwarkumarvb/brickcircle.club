# Disposable photo Storage permission QA

This separate QA branch adds no product policy or schema migration. Its workflow
runs PostgreSQL 17.11 in an isolated GitHub Actions service, with disposable
credentials and synthetic `example.test` identities. It does not use Supabase
connectors, hosted endpoints, notification providers or production secrets.
Automatic deployment is disabled for this branch before publication.

The fixture reuses the canonical domain base and loads the actual repository
migrations for canonical exchange cases, collection RLS hardening and private
owner-photo Storage policies. No collection or object authorization predicate
is copied into a test-only policy. Minimal Storage tables, `foldername`, grants
and `auth.uid` simulate the SQL layer; these do not certify Storage HTTP signed
URLs, upload MIME/byte validation or a deployed project's exact migration state.

Run in a fresh disposable PostgreSQL database, never a hosted DSN:

```sh
psql "$DSN" -v ON_ERROR_STOP=1 -f qa/photo-storage/base.sql
psql "$DSN" -v ON_ERROR_STOP=1 -f qa/photo-storage/permissions.sql
psql "$DSN" -v ON_ERROR_STOP=1 -f qa/photo-storage/canonical-participant.sql
```

The core test exercises private bucket configuration, owner folder inserts,
linked-owner update/delete, rejection of foreign folders, root paths and other
buckets, reciprocal-match and legacy request participant reads, denial of hidden
foreign items, matched/participant write denial, unmatched outsider reads and
anonymous reads/inserts. Anonymous object privileges deliberately remain present
so anonymous reads exercise policy denial rather than missing table privileges.
No test assumes every foreign photograph is secret: reciprocal matches are an
intended read audience.

The separate canonical acceptance test invokes the actual `create_exchange_case`
and `exchange_case_transition` functions under authenticated collector roles.
It records counterpart-photo visibility before proposal, in PROPOSED and ACCEPTED,
match count, legacy row counts and outsider denial. Its positive participant
read contract must fail if canonical item locks remove matcher access without
an alternative participant read policy. A failing result requires architecture
review; it must not be concealed by weakening tests or altering policies here.

Local PostgreSQL binaries and Docker were unavailable when this proposal was
prepared. Static source review identified a potential canonical participant
read gap, but execution evidence is required before classifying it as confirmed.
Physical camera permission, iOS/Android keyboard and signed URL behaviour remain
separate validation tasks. Existing beta source regressions continue unchanged.

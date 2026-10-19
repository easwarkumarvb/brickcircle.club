# Admin business-conflict PT409 rollout

**Source change only; no staging or production operation is authorized by this
runbook.** Supabase documents that PostgREST 14 retries RPC failures using
SQLSTATE `40001`, even when raised deliberately for a business conflict, and
recommends `PT409` for an HTTP 409 response:
[PostgREST 14 custom error-code retries](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

## Reviewed scope and source difference

The new migration resolves only `public.admin_support_note(uuid,text,uuid)` and
`public.admin_marketplace_mutate(text,text,text,integer,text,uuid)` through
`pg_get_functiondef`, checks exact old/new statement occurrence counts, and
replaces the three intentional business-conflict raises with `PT409`. It fails
closed on missing/duplicate/unexpected statements. It does not rewrite historical
migrations, change ACLs, or add helpers/grants. The handler maps `PT409` to the
existing safe HTTP 409 conflict envelope and retains `40001` compatibility.

The currently deployed staging `admin-dashboard` v2 predates repository changes
to bounded request parsing and growth reporting. Deploying the current reviewed
handler therefore includes those broader source differences; this is not a
conflict-only Edge update. Its exact local source/import set is:

- `supabase/functions/admin-dashboard/index.ts` (entrypoint; imports `./handler.mjs`, and pins `@supabase/supabase-js@2.57.4`).
- `supabase/functions/admin-dashboard/handler.mjs` (current request, auth, RPC and response handler; imports `../_shared/bounded-json.mjs`).
- `supabase/functions/_shared/bounded-json.mjs` (bounded JSON parser and `RequestBodyError`).

Review that full source set together before any Edge deployment.

## Guarded staging update and verification

1. Obtain explicit staging-owner approval for the exact migration and function
   source. Confirm the target is the designated staging project and no disposable
   admin sessions or note requests are active. The reported smoke sessions are
   signed out; the single retained audit note remains and must not be deleted as
   part of this rollout.
2. Before applying SQL, inspect live definitions and metadata for only the two
   exact signatures. Verify one old conflict statement in the note function, and
   the two targeted statements in the mutate function (request-ID replay conflict
   and stale revision). Stop if definitions/counts differ. Apply the new migration
   through the approved staging migration path only.
3. Verify the post-migration definitions retain the original owner, ACLs,
   `SECURITY DEFINER`, `search_path`, language, arguments, advisory locking,
   authentication/AAL checks, replay behavior and revision checks. Confirm only
   those three raises now use `PT409`, with unchanged messages, and no
   `40001`-retrying conflict raise remains in either function. The migration uses
   `pg_get_functiondef` plus `CREATE OR REPLACE`, preserving the function
   definition attributes; replacement does not change function owner or grants.
4. After database verification, deploy only the reviewed `admin-dashboard`
   function source set above to staging, using the approved project target. Verify
   it returns the safe HTTP 409 conflict envelope for `PT409`, still maps legacy
   `40001` to that same envelope, and retains authorization, validation,
   bounded-body, and no-store behavior.
5. Only after both staging changes are independently approved, rerun the
   protected real-MFA smoke against an approved owned disposable fixture on the
   exact reviewed SHA. Preserve the expected first-write/replay/conflict
   assertions, unchanged case/revision/event invariants, and session cleanup.
   Confirm no retry storm in Edge/database logs. Obtain separate approval for any
   further retained-note handling. Do not use production fixtures or credentials.

## Offline validation boundary

The Node migration regression checks the exact reviewed migration scope and
source-level occurrence guards; handler and mocked smoke tests exercise status
mapping and safe diagnostics. Offline checks do not execute PL/pgSQL against
PostgreSQL, emulate PostgREST's SQLSTATE behavior, or prove live function
formatting, owner/ACL preservation, or Edge deployment behavior. Those require
the guarded staging inspection and verification above; no hosted check is
performed by this change.

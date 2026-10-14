# Profile and direct-message write authority

The read-only production privilege review confirmed authenticated table-wide
INSERT and UPDATE on profiles. Ownership RLS protects other members' rows but
does not stop a member assigning their own verification and reputation fields.
The repaired source clears table and existing column INSERT/UPDATE grants,
then grants only the columns used by onboarding, the profile editor and upload
metadata persistence: id, display_name, country, city, bio, avatar_url,
avatar_source and updated_at. id UPDATE supports PostgREST upserts; the existing
ownership USING/WITH CHECK policies prohibit assigning another identity.

The browser metadata trigger stamps updated_at and prevents direct provider
provenance assignment. Existing provider avatars survive biography edits;
authenticated uploads use the member's folder. SECURITY DEFINER provider/Auth,
adult confirmation and review functions retain their trusted authority, as do
service-role writes. No reputation, verification, membership, adult-attestation,
email, created_at or member_since column is browser-writable.

Unused collector message UPDATE/DELETE and column UPDATE grants are revoked. RLS already denied these operations; current clients use separate read cursors. Direct messages retain INSERT because send_collector_message is SECURITY
INVOKER. The existing table trigger now stamps created_at, trims body and
enforces 1–4000 trimmed characters while retaining sender and legacy exchange
participant/recipient checks. A NOT VALID body constraint preserves historic
rows while constraining all new or changed rows. The source migration does not
rewrite historical future timestamps, oversized messages or forged profile
values: any historical investigation/cleanup requires a separate reviewed plan.

## Disposable proof

The profile-message-authority workflow uses PostgreSQL 17 and synthetic
identities only. It applies actual membership/projection, adult/provider,
canonical/messaging and conversation migrations to the existing canonical QA
base. Before repair, a real authenticated role forges its public verification
projection and uses a future message to suppress later unread counts. That
transaction rolls back. After applying the forward repair twice, real-role
tests deny INSERT and UPDATE of every protected field, including a separately
granted future-column probe. They check ordinary edits and onboarding upserts,
ownership transfer denial, provider/upload precedence, adult confirmation,
trusted service projection, message normalization/body caps/idempotency and
later unread counts. The existing peer-trust suite checks canonical handoff,
return, custody and review behavior.

These PostgreSQL proofs have not been executed in the authoring environment:
it has no local PostgreSQL client/server or Docker. CI execution is required
before approving the migration. No remote SQL, production changes, merge,
deployment, commit or push occurred.

The migration filename was prepared offline because the authorized task
explicitly excludes retrying the Supabase CLI telemetry failure. This is an
offline source exception to normal CLI-generated migration creation.

The superseded submit_exchange_case_review RPC was left intact: existing
canonical regression fixtures still invoke it. It can publish a separate legacy
review, but cannot reveal stored double-blind structured peer reviews. Retiring
that writer requires coordinating fixture/API compatibility separately.

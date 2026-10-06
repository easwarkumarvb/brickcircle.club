# Marketplace administration

The console at `/admin.html` provides overview metrics, paginated member search, catalogue discovery visibility, canonical exchange timelines, support triage and a private audit log. It shares the collector site's signed-in session and visual language, with mobile record cards and accessible confirmation dialogs.

## Authorization

Every Edge request validates the user with Supabase Auth and checks `is_exchange_admin()`. Every read and write RPC independently checks the private administrator allowlist, an active `auth.sessions` record and the trusted JWT `aal2` claim. Ordinary members cannot gain access using email addresses, frontend controls or editable profile metadata. No service-role key is used by this module. Supabase TOTP verification is mandatory; an approved admin without a factor sees setup before any private marketplace data loads.

The Edge Function uses custom JWT authentication (`verify_jwt=false`) to support the project's signing keys: this does **not** allow anonymous requests. Its handler rejects missing/invalid tokens before any marketplace query. Explicit same-site CORS origins, private/no-store responses, the existing admin CSP and frame protections remain in place. Additional preview origins must be explicitly configured in `ADMIN_ALLOWED_ORIGINS`; do not use wildcards.

Private revision and audit tables have RLS enabled and no client policies or grants. The SECURITY DEFINER RPCs are intentionally callable by authenticated users but enforce the trusted admin, session and MFA gates themselves. Fixed empty search paths and schema-qualified relations prevent search-path substitution. Security advisors flag these intentional RPC grants and deny-all RLS tables; they are covered by the authorization tests.

## Management actions

- Catalogue visibility changes affect new Find Sets queries (`catalog_active`); existing collections and exchanges are retained. A private hide override and database trigger preserve admin-hidden sets across daily Rebrickable imports. Unhiding clears the override; source lifecycle flags continue to apply normally. Already loaded or cached discovery views may refresh later. This is discovery management, not an emergency removal of historical records.
- Support requests have a separate internal triage status: open, in progress, resolved. The required reason doubles as an internal support note in the audit history. These changes do not close the underlying collector request, resolve a peer-reported issue or change an exchange state.
- Each write locks the target row, checks the expected revision and writes an audit entry in the same transaction. UUID request IDs make uncertain-delivery retries idempotent. Reusing a request ID for different content and stale revisions return a conflict.
- Member and exchange information is read-only. The console has no forced custody transitions, member deletion, identity verification overrides, arbitrary SQL or broad private-message access.

Record lists are server-paginated at 25 rows with exact totals. Member collection/wishlist and exchange timeline details show a clearly labeled maximum of 100 recent entries. User-supplied content is HTML-escaped; there are no inline event handlers. Logout, revoked access and stale-page restoration clear private data. Authenticator setup keys are removed from the DOM after verification or cancellation and never written to browser storage.

## Deploy order

1. Apply `20261005143140_marketplace_admin_console.sql` to the target project.
2. Deploy `admin-dashboard` with `index.ts` and `handler.mjs`, custom JWT verification (`--no-verify-jwt`). Keep the existing trusted admin allowlist; never grant admin by profile email or metadata.
3. Publish `admin.html`, `admin-dashboard.js` and `admin-console.css` together. The frontend and Edge contract changed; use a coordinated release to avoid the previous dashboard briefly receiving the new response format.
4. Open the console as the approved admin, enroll or verify an authenticator, and confirm all sections load. Check a reversible catalogue visibility edit and its audit entry, then restore it. Verify a normal collector receives no private data.

PR #120 records the original production rollout on 6 October 2026 (migration installed, Edge version 7 and frontend published). A read-only public GET of `/admin.html` independently confirmed the marketplace control-room frontend on that date. This is historical rollout evidence, not a fresh audit of production database, Edge or authenticated administrator state. The robustness changes on PR #124 are **not deployed** and still require the coordinated release above. Authenticator recovery follows the existing Supabase account recovery process; this console does not offer a bypass or factor deletion.

## Validation

### Reliability contract

Admin operations have a 15-second deadline from entry, including SDK verification,
delivery and JSON parsing. Generation/account guards ignore abandoned results.
An explicit denial, sign-out, account switch or MFA downgrade clears private content.
Transient verification/service failures retain only an already authorized same-view
snapshot, labeled stale with its last update. New writes stay locked until a fresh
server-authorized list read; a retained uncertain write can only be retried explicitly
using its original payload and request ID. Closing its dialog is not a rollback.
Pending envelopes exist only in memory and are erased with the session.

Supabase sources checked on 6 October 2026: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
and [automatic PostgREST retries](https://supabase.com/changelog/45071-automatic-postgrest-retries-for-transient-errors).
The pinned SDK is not upgraded; admin writes remain POST requests with no automatic replay.

`npm run test:security-contracts` includes the canonical authorization contract and injected Edge handler tests. `tests/isolated/admin-console.spec.ts` exercises mobile/desktop layouts, accessibility, denial, search/pagination, escaped content, support timelines, idempotent retry, logout clearing and both authenticator paths across Chromium, Firefox and WebKit.

Run `supabase/tests/admin_marketplace_console.sql` only in disposable staging with two profiles, a catalogue set and a canonical exchange fixture. It checks database authorization, AAL1 denial, exact counts and pagination, both mutation types, audit replay/conflicts, expired/revoked sessions and revoked admin access. All fixture grants, sessions, mutations and audit rows roll back. No production account, factor or marketplace record is changed by that suite.

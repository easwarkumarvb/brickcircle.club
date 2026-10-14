# BrickCircle security audit — 14 October 2026

Scope: merged PR149 source, authorization/migrations, browser privacy and rendering, admin Edge API, notification workers, storage policy catalogue, deployment headers and CI. Live inspection was read-only. No production exploit traffic, account modifications, provider activation, migration, merge or deployment occurred. Source fixes remain proposals on a development branch. Security is an ongoing process; this is not a guarantee against every attack.

## Findings and repairs

| Finding | Evidence and repair | Validation |
| --- | --- | --- |
| High: self-owned profiles permitted client writes to public trust fields | Whole-table INSERT/UPDATE bypassed trusted ownership of identity verification, rating and review counts. Replaced with explicit browser column privileges and trusted server authority; future column-grant regression probe included. | Real-role PostgreSQL reproduces original forgery, then denies protected INSERT/UPDATE while allowing onboarding/upsert, adult confirmation and trusted projection. |
| Medium: direct messages accepted client timestamps and oversized bodies | Future timestamps interfered with unread cursors. Server stamps authenticated inserts and enforces trimmed 1–4000-character content. Unused UPDATE/DELETE and column grants revoked. | Real-role before/after proof, unread-cursor checks and canonical peer lifecycle regression. |
| High, conditional: push worker accepted arbitrary destination URLs | User-owned subscriptions could reach the privileged sender. Explicit canonical HTTPS provider validation now runs before delivery claims and sends; provider socket timeout set. Existing dispatch cap retained. | Runtime provider boundaries and actual injected dispatch test prove rejected destinations cause no claim or send. No external exploitation attempted. A NOT VALID database constraint restricts new/updated subscriptions; historical rows remain protected by the sender guard. |
| Medium: encoded credential callback keys bypassed analytics exclusion | URLSearchParams decoded keys while the old raw-string guard missed them. Query and fragment keys are now decoded and checked before loading or tracking. | Runtime tests cover encoded/case-varied keys, initial loader suppression and later navigation. Browser suite adds matching cases. |
| Medium: avatar writes crossed owner folders through permissive policy OR | Restrictive write-only guards bind the UUID namespace and owner ID across every legacy alias, without restricting public reads. | Synthetic before/after real-role fixtures and replay-safe CI; CI passed (run 38560138581). |
| Defense: analytics parameters could accept arbitrary caller fields | Tracker now admits only bounded aggregate counts, known product sections and fixed collection kinds. Current app metadata-to-GA transmission was not established: the app's optional bcProductAnalytics bridge is absent. | Runtime tests prove IDs, email, names, free text, credential parameters and caller page URLs are discarded. |
| Defense: JSON byte checks followed an unbounded read | Shared streaming UTF-8 parser caps actual bytes, cancels excess input, checks media type and returns fixed client errors. Admin and notification workers use it. | Chunked/false-length/split-UTF-8/boundary tests and existing admin API authorization tests. |
| Defense: mutable workflow action references and self-writing analytics installer | Actions pinned to verified upstream commit IDs. Analytics workflow now has read-only permissions and privacy tests, with no automatic code commits. | Source review; CI validates final branch. |
| Defense: missing site-wide response headers | Added CSP, frame restrictions, nosniff, referrer and Permissions-Policy headers; deployment remains disabled. | Source configuration review and browser compatibility checks required before rollout. Existing inline handlers still require unsafe-inline; strict CSP is not claimed. |

## Existing controls preserved

Canonical server-owned exchange transitions, authenticated participant gates, mutual inspection/handoff/return confirmations, private peer-review visibility, adult attestation and administrator allowlist/live-session/AAL2 verification remain authoritative. No browser service key is introduced. Public avatar reads remain intentional; collection photographs stay private and scoped to authorized owners/participants.

## Production and operational gates

Read-only live checks found collection-photo owner binding absent from deployed policy, although the repair is already in merged source. Apply the reviewed source migration only through a separately approved production rollout. Supabase leaked-password protection is disabled; enabling it may depend on plan capability and also requires a configuration decision. Intentional authenticated SECURITY DEFINER RPCs and deny-all RLS tables must not be blindly modified to silence advisors.

Historical forged profile values, future-dated messages and inconsistent legacy storage rows are not rewritten by these forward protections. Review and repair historical data separately with explicit criteria, backups and approval. No full-history secret scan, third-party penetration test, external push delivery, production email delivery or physical exchange inspection is certified by this audit.

Browser GA Enhanced Measurement history settings also require an operator check: source sanitizes manual page views but cannot certify vendor-side stream configuration. Production dependency audit is a dedicated CI job; report its actual outcome rather than assuming pinned versions are vulnerability-free.

## Evidence

Initial authority repair CI passed on commit 24dbcf9a2e52a145d620de71be40f5a10a9c2d8c (run 38539083586). Local follow-up: 18 runtime tests, 4 actual push-dispatch tests, syntax and synchronized release checks passed. Local browser execution was blocked by absent Playwright browser binaries; full browser checks must run in Codespace/CI. Revalidate all source proofs at the final branch head before any rollout.


Follow-up evidence: avatar namespace before/after proof passed in CI, including public read and other-bucket regressions. Production-dependency audit passed (job 115836767759). A missing TypeScript declaration in the first push change was corrected and local typecheck passed. Earlier WebKit accepted-case cancellation timed out once; the complete subsequent three-engine conversation run 38560642528 passed without test retries. Do not describe the earlier failure as an identified product fix. Final-head checks supersede this intermediate evidence.

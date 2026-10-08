# Registration verification audit (2026-10-08)

## Scope and safety

- Worktree/branch: `codex/registration-verification`. No `AGENTS.md` found under `/workspaces`.
- Production: `nsxtromjdpdscknadxez`; staging: `tteyypklldgwwicrgjzt`.
- No Supabase CLI or environment access token was available. Hosted management configuration, OTP length/expiry and templates were **not independently inspected**. Eight-digit numeric production OTPs (including possible leading zeros) are the user-provided observation.
- `support@brickcircle.club` is reported present but unverified. Its account, credentials and code were not accessed; no confirmation or privileges were granted.
- No hosted mutations, real email sends, account creation/reset, backend/template/config changes, deletions, merge or deployment. Browser tests replace Supabase and abort non-loopback traffic. Dependencies reuse the existing pinned installation, with no npm upgrades or lockfile changes.

## Findings and architecture

`index.html` and `v2.html` use the same canonical `app-v3.js` client and pinned Supabase JS 2.57.4. Historical auth scripts are not loaded by these entrypoints. Signup already records the required adult attestation, but previously closed the modal after a no-session response. There was no OTP verification/resend or pending-account return path. Unconfirmed password login only displayed an error. Onboarding requires a session and separately records adult status; it is not replaced by email confirmation. Backend authorization and MFA remain unchanged.

Signup without a session now renders verification for the submitted email **inside the same premium modal**. The password form is removed. A labeled text field retains leading zeros; whitespace alone is normalized and 6–10 ASCII digits are accepted. `verifyOtp({email, token, type:'email'})` must return a session, then independent `getUser()` must confirm the same user ID, submitted email and `email_confirmed_at` before interactive session acceptance/onboarding. SDK auth events alone are insufficient. Resume/core refresh is suppressed during verification.

Verification and resend remain tracked until actual SDK settlement, including the server-user read, despite a ten-second UI deadline. Closing/changing modes or initiating another account/provider while a request is pending enters the existing local-logout drain; new login is unavailable until the SDK settles and local logout succeeds. A drain exceeding its deadline remains locked until explicit retry. Retired account events cannot resurrect A after B. UI generations and connected-form checks prevent stale modal replacement.

The code-return control retains a minimum 44px touch target. At 320px, compact form spacing and concise header copy preserve clean single-overlay scrolling with no horizontal overflow; focus/live error descriptions remain accessible.

Resend is explicit `auth.resend({type:'signup',email,options:{emailRedirectTo:origin+'/v2.html'}})`, not passwordless account creation. Cooldown is at least 60 seconds after signup and each resend attempt, honoring a longer exposed retry-after seconds/date value. No automatic resend occurs. Safe inline errors preserve email and allow retry. One-hour sessionStorage retains only pending email, expiry and resend deadline; malformed/expired records are discarded. Logout, change/back and success clear it. Passwords/codes/tokens are never added to this storage, URL, logs or analytics.

The always-visible **I have a verification code** path asks only for the pending email and works after reload without a password. Unconfirmed password sign-in enters this same workflow. Google `prompt:'select_account'`, adult signup attestation, owner-scoped onboarding and local-only account switch remain intact.

## Callback handling (separate from numeric OTP entry)

- `auth-confirm.html` is now a compatibility handoff, not a third auth runtime. It contains no Supabase client/key/CDN, profile write, analytics or retained-session success claim. Its destination is fixed to same-origin `/v2.html`; only known code/token-hash/error parameters and SDK session/recovery fragment fields are forwarded. Caller-supplied redirects/email are discarded. It uses `location.replace` and no-referrer metadata.
- Canonical OAuth/PKCE and implicit session fragments continue through the pinned SDK. Callback intent is captured before constructor initialization consumes the URL. Public `auth.initialize()` reuses the existing initialize promise and exposes its error (unlike `getSession()` alone). PKCE admission additionally requires the pinned SDK's successful code-removal URL transition and a server-confirmed resulting session; unsupported callbacks retaining an old session fail closed. No arbitrary redirect is honored. Google callback and existing recovery regressions remain in the targeted suite.
- Canonical `token_hash` accepts only `email` or `recovery`, clears the credential query, verifies through the tracked SDK operation and independently checks the server-confirmed session. Recovery takes precedence over onboarding. Invalid/expired callbacks drain local auth first, then display a fixed safe error with the code-return/resend path; raw provider error descriptions are not echoed.
- A bare `#verify` handoff drains any retained old account before requesting the pending email. It cannot equate that old session with signup verification.

## Analytics finding and focused fix

Initial GA configuration previously inherited the raw URL; product analytics also emitted raw `location.href` and arbitrary hash-derived sections. Both scripts now refuse to initialize on credential-bearing callback documents (code/token/token-hash/access/refresh/provider tokens or error descriptions). Otherwise initial config and explicit page views use canonical origin plus known section, with no query, arbitrary fragment, raw document title or raw referrer; virtual views/source/section are similarly sanitized. App-generated events receive sanitized page context.

Supported `send_page_view:false` disables the initial automatic GA config view. Official Google documentation states it **does not disable Enhanced Measurement history views**; there is no reliance on an unsupported `enhanced_measurement:false` field. No GA settings were inspected/changed. The parent reviewer should confirm history-based automatic pageviews are disabled in the GA stream settings. The frontend security boundary for callback credentials is the complete absence of a vendor tag on those documents, not a speculative config field.

## Documentation verified

- https://supabase.com/changelog.md (fetched; latest scoped-token GA entry 2026-10-06; no OTP API change requiring a dependency upgrade)
- https://supabase.com/docs/reference/javascript/auth-verifyotp (`type:'email'` signup OTP example)
- https://supabase.com/docs/reference/javascript/auth-resend (`type:'signup'` existing confirmation resend)
- https://supabase.com/docs/guides/auth/rate-limits (429 behavior and default 60-second per-user send window)
- Installed pinned auth-js `GoTrueClient.verifyOtp` saves the SDK session and emits auth events **before** resolving, motivating the drain and independent server check; installed types accept `email` and `signup` as used here.
- https://developers.google.com/analytics/devguides/collection/ga4/views (manual/sanitized views and separate Enhanced Measurement setting)

## Regression evidence

The draft PR records the exact tested commit and final run results. Targeted suites cover mobile 320/390 and desktop, focus/axe, signup attestation, valid/invalid/expired/duplicate OTP, whitespace-only paste, unconfirmed/wrong-email session rejection, explicit resend/cooldown/retry-after/reload, safe pending storage and change/back, unconfirmed password login, A/B late writes/logout deadlines and stale events, independent server-check ordering, fixed legacy callbacks, token-hash email/recovery ordering, analytics dataLayer privacy, existing Google/OAuth/recovery/account-switch regressions.

Release `20261008-registration-verification-r1` is generated through the existing release-sync mechanism; identical canonical HTML, service-worker synchronization and pinned SDK/dependency versions are preserved. The bump prepares a parent-reviewed rollout; no merge or deploy is part of this PR.

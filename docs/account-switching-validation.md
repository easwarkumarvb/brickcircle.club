# Account switching (review candidate, not deployed)

Base: PR124 merge `f3275fa761e049098f279c0cb9c01552739d4478`.

## Behavior and race boundary

- Profile's existing Account card and an accessible compact Account menu expose
  **Sign out** and **Use another account**, including mobile. Plain logout goes home;
  switching opens the existing premium email form blank and focuses Email.
- Marketplace and admin share `local-account-logout.js`. Only an SDK result with
  `error: null` confirms local logout. No global fallback. Returned, thrown, missing,
  and timeout outcomes stay locked, with honest status and explicit retry/reload.
- A 10-second deadline does **not** cancel the SDK operation. No duplicate logout
  or retry can run while it remains pending. Late completion does not automatically
  unlock login; a fresh explicit local retry must confirm success.
- Explicit logout invalidates auth workers and existing refresh/render generations
  immediately. It bypasses visibility/focus SIGNED_OUT recovery, blocks new resume
  reads, and suppresses delayed recovery and SIGNED_IN/TOKEN_REFRESHED work. The old
  account is excluded from unsolicited events until an intentional password login
  returns its successful session. Returning to the original email remains possible.
- Private state, caches, notification/thread subscriptions and session hints are
  cleared after marketplace logout confirmation. Ancillary push cleanup is best
  effort, bounded/non-blocking, device-scoped and guarded against a new login.
- Admin purges immediately and locks authorization/read work while logging out.
  Only confirmed logout navigates to the fixed same-origin `/#signin` handoff.
  Boot consumes it as home plus direct email auth; retained profile routing cannot
  swallow it. A retained signed-in session must first confirm local logout again.
  No redirect target, credentials or account email are carried in that URL.
- Password/signup/recovery, OAuth redirects, existing Google `select_account`
  behavior, MFA and backend authorization policy are unchanged. No backend fixtures,
  account creation/reset, access grants, real login or outbound emails are used.

## SDK verification

Checked installed/pinned supabase-js **2.57.4**, auth-js **2.71.1**, current
[signOut reference](https://supabase.com/docs/reference/javascript/auth-signout),
[Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google), and
[auth-js v2.71.1 changelog](https://github.com/supabase/auth-js/blob/v2.71.1/CHANGELOG.md).
`GoTrueClient._signOut` defaults to global, returns other server errors before
removing the session, ignores auth API 401/403/404 as already-invalid sessions, and
removes local storage/emits SIGNED_OUT before returning `error: null` for local scope.
The app follows that SDK contract rather than inventing a global retry.
Changelog entries include 2.65.1 moving SIGNED_OUT to session removal, 2.64.3 avoiding
premature removal, and 2.64.2 ignoring signout 403s. No SDK upgrade is part of this PR.

## Validation

Injected loopback-only browser cases live in `tests/isolated/account-switching.spec.ts`:
320/390/1280px controls, A → local logout → blank modal → B, original-email relogin,
plain logout, returned/thrown failures, slow timeout/duplicates/late completion,
scheduled resume recovery, already-awaiting auth work, stale profile reads, and
admin-denied switch/failure. Existing auth, Realtime, admin and MFA suites are also
included in the final stable-tree run. Static contracts and helper unit regressions
cover local-only SDK semantics, malformed results, timeout handling and release pins.

Final commands/results are recorded below after the stable-tree run.

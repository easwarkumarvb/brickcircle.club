# Collector Avatar Pipeline

## Root cause

Match cards already render `S.profiles[match.match_user].avatar_url` through the shared `avatar()` renderer. `refreshCore` hydrates matched collectors from `public.public_profiles`, a sanitized projection of `profiles.avatar_url`. Production had 3 profiles and all 3 `profiles.avatar_url` values were NULL, so match cards correctly fell back to initials. Two of the three Auth users already had Google-hosted avatar metadata that was never copied into `profiles`. One object also existed in the public `avatars` bucket without a profile reference, showing the previous upload flow could leave orphaned files.

The main app at `/v2.html` does not receive a CSP header. The CSP configured in `vercel.json` is scoped to `/admin.html` and is intentionally unchanged by this fix.

## Design

1. **Canonical value:** `profiles.avatar_url` remains the single collector-photo value. The existing projection trigger copies it to `public_profiles.avatar_url`; matched users are still hydrated only from the sanitized public projection.
2. **Explicit provenance:** nullable `profiles.avatar_source` records `provider` or `upload`. It is private and is not added to `public_profiles`.
3. **New users:** `handle_new_user` initializes a valid HTTPS provider `avatar_url`/`picture` and marks it `provider`.
4. **Existing users:** recognizable legacy BrickCircle storage paths are first marked `upload`. A one-time provider backfill then fills only blank profile avatars from valid HTTPS provider metadata. Unknown nonblank legacy values remain unclassified and are deliberately preserved.
5. **Provider refresh:** `sync_my_provider_avatar()` is an authenticated, self-scoped `SECURITY DEFINER` RPC. It runs on session restore, `SIGNED_IN`, and `TOKEN_REFRESHED`; it may fill/refresh only unset or `provider` avatars and never overwrites `avatar_source='upload'`. This avoids putting a general UPDATE trigger on `auth.users`.
6. **Uploads:** `uploadAvatar()` uploads a random path under the current user UUID, updates `profiles.avatar_url` plus `avatar_source='upload'`, removes the new object if the DB update fails, and only after DB success removes a previous BrickCircle-owned path. External provider URLs are never passed to storage deletion.
7. **Graceful rendering:** the shared avatar renderer paints initials first, then reveals the image after successful load. On error it removes the image and leaves initials. Header, Profile, Matches, and any future surface using `avatar()` share the same behavior.
8. **Privacy boundary:** `find_matches` still returns only match/item identifiers and set data. Collector identity remains a separate `public_profiles` lookup; no email or Auth metadata is added to the matching RPC.
9. **Privacy notice:** the policy explicitly states that a provider-supplied profile image may be shown until a member uploads a BrickCircle photo and that loading the image may contact the provider.

## Validation

- Static collector-avatar contract.
- JavaScript syntax, TypeScript typecheck, release asset sync, and `git diff --check`.
- Existing security, owner-review, and hosted-smoke guard suites.
- Chromium isolated tests covering:
  - matched collector provider avatar rendering;
  - no-photo initials fallback;
  - broken-image fallback;
  - failed profile persistence cleaning up the newly uploaded object;
  - successful replacement removing the previous owned object only after DB success;
  - replacing a provider URL without attempting external deletion.
- Existing reciprocal-match/proposal lifecycle regression.
- Isolated Postgres release-gate job covering backfill, projection, new-user initialization, provenance, provider refresh, upload precedence, HTTPS validation, and RPC privileges.

## Residual risks

Client-side upload/storage and profile-row update cannot be a true distributed transaction. A browser crash between the two operations can leave a harmless orphaned object, and simultaneous double uploads can leave one superseded random object. The canonical profile value remains correct; random object names prevent destructive collisions. Periodic owner-prefix orphan cleanup can be added later if storage volume makes it worthwhile.

Provider avatars are hot-linked. If a provider removes or expires an image, the UI intentionally falls back to initials.

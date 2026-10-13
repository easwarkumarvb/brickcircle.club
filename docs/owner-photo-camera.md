# Owner-set camera / local photo picker

Release: `20261010-owner-photo-camera-r1`. Base includes merged conversation-first messaging (`f9b9af3`). No schema, RLS, grants, auth configuration or dependency changes; Supabase remains pinned to `2.57.4`.

The canonical `app-v3.js` picker serves Add to My Sets, legacy missing-photo upload, and replacement. The excluded legacy `collection-owner-photo.js` is not loaded by the production shell and is intentionally unchanged.

## Contract

- Opening the picker never requests permission. **Take photo** explicitly requests `getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}})`; desktop webcams and mobile rear-camera preference use the same path.
- Live preview → bounded JPEG (long edge ≤1600px, quality 0.85) → review / retake → existing Save/Add submit. Camera capture itself never uploads.
- **Choose file** uses the existing local file/gallery input without `capture`. JPEG, PNG, WebP ≤8 MiB. Invalid/cancelled files and camera denial/cancellation preserve the selected photo.
- Unsupported, denied, absent or busy camera errors remain inline. An explicit **Try device camera** fallback uses `capture="environment"`; it is never invoked automatically and does not promise phone support.
- Tracks/video are cleared on capture, cancellation, closing, direct removal/content replacement, navigation, pagehide, logout and account change. Pagehide also removes the resource dialog so BFCache cannot restore a dead picker; a restored page can reopen it. Generation tokens stop late permission streams and ignore stale encodes. Object URLs are revoked on replacement/disposal.
- Saves snapshot owner ID and a photo-specific identity/session generation. Same-owner token refresh is permitted, including refresh during `getUser`. Logout and A→B→A invalidate old operations. Identity is checked before/after upload and before owner-scoped writes; paths remain UUID-based with explicit `contentType` and `upsert:false`.
- If a write has already been dispatched, it remains scoped to the captured owner; it cannot be retargeted to a subsequent account. Best-effort cleanup of a superseded upload can be rejected by existing RLS after an account switch; no grants are widened.
- Generic resource disposal is opt-in and independent of `bcAuthCleanup`, OTP abandonment, focus return, and the merged inline conversation forms. Hiding the camera panel restores focus inside the dialog; pending permission/encode puts focus on Cancel camera, preserving Escape.

## Documentation / production header inspection

Before implementation, fetched <https://supabase.com/changelog.md> with curl and inspected current entries. No relevant breaking upload-contract change required a client upgrade. Official references:

- <https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia>: secure context, user permission, unresolved permission promises, track `stop()` cleanup.
- <https://supabase.com/docs/reference/javascript/storage-from-upload>: bucket/path/body upload contract and `contentType` / `upsert` options.

Read-only curl inspection on 2026-10-10 of `https://www.brickcircle.club/` and `/v2.html` returned HTTPS 200 with no CSP or Permissions-Policy blocking camera/blob previews; the shell has no CSP meta policy. Repository `vercel.json` likewise restricts only `/admin.html`, whose live headers still report `camera=(), microphone=()` and its own restrictive CSP. These admin restrictions are unchanged. This verifies headers, not real-device compatibility.

## Test-only visual evidence

`tests/isolated/owner-photo-camera.spec.ts` mocks camera streams, tracks, video playback and canvas frames. It also blocks all non-loopback network traffic via the isolated fixture. No hardware, real permission dialogs, production Auth/storage writes, OTPs or grants are used.

Desktop (1280×900) and mobile (390×640) screenshots are watermarked **TEST ONLY · MOCKED CAMERA · NO HARDWARE** and saved through `testInfo.outputPath` as:

- `owner-photo-camera-desktop-live-test-only.png`
- `owner-photo-camera-desktop-captured-test-only.png`
- `owner-photo-camera-mobile-live-test-only.png`
- `owner-photo-camera-mobile-captured-test-only.png`

CI uploads these before browser phases clear `test-results`, with artifact names `owner-photo-camera-chromium-test-only` and `owner-photo-camera-firefox-webkit-test-only`. Local QA copies live under `qa/owner-photo-camera/`.

Focused command (loopback only; no exposed preview port):

```sh
BC_ISOLATED_PORT=4303 npm run test:isolated -- \
  tests/isolated/owner-photo-camera.spec.ts \
  tests/isolated/owner-photo-replacement.spec.ts \
  --project=chromium --project=firefox --project=webkit --workers=2 --retries=0
```

Broader browser/registration/account-switch regression gates run in the existing full CI. Draft PR requires Codex review before merge. Mocked screenshots do not substitute for subsequent real-device QA.

Final-source local validation: **114 passed, 0 failed, no retries** in 5.3 minutes (38 per browser, including existing replacement regressions). The log is committed at `qa/owner-photo-camera/focused-validation.txt`; 12 screenshots are saved alongside it. Release-sync static regressions: **9 passed, 0 failed, no retries**. Typecheck, syntax-check, release-check, diff-check and focused owner-photo static contract passed. Existing security/API contracts (55 tests plus legacy/admin assertions), owner-review/collector-avatar contracts and hosted harness guards (82 tests, no hosted writes) also passed.

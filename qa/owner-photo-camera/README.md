# Test-only owner photo camera evidence

These screenshots come from deterministic isolated Playwright tests, not a real camera. Live video is mocked; captured colored geometry is painted by the test canvas stub. Every screenshot carries a **TEST ONLY · MOCKED CAMERA · NO HARDWARE** watermark.

- Desktop: 1280×900; mobile-sized viewport: 390×640.
- Chromium, Firefox and WebKit.
- No production user/storage writes, OTPs or grants. External browser requests are blocked.
- Loopback server: `127.0.0.1:4303`, `reuseExistingServer:false`, two workers.

Files are prefixed with their browser name. `live` shows the live camera controls; `captured` shows the review/retake/Save state. CI produces fresh equivalents in `owner-photo-camera-chromium-test-only` and `owner-photo-camera-firefox-webkit-test-only` artifacts before its test-results cleanup.

See `docs/owner-photo-camera.md` for the feature contract, official references and validation command. Hardware and native camera compatibility still need real-device QA after review.

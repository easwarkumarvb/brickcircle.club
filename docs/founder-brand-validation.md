# Founder and supplied brand artwork

The approved founder prose was selectively ported from OpenCode's draft PR134.
It appears once, after the trust section, with the exact attribution and closing
Buy Less. Build More. The supplied 1086×1448 portrait is lazy-loaded, contained
without cropping, and has a readable fallback. The three approved iconic model
pairings remain unchanged.

The supplied 64/256/512 PNGs replace active logo/favicon/social references in
the canonical app, legal/info/city pages and legacy brand renderer. The manifest
adds the supplied artwork while retaining its existing maskable icon. Updating
manifest metadata does not enable beta PWA installation or web push. Release
assets and index/v2 remain synchronized. No new artwork was generated.

Existing dark profile/home panels also receive PR134's scoped readable white
heading/action treatment; person-first conversation styles are preserved.

## Evidence and gates

- Exact founder prose and supplied binary assets were checked against PR134.
- JavaScript syntax, TypeScript and release synchronization passed locally.
- Landing tests now check founder/image rendering and overflow at 320, 360, 390,
  430, 768 and 1440px, including 200% text, alongside existing pairing/axe checks.
- The previously authored two-width collector contrast regression is retained.
- Local Playwright browser download failed; browser/accessibility execution
  requires the combined candidate's isolated CI. Prepared tests are not passes.
- Human visual approval and physical mobile-device evidence remain separate.

OpenCode prepared this scope before its provider/free-quota failures. The current
port uses its reviewed PR134 source instead of importing the obsolete branch as
a whole. No merge, deployment or production operation occurred. The development
branch has deployment disabled before publication.

# PR134 QA-only completion on current main

Historical PR134 bundled QA with older runtime, branding, PWA and photo-angle
migration changes. This follow-up imports only useful public QA and redacted
triage assertions, then reuses current suites from merged PR138. It intentionally
leaves the older runtime and schema out. The former owner-photo/founder contract
tests depended on that unmerged product scope and are not required by this QA
config; all referenced browser files exist and collect reproducibly.

Changes: isolated UX config and CI job; explicit transport guard covering extra
actor contexts; synthetic screenshot gallery with safe artifact selection;
triage and unit tests; current signup verification assertion; reviewed deployment
disable flag for `dev/permanent-ux-qa`. No server-owned writer or application code
changes. PR125/138 trusted hosted runners remain unchanged.

Local evidence: 177/177 Chromium desktop/Android plus isolated journey tests pass
without retries (1.0 minute). Typecheck and five transport/gallery/triage unit
tests pass. Both static security contracts and 55 admin API contracts pass;
syntax, release synchronization and diff checks pass. Synthetic gallery contains
12 public/camera checkpoints and redacted triage has zero findings for this run.
`npx playwright test --config playwright.ux.config.ts --list` collects 189 tests
from ten files. Firefox/WebKit public checkpoints require CI. An initial test-only transport
error-text assertion assumed no Chromium `.Inspector` suffix; it was corrected
to accept that observed browser diagnostic variation, then the final full
selected run passed. This was not a product or transport bypass failure.
Screenshots are synthetic review evidence, not approved baseline comparisons.

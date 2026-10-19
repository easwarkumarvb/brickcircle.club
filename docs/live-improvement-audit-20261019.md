# Live improvement audit — 2026-10-19

This is a source review of the current analytics, observability, administrator
reporting, and support surfaces, not a production/hosted measurement. Evidence
is from the checked-in source and offline tests; no runtime configuration,
hosted database, external analytics account, or third-party monitoring service
was inspected. No application runtime or external SDK is changed in this
branch.

## Concrete findings

| Priority | Area | Source evidence and gap | Minimal follow-up |
| --- | --- | --- | --- |
| P1 | Error and performance observability | `observability-v26.js` initializes Sentry only if both `window.Sentry` and `BC_OBSERVABILITY.sentryDsn` already exist. The app's public HTML does not load a Sentry SDK, and no metric subscriber for its `bc:metric` event was found in the repository. Thus exception capture is a no-op without deployment-provided globals, and `bcMeasure()` timings are dispatched locally but not retained or exported. | First decide and document the approved error/performance sink, environment-specific configuration, privacy filtering, and consent requirements. Then wire a bounded, tested sink for a small set of app/admin operations; test disabled mode and prevent IDs, free text, tokens, or support content from leaving the browser. |
| P2 | Product analytics | `analytics.js` excludes auth callback/admin documents, restricts page names, and allowlists event dimensions; `tests/static/analytics-privacy-runtime.test.mjs` checks these protections. `product-analytics.js` infers starts from button text/inline-handler strings and successes by searching rendered text for a fixed set of phrases. It has no explicit failed/cancelled outcome instrumentation, and copy/markup changes can silently change funnel counts. The code has no visible consent gate before the Google tag is loaded; consent-policy compatibility is therefore an unresolved requirement, not an assumed approval. | Verify consent and measurement policy before enabling or expanding collection. Replace text heuristics incrementally with explicit semantic event hooks and a versioned event dictionary; add tests for success, failure, cancellation, and duplicate events while retaining the current strict parameter allowlist. |
| P2 | Growth/admin reporting | Growth reporting is a useful aggregate-only 7/28/90-day report with strict API response validation, no-store responses, visible generated-at time, CSV export, stale-view safeguards, and dedicated API contract tests. It remains an on-demand snapshot: `admin-dashboard.js` shows request errors in the console UI, but the admin page does not load the observability bridge, and the repository contains no independent freshness/availability alert for the report endpoint. | Add an approved, privacy-safe availability/latency signal and freshness threshold for the report endpoint. Keep the metric aggregate and avoid reporting rows, administrator IDs, collector data, or export contents. |
| P3 | Support operations | The support console already supports status/age filters, request detail, separate admin-note/status history and collector-event timeline, revision-aware changes, and pagination. The current overview only counts actionable support; there is no queue-age/SLA trend or alert in the reviewed UI/report contract. The API tests cover authorization, narrow RPC selection, validation, and error envelopes, not operator alerting or queue-level freshness. | Extend the existing aggregate admin report with bounded queue-age buckets and an actionable-oldest-request indicator, then document an owner/response threshold. Do not include request notes, IDs, or message content in analytics. |

## Evidence boundaries and sequencing

The existing protections are material: callback URLs and the admin page are
excluded from public GA loading; `bcTrack` strips unknown dimensions and
constrains numeric values; admin report data is aggregate, validated, and
`no-store`; support reads/actions use authenticated, MFA-gated admin RPCs and
audited writes. The follow-up should preserve these properties rather than
adding browser-wide DOM/network capture.

Recommended order: (1) resolve consent/sink/privacy ownership, (2) add an
explicitly configured and testable error/performance signal, (3) replace
heuristic product events with semantic hooks and outcome coverage, and (4) add
admin report freshness and support queue-age operations signals. No external
monitoring SDK, runtime telemetry, database object, hosted query, or provider
configuration is included in this source-preparation branch.

# Three assembled-set photos

The existing primary image is the front slot. Side/detail and rear slots use the existing camera/upload picker, 8 MB JPEG/PNG/WebP validation and 15-minute signed URLs refreshed one minute early. Photos open full size with accessible labels. My Sets can edit supplementary photos; matches and canonical exchange details show authorized photos, including cancelled archives. A missing optional table keeps the primary image usable. Query failures show a fixed product message rather than provider diagnostics.

## Authorization and commits

The supplemental metadata SELECT policy inherits invoker-visible collection_items rows; writes require the actual owner of the same item. Storage SELECT verifies the actual item owner equals the object namespace, for both primary and supplemental paths. No collection visibility, Storage write grants, canonical transitions, locks, availability or readiness rules change. Anonymous gallery privileges are revoked explicitly.

Existing slots use compare-and-swap on the previous path. Empty slots use INSERT and the item/angle unique key. Only exactly one returned row matching item, owner, angle and new path authorizes old-object cleanup or success. Zero returned rows or definitive SQLSTATE rejections (including transaction rollback 40001/40P01) clean the new candidate; ambiguous network/lost-response outcomes retain it. Account generation and DOM checks prevent late hydration into another account or detached host; a same-account auth refresh safely aborts pending hydration. A session change between upload and metadata write can retain an unreferenced candidate conservatively.

## Validation

Local syntax, TypeScript, release synchronization and diff checks passed; all 16 browser-free gallery commit and hydration regression tests passed. The isolated browser regression suite covers three slots/full-size links, silent zero rows, committed writes with lost responses and a missing optional table. Local browser execution was blocked before assertions by a missing Chromium executable. Run the nine browser cases in the isolated CI/Codespace environment; no hosted/device outcome is implied.

The disposable PostgreSQL workflow applies the migration twice, tests owner writes, foreign-item/folder forgery denial, reciprocal reads, both canonical participants through PROPOSED/ACCEPTED/CANCELLED after wishlists disappear, outsider/anonymous denial and foreign metadata/Storage update/delete denial. Existing primary privacy and canonical regressions replay afterward.

Migration source was prepared offline because the Supabase CLI's telemetry operation was rejected by automatic approval review earlier in this session. No CLI retry, staging application or production database change occurred. PostgreSQL execution is pending the disposable CI runner; local psql/PostgreSQL and Docker are unavailable. Existing staging gallery rows must be checked before rollout; CREATE IF NOT EXISTS does not silently repair incompatible legacy table layouts.

No branch deployment, merge, provider delivery or production rollout is authorized by this development work.

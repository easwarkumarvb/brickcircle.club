# BrickCircle database lineage and forward-only reconciliation design

Checkpoint: 2026-08-31. This document compares production current state, the 34 production migration records, `main`, and all reachable Git remote/tag objects. It proposes design only; no schema-changing migration has been created or applied.

## Interpretation

- **Main** means a checked-in migration with matching purpose/body is present, even when the repository filename omitted the precise production version prefix.
- **Exact source** means the migration SQL is present on `main` or its exact applied-version file is provably recoverable as a Git blob. It does not mean the current production definition still equals that historical body.
- **Superseded** means at least one affected definition was subsequently replaced or materially extended.
- **UNRECOVERABLE FROM SOURCE** means no matching filename/blob/content was found in any reachable commit, remote branch, or tag. Current catalog DDL must not be relabeled as that historical migration.

## Migration-lineage matrix

| Production version | Production name | Main? | Exact source? | Principal affected objects | Superseded later? | Reconciliation requirement |
|---|---|---:|---:|---|---:|---|
| 20260819114807 | `brickcircle_v21_core_schema` | No | **No** | Core tables, initial RLS, auth profile trigger | Yes | UNRECOVERABLE; baseline current core tables instead |
| 20260819114903 | `lock_down_profile_trigger` | No | **No** | `handle_new_user`, auth trigger privileges | Yes | UNRECOVERABLE; baseline current trigger/function/ACL |
| 20260821134137 | `v22_exchange_engine` | No | **No** | request/exchange RPC generation | Yes | UNRECOVERABLE; baseline current RPC definitions |
| 20260821134316 | `v22_request_notifications` | No | **No** | `notify_new_exchange_request`, notification trigger | Partly | UNRECOVERABLE; baseline current definition |
| 20260821140005 | `v22_exchange_engine_hardening_v2` | Yes | Yes | exchange/review RPCs, policies, indexes | Yes | Retain as provenance; current baseline wins for fresh installs |
| 20260821140108 | `v22_review_security_hardening` | Yes | Yes | review/notification privileges and policies | Partly | Retain as provenance |
| 20260821151554 | `sync_email_verification_and_avatars` | No | **No** | profile email sync, avatar bucket/policies | Yes | UNRECOVERABLE; baseline exact current auth/storage state |
| 20260821152013 | `fix_avatar_storage_uploads` | No | **No** | avatar object policies | Yes | UNRECOVERABLE; do not preserve duplicate generations blindly |
| 20260822035235 | `fix_avatars_bucket_upload_policies` | No | **No** | avatar bucket/object policies | Yes | UNRECOVERABLE; baseline current bucket then reconcile duplicates forward |
| 20260822134351 | `v23_enforce_in_person_sequence` | Yes | Yes | meetup table/RPCs and local exchange flow | Yes | Retain as provenance |
| 20260823064220 | `v23_first_100_qa_hardening` | Yes | Yes | active-item locks, request acceptance, cancellation | Yes | Retain as provenance |
| 20260823070258 | `v24_temporary_swap_return_workflow` | No | **No** | `exchange_returns`, return fields/RPCs | Yes | UNRECOVERABLE; baseline exact current return table and RPCs |
| 20260823084746 | `v24_swap_active_state_and_cancellation_guard` | Yes | Yes | exchange state check, cancellation | Partly | Retain as provenance |
| 20260823085727 | `v24_mobile_retry_and_concurrency_hardening` | Yes | Yes | meetup/return RPC concurrency | Partly | Retain as provenance |
| 20260824071707 | `v25_beta_city_normalization_and_overdue_returns` | Yes | Yes | city normalization, matching, overdue RPCs | Yes | Retain as provenance |
| 20260824074818 | `brickcircle_growth_automation_v1` | No | **No** | `growth_events`, `member_notifications`, referrals, V1 triggers | Yes | UNRECOVERABLE; baseline exact current objects and mark V1/V2 overlap |
| 20260824075550 | `harden_rpc_and_prepare_growth_email_queue` | No | **No** | RPC ACLs, `email_outbox`, notification email trigger | Partly | UNRECOVERABLE; baseline exact current table/function/ACL |
| 20260824075816 | `fix_location_function_search_paths` | No | **No** | location function `search_path` | Yes | UNRECOVERABLE; baseline current function definitions |
| 20260824102210 | `v26_public_profile_privacy_stage1` | Yes | Yes | `public_profiles`, projection trigger, privacy RLS | Yes | Retain as provenance |
| 20260824102221 | `v26_core_performance_indexes` | No | **No** | collection/wishlist/request/exchange/message indexes | Partly | UNRECOVERABLE; baseline exact current indexes |
| 20260824102231 | `v26_product_performance_metrics` | No | **No** | `product_metrics`, metric RPC/indexes/ACL | Partly | UNRECOVERABLE; baseline exact current metrics objects |
| 20260826152150 | `growth_engine_v2_liquidity_automation` | Yes | Yes | growth state, V2 triggers/campaigns/cron/outbox bridge | Partly | Retain; baseline current state including cron |
| 20260827160519 | `social_login_referral_claiming` | Yes | Yes | referral claim and auth-provider event RPCs | Partly | Retain |
| 20260828095450 | `add_catalogue_sync_metadata` | No | **No** | Rebrickable/catalog metadata columns | Yes | UNRECOVERABLE; baseline current `lego_sets` shape |
| 20260828100901 | `scale_full_rebrickable_catalog` | No | **No** | catalogue active flag/indexes/data-scale support | Yes | UNRECOVERABLE; baseline current catalogue shape/indexes |
| 20260828132513 | `optimize_catalogue_search_v28` | No | **No** | `pg_trgm`, catalogue indexes/search generation | Yes | UNRECOVERABLE; baseline installed extension and current indexes/RPC |
| 20260828162554 | `mobile_pwa_founding_100_liquidity` | Yes | Yes | founder columns/triggers/status/referral/liquidity | Yes | Retain as provenance |
| 20260829060244 | `membership_program_v31` | Yes | Yes | membership ordinal/config/overrides/projection/status | Current/partly | Retain |
| 20260829061132 | `catalog_product_name_search_v32` | Yes | Yes | `bc_search_lego_sets` | Yes | Retain as provenance; V35 is canonical |
| 20260829072229 | `beta_release_rls_hardening` | Yes | Yes | profile, notification, collection, public-profile RLS/ACL | Partly | Retain |
| 20260829154103 | `fix_growth_event_trigger_rls` | No | **Yes, remote Git blob** | growth-event RLS/ACL and V1 trigger functions | Current | Restore exact file after approval; do not create a new variant |
| 20260830074741 | `fix_profile_city_normalization_permissions_v35` | Yes | Yes | location trigger security/ACL | Current | Retain |
| 20260830080019 | `allow_collection_item_removal_with_pending_requests` | No | **Yes, remote Git blob** | request-item FKs and deletion semantics | Current | Restore exact file and matching regression coverage after approval |
| 20260830082233 | `catalog_text_search_model_names_v35` | Yes | Yes | canonical catalogue search RPC | Current | Retain |

### Exact unrecoverable historical gaps

The following 16 bodies are **UNRECOVERABLE FROM SOURCE** after searching all reachable commits, remote branches and tags by migration name, probable filename and affected-object creation text:

`20260819114807`, `20260819114903`, `20260821134137`, `20260821134316`, `20260821151554`, `20260821152013`, `20260822035235`, `20260823070258`, `20260824074818`, `20260824075550`, `20260824075816`, `20260824102221`, `20260824102231`, `20260828095450`, `20260828100901`, `20260828132513`.

The list contains 16 versions; “18 applied-but-missing” comprises these 16 plus the two exact Git-recoverable repairs (`20260829154103`, `20260830080019`). No old-version file will be fabricated for the 16 unrecoverable bodies.

## Four-way reconciliation

| Layer | Count/status | Meaning |
|---|---|---|
| Production current state | 21 public application tables, 78 public indexes, 37 application functions, 13 application/auth triggers, 27 public RLS policies, 13 avatar policies, 3 sequences, 1 cron job | Authoritative behavior at checkpoint |
| Production migration records | 34 | Authoritative applied version/name history, but not migration SQL bodies |
| Main migration files | 18 | Partial provenance; includes current definitions and intermediate generations |
| Recoverable Git-only exact migration files | 2 | Growth RLS and collection-deletion repair bodies |
| Unrecoverable applied bodies | 16 | Must remain explicitly unknown historically |

## Proposed forward-only strategy

### 1. Preserve evidence and provenance

- Keep this checkpoint and SELECT-only query pack.
- Restore the two exact Git-proven migration files verbatim under their true applied versions. This restores source provenance only; production already records them as applied.
- Move superseded, incomplete historical migration files to a clearly labelled archive outside the active fresh-install migration path. Do not delete them and do not alter production migration history.

### 2. Establish one future-version baseline

Create a **new future-timestamped** migration such as `phase1_current_production_baseline`. It must be visibly labelled as a 2026-08-31 current-state baseline, never as a recovered historical migration.

The baseline should have two explicit modes inside one transaction:

- **Fresh environment:** if the BrickCircle core sentinel objects do not exist, create the exact checkpoint schema—extensions, tables, constraints, indexes, RLS, policies, functions, triggers, sequences, bucket configuration, ACLs and cron definition—from catalog-derived DDL.
- **Existing production-like environment:** if the sentinel exists, make no structural changes. Run assertion blocks that compare required columns, constraint definitions, policy predicates, function-definition fingerprints and trigger definitions. Abort on drift rather than silently rewriting production.

Production applying this migration would therefore record a new forward migration and run assertions, but would not recreate or replace existing schema objects.

### 3. Separate security/cleanup reconciliation

Do not bake desired cleanup into the truth baseline. After the baseline is verified on an isolated fresh database, create separate forward migrations for intentional behavior changes such as:

- consolidating duplicate storage policies;
- replacing `{public}` policies with explicit roles;
- revoking browser EXECUTE from trigger-only functions and excess sequence privileges;
- choosing one notification pipeline;
- moving privileged internals out of the exposed schema.

Each change requires role-based regression coverage and separate approval.

### 4. Fresh-environment workflow

The active migration directory for a new environment should contain the new baseline followed only by future migrations. Historical files remain archived evidence. CI must:

1. initialize an empty Supabase-compatible database;
2. apply the baseline and all later migrations;
3. compare catalog fingerprints with the approved checkpoint/expected future state;
4. run RLS and lifecycle tests as `anon`, two authenticated users, an unrelated user and service role.

## Strategy risks

### Production

- Even assertion-only application creates a migration-history record; it must be scheduled and reviewed.
- Incorrect sentinel logic could accidentally enter fresh-create mode. The sentinel must require several independent production objects and the production project reference must be explicitly guarded in deployment tooling.
- Function text fingerprints can differ from harmless PostgreSQL formatting/version changes. Assertions should combine signatures/security/search-path with normalized definitions.
- Cron and storage are platform-managed surfaces; recreating them in fresh environments may need Supabase-specific privileges and ordering.
- Existing duplicate policies and over-broad function privileges remain until separately approved cleanup migrations.

### Fresh environment

- A plain PostgreSQL container is insufficient for full fidelity without Supabase `auth`, `storage`, JWT helpers and roles.
- Creating the public `avatars` bucket is data/config bootstrap in addition to DDL and must be idempotent.
- Cron availability and ownership differ between local Supabase and hosted production.
- Current production contains legacy shipping/payment exchange fields and two notification generations; a truth baseline intentionally reproduces them until Phase 2 decisions are approved.
- Seed/catalog data is separate from schema reproducibility; the Rebrickable sync must populate `lego_sets` after baseline creation.

## Approval boundary

No baseline or other schema-changing migration should be authored until this design and the checkpoint inventory are approved. The next approved step should restore the two exact provenance files, add catalog-fingerprint regression tests, and generate the future baseline in an isolated environment only.

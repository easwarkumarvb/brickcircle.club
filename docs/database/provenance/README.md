# Git-proven production migration evidence

These files are evidence copies outside the active `supabase/migrations`
directory. They are not new migrations and must not be applied from this
location.

- `20260829154103_fix_growth_event_trigger_rls.sql` was recovered verbatim from
  `origin/codex/fix-growth-events-rls`.
- `20260830080019_allow_collection_item_removal_with_pending_requests.sql` was
  recovered verbatim from
  `origin/fix/collection-item-delete-dependencies`.

Production already records both versions as applied. The copies preserve exact
source provenance while migration-history alignment remains unapproved.

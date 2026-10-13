-- Retire the pre-canonical availability trigger.
-- Canonical exchange_case_item_locks plus set_exchange_item_availability()
-- are now the source of truth for whether an item can be offered again.
-- Legacy public.exchanges rows remain audit history and must not block owner recovery.

drop trigger if exists bc_guard_collection_exchangeability
  on public.collection_items;

-- Availability and owner-review state are canonical workflow fields. Browser
-- roles may edit descriptive item details, but must use the server-owned
-- set_exchange_item_availability() RPC for these two control fields.
revoke insert, update on public.collection_items from authenticated;
grant insert (
  user_id,set_number,condition,completeness,original_box,estimated_value,
  notes,owner_photo_path
) on public.collection_items to authenticated;
grant update (
  condition,completeness,original_box,estimated_value,notes,owner_photo_path,updated_at
) on public.collection_items to authenticated;

-- The legacy trigger function is intentionally neither required nor dropped:
-- production may retain it for audit/schema compatibility, while fresh CI
-- baselines that never created it remain valid.
notify pgrst, 'reload schema';

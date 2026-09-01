-- Removing a collection item withdraws proposals that can no longer be fulfilled.
-- Accepted/completed exchanges remain protected by exchanges.item_a/item_b NO ACTION FKs.
set local lock_timeout = '5s';
set local statement_timeout = '20s';

alter table public.exchange_requests
  drop constraint exchange_requests_offered_item_id_fkey,
  add constraint exchange_requests_offered_item_id_fkey
    foreign key (offered_item_id)
    references public.collection_items(id)
    on delete cascade;

alter table public.exchange_requests
  drop constraint exchange_requests_requested_item_id_fkey,
  add constraint exchange_requests_requested_item_id_fkey
    foreign key (requested_item_id)
    references public.collection_items(id)
    on delete cascade;

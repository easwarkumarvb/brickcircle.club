-- Protect owner photo bytes underlying a live exchange or recent handoff record.
-- Policy is RESTRICTIVE: owner permission alone cannot bypass the evidence guard.
-- No automatic purging occurs: 90 days is a minimum protected review window.
begin;

create or replace function private.bc_collection_photo_bytes_protected(p_path text)
returns boolean language sql stable security definer set search_path=''
as $$
 select
   exists (
     select 1 from public.collection_items ci
     where (ci.owner_photo_path = p_path
       or exists (select 1 from public.collection_item_photo_angles a
                  where a.item_id=ci.id and a.owner_id=ci.user_id
                    and a.storage_path=p_path))
       and (ci.available_for_exchange
         or exists (select 1 from public.exchange_case_item_locks l
                    where l.item_id=ci.id))
   )
   or exists (
     select 1
     from public.exchange_case_handoff_baselines h
     join public.exchange_cases c on c.id=h.case_id
     where (c.completed_at is null or c.completed_at > pg_catalog.now()-interval '90 days')
       and p_path in (
         h.snapshot #>> '{item_a,photos,front}',
         h.snapshot #>> '{item_a,photos,side}',
         h.snapshot #>> '{item_a,photos,rear}',
         h.snapshot #>> '{item_b,photos,front}',
         h.snapshot #>> '{item_b,photos,side}',
         h.snapshot #>> '{item_b,photos,rear}'
       )
   )
$$;

revoke all on function private.bc_collection_photo_bytes_protected(text)
  from public,anon,authenticated;
grant execute on function private.bc_collection_photo_bytes_protected(text) to authenticated;

drop policy if exists "trust care preserve collection photo deletion" on storage.objects;
create policy "trust care preserve collection photo deletion"
on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'collection-photos'
  or not private.bc_collection_photo_bytes_protected(name));

drop policy if exists "trust care preserve collection photo replacement" on storage.objects;
create policy "trust care preserve collection photo replacement"
on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'collection-photos'
  or not private.bc_collection_photo_bytes_protected(name))
with check (bucket_id <> 'collection-photos'
  or not private.bc_collection_photo_bytes_protected(name));

comment on function private.bc_collection_photo_bytes_protected(text)
is 'Owner image bytes referenced by an available/locked collection copy or by a mutual handoff baseline less than 90 days past completion are protected from authenticated Storage DELETE/UPDATE. No automatic purge.';

commit;
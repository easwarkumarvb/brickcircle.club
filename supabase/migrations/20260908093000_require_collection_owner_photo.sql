-- BrickCircle: require a real owner photo for newly exchangeable collection items.
-- Existing beta collection rows remain valid, but cannot become exchangeable until photographed.

alter table public.collection_items
  add column if not exists owner_photo_path text;

comment on column public.collection_items.owner_photo_path is
  'Storage object path for the member-supplied photo of the assembled physical LEGO set.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'collection-photos',
  'collection-photos',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "collection photos owner insert" on storage.objects;
create policy "collection photos owner insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "collection photos owner update" on storage.objects;
create policy "collection photos owner update"
on storage.objects for update to authenticated
using (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "collection photos owner delete" on storage.objects;
create policy "collection photos owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Existing collection RLS already lets owners and exchange participants read
-- the appropriate physical-copy rows. Add reciprocal-match visibility so a
-- collector can inspect the real photo before deciding whether to propose.
drop policy if exists "users read reciprocal matched collection items" on public.collection_items;
create policy "users read reciprocal matched collection items"
on public.collection_items for select to authenticated
using (
  exists (
    select 1
    from public.find_matches((select auth.uid())) m
    where m.offered_item = collection_items.id
       or m.requested_item = collection_items.id
  )
);

-- Storage reads inherit the same collection_items RLS decision.
drop policy if exists "collection photos permitted read" on storage.objects;
create policy "collection photos permitted read"
on storage.objects for select to authenticated
using (
  bucket_id = 'collection-photos'
  and exists (
    select 1
    from public.collection_items ci
    where ci.owner_photo_path = storage.objects.name
  )
);

create or replace function public.bc_require_owner_photo_for_exchange()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(new.available_for_exchange, false)
     and nullif(btrim(coalesce(new.owner_photo_path, '')), '') is null then
    raise exception 'Upload a photo of your assembled LEGO set before making it available to exchange.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists bc_require_owner_photo_for_exchange on public.collection_items;
create trigger bc_require_owner_photo_for_exchange
before insert or update of available_for_exchange, owner_photo_path
on public.collection_items
for each row
execute function public.bc_require_owner_photo_for_exchange();

-- BrickCircle trust layer: require a real owner photo for newly exchangeable sets.
-- Existing beta rows remain intact; legacy rows without a photo cannot be newly
-- made exchangeable or used in a new exchange request until a photo is added.

alter table public.collection_items
  add column if not exists owner_photo_path text;

comment on column public.collection_items.owner_photo_path is
  'Storage path in collection-photos for a member-supplied photo of the assembled physical LEGO set.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'collection-photos',
  'collection-photos',
  true,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "collection photos insert own folder" on storage.objects;
create policy "collection photos insert own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "collection photos update own folder" on storage.objects;
create policy "collection photos update own folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "collection photos delete own folder" on storage.objects;
create policy "collection photos delete own folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'collection-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.bc_require_owner_photo_for_exchangeable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.available_for_exchange is true
     and nullif(btrim(coalesce(new.owner_photo_path, '')), '') is null
     and (tg_op = 'INSERT' or coalesce(old.available_for_exchange, false) is false)
  then
    raise exception 'Upload a photo of your assembled LEGO set before making it available to exchange.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_collection_owner_photo_exchangeable on public.collection_items;
create trigger trg_collection_owner_photo_exchangeable
before insert or update of available_for_exchange, owner_photo_path
on public.collection_items
for each row execute function public.bc_require_owner_photo_for_exchangeable();

create or replace function public.bc_require_exchange_item_photos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  offered_photo text;
  requested_photo text;
begin
  select owner_photo_path into offered_photo
  from public.collection_items
  where id = new.offered_item_id;

  select owner_photo_path into requested_photo
  from public.collection_items
  where id = new.requested_item_id;

  if nullif(btrim(coalesce(offered_photo, '')), '') is null
     or nullif(btrim(coalesce(requested_photo, '')), '') is null
  then
    raise exception 'Both LEGO sets need an owner photo before a new exchange proposal can be sent.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_exchange_request_owner_photos on public.exchange_requests;
create trigger trg_exchange_request_owner_photos
before insert on public.exchange_requests
for each row execute function public.bc_require_exchange_item_photos();

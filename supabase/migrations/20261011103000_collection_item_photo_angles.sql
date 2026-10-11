-- Additional owner-supplied photo angles for an assembled set.
-- The existing owner_photo_path remains the front/primary image and the
-- existing collection item exchange readiness rule remains unchanged.
create table if not exists public.collection_item_photo_angles (
  item_id uuid not null references public.collection_items(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  angle text not null check (angle in ('side','rear')),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  primary key (item_id, angle),
  constraint owner_folder_matches check (split_part(storage_path, '/', 1) = owner_id::text)
);
create index if not exists collection_item_photo_angles_owner_idx
  on public.collection_item_photo_angles(owner_id);
alter table public.collection_item_photo_angles enable row level security;

drop policy if exists "owners manage supplementary photo angles" on public.collection_item_photo_angles;
create policy "owners manage supplementary photo angles"
on public.collection_item_photo_angles for all to authenticated
using (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.collection_items ci
    where ci.id = item_id and ci.user_id = (select auth.uid())
  )
)
with check (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.collection_items ci
    where ci.id = item_id and ci.user_id = (select auth.uid())
  )
);

drop policy if exists "matched collectors read supplementary photo angles" on public.collection_item_photo_angles;
create policy "matched collectors read supplementary photo angles"
on public.collection_item_photo_angles for select to authenticated
using (
  exists (
    select 1 from public.collection_items ci
    where ci.id = item_id and ci.user_id = owner_id
  )
);

-- Private storage objects must be linked to an accessible collection item
-- before a signed URL can be created. Keep legacy primary-image permission.
drop policy if exists "collection photos permitted read" on storage.objects;
create policy "collection photos permitted read" on storage.objects
for select to authenticated
using (
  bucket_id = 'collection-photos'
  and (
    exists (
      select 1 from public.collection_items ci
      where ci.owner_photo_path = storage.objects.name
    )
    or exists (
      select 1 from public.collection_item_photo_angles a
      where a.storage_path = storage.objects.name
    )
  )
);

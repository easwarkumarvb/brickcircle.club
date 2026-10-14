-- Supplemental angles inherit the existing collection visibility, including case archives.
-- An owner may also read their own folder, so unused candidates and replaced old photos
-- stay removable after their last metadata reference disappears.
-- Offline migration source: no remote database was changed.
begin;
create table if not exists public.collection_item_photo_angles (
 item_id uuid not null references public.collection_items(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 angle text not null check (angle in ('side','rear')),
 storage_path text not null unique,
 created_at timestamptz not null default now(),
 primary key (item_id,angle),
 constraint owner_folder_matches check (split_part(storage_path,'/',1)=owner_id::text)
);
create index if not exists collection_item_photo_angles_owner_idx on public.collection_item_photo_angles(owner_id);
alter table public.collection_item_photo_angles enable row level security;
revoke all on public.collection_item_photo_angles from public,anon,authenticated;
grant select,insert,update,delete on public.collection_item_photo_angles to authenticated;
drop policy if exists "owners manage supplementary photo angles" on public.collection_item_photo_angles;
drop policy if exists "matched collectors read supplementary photo angles" on public.collection_item_photo_angles;
drop policy if exists "visible collection supplementary photos" on public.collection_item_photo_angles;
create policy "owners manage supplementary photo angles" on public.collection_item_photo_angles for all to authenticated
using (owner_id=(select auth.uid()) and exists (select 1 from public.collection_items ci where ci.id=item_id and ci.user_id=(select auth.uid())))
with check (owner_id=(select auth.uid()) and exists (select 1 from public.collection_items ci where ci.id=item_id and ci.user_id=(select auth.uid())));
create policy "visible collection supplementary photos" on public.collection_item_photo_angles for select to authenticated
using (exists (select 1 from public.collection_items ci where ci.id=item_id and ci.user_id=owner_id));
-- Narrow owner-self read branch: bucket plus this owner's own UUID folder only.
-- It exists because DELETE ... WHERE/RETURNING (and the Storage remove API) must
-- read relation columns, so they need SELECT and DELETE together; an unreferenced
-- upload candidate or replaced old photo has no collection/angle row and a
-- metadata-only SELECT left it invisible. Non-owners still require the existing
-- primary/supplemental actual-owner metadata bindings below. No other bucket or
-- folder becomes readable and no write policy, grant, RPC, lock, lifecycle or
-- collection RLS rule changes here.
drop policy if exists "collection photos permitted read" on storage.objects;
create policy "collection photos permitted read" on storage.objects for select to authenticated
using (bucket_id='collection-photos' and (
 (storage.foldername(storage.objects.name))[1]=(select auth.uid())::text
 or exists (select 1 from public.collection_items ci where ci.owner_photo_path=storage.objects.name and ci.user_id::text=(storage.foldername(storage.objects.name))[1])
 or exists (select 1 from public.collection_item_photo_angles a join public.collection_items ci on ci.id=a.item_id and ci.user_id=a.owner_id
 where a.storage_path=storage.objects.name and ci.user_id::text=(storage.foldername(storage.objects.name))[1])
));
commit;

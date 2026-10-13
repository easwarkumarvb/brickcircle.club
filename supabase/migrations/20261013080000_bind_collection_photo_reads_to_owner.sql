-- A visible collection reference may authorize only its owner's Storage folder.
-- Owner-controlled photo metadata cannot grant access to another owner's object.
-- Keep collection RLS (owner, reciprocal match, legacy and canonical case) intact.
begin;
drop policy if exists "collection photos permitted read" on storage.objects;
create policy "collection photos permitted read"
on storage.objects for select to authenticated
using (
  bucket_id = 'collection-photos'
  and exists (
    select 1 from public.collection_items ci
    where ci.owner_photo_path = storage.objects.name
      and ci.user_id::text = (storage.foldername(storage.objects.name))[1]
  )
);
commit;

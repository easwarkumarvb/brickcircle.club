-- Restrictive write guards intersect every permissive legacy avatar policy.
-- Public avatar reads and policies for other buckets retain their behavior.
begin;
drop policy if exists avatar_namespace_insert_guard on storage.objects;
drop policy if exists avatar_namespace_update_guard on storage.objects;
drop policy if exists avatar_namespace_delete_guard on storage.objects;

create policy avatar_namespace_insert_guard on storage.objects
as restrictive for insert to authenticated
with check (bucket_id <> 'avatars' or (
  (select auth.uid()) is not null
  and split_part(name,'/',1)=(select auth.uid())::text
  and (owner_id is null or owner_id=(select auth.uid())::text)
  and name ~ '^[0-9a-f-]{36}/[^/]+(/[^/]+)*$'
  and name !~ '(^|/)[.]{1,2}(/|$)'
  and name !~ '[[:cntrl:]%]'
  and strpos(name,chr(92))=0
));
create policy avatar_namespace_update_guard on storage.objects
as restrictive for update to authenticated
using (bucket_id <> 'avatars' or (
  (select auth.uid()) is not null
  and split_part(name,'/',1)=(select auth.uid())::text
  and (owner_id is null or owner_id=(select auth.uid())::text)
  and name ~ '^[0-9a-f-]{36}/[^/]+(/[^/]+)*$'
  and name !~ '(^|/)[.]{1,2}(/|$)'
  and name !~ '[[:cntrl:]%]'
  and strpos(name,chr(92))=0
))
with check (bucket_id <> 'avatars' or (
  (select auth.uid()) is not null
  and split_part(name,'/',1)=(select auth.uid())::text
  and (owner_id is null or owner_id=(select auth.uid())::text)
  and name ~ '^[0-9a-f-]{36}/[^/]+(/[^/]+)*$'
  and name !~ '(^|/)[.]{1,2}(/|$)'
  and name !~ '[[:cntrl:]%]'
  and strpos(name,chr(92))=0
));
create policy avatar_namespace_delete_guard on storage.objects
as restrictive for delete to authenticated
using (bucket_id <> 'avatars' or (
  (select auth.uid()) is not null
  and split_part(name,'/',1)=(select auth.uid())::text
  and (owner_id is null or owner_id=(select auth.uid())::text)
  and name ~ '^[0-9a-f-]{36}/[^/]+(/[^/]+)*$'
  and name !~ '(^|/)[.]{1,2}(/|$)'
  and name !~ '[[:cntrl:]%]'
  and strpos(name,chr(92))=0
));
commit;

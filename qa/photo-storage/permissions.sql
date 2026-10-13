\set ON_ERROR_STOP on
begin;
create function public.qa_photo_assert(ok boolean,label text) returns void language plpgsql security invoker as $$ begin if ok is distinct from true then raise exception 'Photo QA: %',label; end if; end $$;
grant execute on function public.qa_photo_assert(boolean,text) to authenticated,anon;
\ir fixtures.sql
select public.qa_photo_assert(not public and file_size_limit=8388608 and allowed_mime_types=array['image/jpeg','image/png','image/webp'], 'private bucket configuration') from storage.buckets where id='collection-photos';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select public.qa_photo_assert((select count(*)=3 from storage.objects), 'owner, reciprocal match and legacy participant reads');
select public.qa_photo_assert(not exists(select 1 from storage.objects where name like '%hidden.jpg'), 'hidden foreign object denied');
insert into storage.objects(bucket_id,name) values('collection-photos','00000000-0000-4000-8000-000000000801/new.jpg');
do $$ begin
  begin insert into storage.objects(bucket_id,name) values('collection-photos','00000000-0000-4000-8000-000000000802/stolen.jpg'); raise exception 'foreign insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values('foreign-bucket','00000000-0000-4000-8000-000000000801/a.jpg'); raise exception 'foreign bucket insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values('collection-photos','root.jpg'); raise exception 'unscoped insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
-- Link an uploaded own object before UPDATE: SELECT policy follows collection links.
update public.collection_items set owner_photo_path='00000000-0000-4000-8000-000000000801/new.jpg' where id='81000000-0000-4000-8000-000000000001';
with changed as(update storage.objects set name=name where name like '%new.jpg' returning id) select public.qa_photo_assert((select count(*)=1 from changed),'owner update permitted');
do $$ begin
  begin update storage.objects set name='00000000-0000-4000-8000-000000000802/renamed.jpg' where name like '%new.jpg'; raise exception 'owner move to foreign folder unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
with changed as(update storage.objects set name=name where name like '%b.jpg' returning id) select public.qa_photo_assert((select count(*)=0 from changed),'matched photo not writable');
with removed as(delete from storage.objects where name like '%legacy.jpg' returning id) select public.qa_photo_assert((select count(*)=0 from removed),'participant photo not deletable');
with removed as(delete from storage.objects where name like '%new.jpg' returning id) select public.qa_photo_assert((select count(*)=1 from removed),'owner delete permitted');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
select public.qa_photo_assert(not exists(select 1 from storage.objects), 'unmatched outsider reads denied');
set local role anon;
set local "request.jwt.claim.sub"='';
select public.qa_photo_assert(not exists(select 1 from storage.objects), 'anonymous reads denied despite object SELECT grant');
do $$ begin
  begin insert into storage.objects(bucket_id,name) values('collection-photos','anon.jpg'); raise exception 'anonymous insert unexpectedly allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'PHOTO_STORAGE_PERMISSION_CORE_PASS'

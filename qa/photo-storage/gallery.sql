\set ON_ERROR_STOP on
begin;
create function public.qa_gallery_assert(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Gallery permission contract failed'; end if; end $$;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='collection_items' and policyname='canonical participants read case collection items' and cmd='SELECT') then
  raise exception 'Missing prerequisite migration: 20261013044724_canonical_participant_collection_photo_access.sql';
 end if;
end $$;
\ir fixtures.sql
delete from public.exchange_requests;
insert into storage.objects(bucket_id,name) values ('collection-photos','00000000-0000-4000-8000-000000000801/a-side.jpg'),('collection-photos','00000000-0000-4000-8000-000000000801/a-rear.jpg'),('collection-photos','00000000-0000-4000-8000-000000000802/b-side.jpg');
-- Simulate a stale/privileged malformed binding: a valid foreign-folder path
-- must not make an unrelated owner's object visible through another item.
insert into storage.objects(bucket_id,name) values('collection-photos','00000000-0000-4000-8000-000000000803/unlinked.jpg');
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path)
values('81000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000803','rear','00000000-0000-4000-8000-000000000803/unlinked.jpg');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select public.qa_gallery_assert(not exists(select 1 from public.collection_item_photo_angles where storage_path='00000000-0000-4000-8000-000000000803/unlinked.jpg'));
select public.qa_gallery_assert(not exists(select 1 from storage.objects where name='00000000-0000-4000-8000-000000000803/unlinked.jpg'));
reset role;
delete from public.collection_item_photo_angles where storage_path='00000000-0000-4000-8000-000000000803/unlinked.jpg';
delete from storage.objects where name='00000000-0000-4000-8000-000000000803/unlinked.jpg';
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path) values('81000000-0000-4000-8000-000000000001',auth.uid(),'side','00000000-0000-4000-8000-000000000801/a-side.jpg');
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%a-side.jpg'));
with changed as(update public.collection_item_photo_angles set storage_path=storage_path where item_id='81000000-0000-4000-8000-000000000001' returning item_id) select public.qa_gallery_assert(count(*)=1) from changed;
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path) values('81000000-0000-4000-8000-000000000001',auth.uid(),'rear','00000000-0000-4000-8000-000000000801/a-rear.jpg');
with removed as(delete from public.collection_item_photo_angles where angle='rear' returning item_id) select public.qa_gallery_assert(count(*)=1) from removed;
with removed as(delete from storage.objects where bucket_id='collection-photos' and name='00000000-0000-4000-8000-000000000801/a-rear.jpg' returning id) select public.qa_gallery_assert(count(*)=1) from removed;
-- Forging metadata ownership/item binding and another owner's folder must fail.
do $$ begin
 begin insert into public.collection_item_photo_angles values('81000000-0000-4000-8000-000000000002',auth.uid(),'rear','00000000-0000-4000-8000-000000000801/forged.jpg',now()); raise exception 'foreign item write allowed'; exception when insufficient_privilege then null; end;
 begin insert into public.collection_item_photo_angles values('81000000-0000-4000-8000-000000000001',auth.uid(),'rear','00000000-0000-4000-8000-000000000802/forged.jpg',now()); raise exception 'foreign folder write allowed'; exception when check_violation then null; end;
 begin update public.collection_item_photo_angles set owner_id='00000000-0000-4000-8000-000000000802',storage_path='00000000-0000-4000-8000-000000000802/forged.jpg' where item_id='81000000-0000-4000-8000-000000000001'; raise exception 'ownership transfer allowed'; exception when insufficient_privilege then null; end;
 begin update public.collection_item_photo_angles set item_id='81000000-0000-4000-8000-000000000002' where item_id='81000000-0000-4000-8000-000000000001'; raise exception 'foreign item reassignment allowed'; exception when insufficient_privilege then null; end;
end $$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path) values('81000000-0000-4000-8000-000000000002',auth.uid(),'side','00000000-0000-4000-8000-000000000802/b-side.jpg');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select public.qa_gallery_assert(exists(select 1 from public.collection_item_photo_angles where item_id='81000000-0000-4000-8000-000000000002' and owner_id='00000000-0000-4000-8000-000000000802' and storage_path='00000000-0000-4000-8000-000000000802/b-side.jpg'));
select public.qa_gallery_assert(exists(select 1 from storage.objects where bucket_id='collection-photos' and name='00000000-0000-4000-8000-000000000802/b-side.jpg'));
with changed as(update public.collection_item_photo_angles set storage_path=storage_path where owner_id<>auth.uid() returning item_id) select public.qa_gallery_assert(count(*)=0) from changed;
with removed as(delete from public.collection_item_photo_angles where owner_id<>auth.uid() returning item_id) select public.qa_gallery_assert(count(*)=0) from removed;
with changed as(update storage.objects set name=name where name like '%b-side.jpg' returning id) select public.qa_gallery_assert(count(*)=0) from changed;
with removed as(delete from storage.objects where name like '%b-side.jpg' returning id) select public.qa_gallery_assert(count(*)=0) from removed;
select public.create_exchange_case('81000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002',30,'Synthetic gallery fixture','gallery-proposal')->'case'->>'id' as case_id \gset
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%b-side.jpg'));
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%a-side.jpg'));
select public.exchange_case_transition(:'case_id',1,'accept','gallery-accept','{}'::jsonb);
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%a-side.jpg'));
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%b-side.jpg'));
select public.exchange_case_transition(:'case_id',2,'cancel','gallery-cancel','{}'::jsonb);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
do $$ begin
 begin update public.collection_items set owner_photo_path=null where id='81000000-0000-4000-8000-000000000002'; raise exception 'available front photo deletion unexpectedly succeeded'; exception when check_violation then null; end;
end $$;
with changed as(update public.collection_items set owner_photo_path=null where id='81000000-0000-4000-8000-000000000003' and user_id=auth.uid() and available_for_exchange=false returning id,user_id,owner_photo_path)
 select public.qa_gallery_assert(count(*)=1 and bool_and(owner_photo_path is null)) from changed;
with removed as(delete from storage.objects where bucket_id='collection-photos' and name='00000000-0000-4000-8000-000000000802/hidden.jpg' returning id) select public.qa_gallery_assert(count(*)=1) from removed;
reset role;
delete from public.wishlists;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select public.qa_gallery_assert(exists(select 1 from public.collection_item_photo_angles where item_id='81000000-0000-4000-8000-000000000002' and owner_id='00000000-0000-4000-8000-000000000802' and storage_path='00000000-0000-4000-8000-000000000802/b-side.jpg'));
select public.qa_gallery_assert(exists(select 1 from storage.objects where bucket_id='collection-photos' and name='00000000-0000-4000-8000-000000000802/b-side.jpg'));
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
select public.qa_gallery_assert(exists(select 1 from public.collection_item_photo_angles where item_id='81000000-0000-4000-8000-000000000001' and owner_id='00000000-0000-4000-8000-000000000801' and storage_path='00000000-0000-4000-8000-000000000801/a-side.jpg'));
select public.qa_gallery_assert(exists(select 1 from storage.objects where bucket_id='collection-photos' and name='00000000-0000-4000-8000-000000000801/a-side.jpg'));
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000803';
select public.qa_gallery_assert((select count(*)=0 from public.collection_item_photo_angles));
select public.qa_gallery_assert((select count(*)=0 from storage.objects));
set local role anon;
set local "request.jwt.claim.sub"='';
select public.qa_gallery_assert((select count(*)=0 from storage.objects));
do $$ begin begin perform 1 from public.collection_item_photo_angles; raise exception 'anonymous gallery granted'; exception when insufficient_privilege then null; end; end $$;
reset role;
select 'GALLERY_OWNER_MATCH_CANONICAL_ARCHIVE_PRIVACY_PASS' as evidence;
rollback;

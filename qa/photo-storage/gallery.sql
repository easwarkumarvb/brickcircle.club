\set ON_ERROR_STOP on
begin;
create function public.qa_gallery_assert(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Gallery permission contract failed'; end if; end $$;
\ir fixtures.sql
delete from public.exchange_requests;
insert into storage.objects(bucket_id,name) values ('collection-photos','00000000-0000-4000-8000-000000000801/a-side.jpg'),('collection-photos','00000000-0000-4000-8000-000000000802/b-side.jpg');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path) values('81000000-0000-4000-8000-000000000001',auth.uid(),'side','00000000-0000-4000-8000-000000000801/a-side.jpg');
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%a-side.jpg'));
with changed as(update public.collection_item_photo_angles set storage_path=storage_path where item_id='81000000-0000-4000-8000-000000000001' returning item_id) select public.qa_gallery_assert(count(*)=1) from changed;
insert into public.collection_item_photo_angles(item_id,owner_id,angle,storage_path) values('81000000-0000-4000-8000-000000000001',auth.uid(),'rear','00000000-0000-4000-8000-000000000801/a-rear.jpg');
with removed as(delete from public.collection_item_photo_angles where angle='rear' returning item_id) select public.qa_gallery_assert(count(*)=1) from removed;
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
select public.qa_gallery_assert((select count(*)=1 from public.collection_item_photo_angles where item_id='81000000-0000-4000-8000-000000000002'));
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%b-side.jpg'));
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
reset role;
delete from public.wishlists;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000801';
select public.qa_gallery_assert((select count(*)=1 from public.collection_item_photo_angles where owner_id<>auth.uid()));
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%b-side.jpg'));
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000802';
select public.qa_gallery_assert((select count(*)=1 from public.collection_item_photo_angles where owner_id<>auth.uid()));
select public.qa_gallery_assert((select count(*)=1 from storage.objects where name like '%a-side.jpg'));
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

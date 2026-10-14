begin;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$begin
 begin update storage.objects set name='20000000-0000-4000-8000-000000000002/injected.jpg'
  where name='10000000-0000-4000-8000-000000000001/original.jpg';
  raise exception 'foreign namespace rename succeeded'; exception when insufficient_privilege then null; end;
 begin update storage.objects set owner_id='20000000-0000-4000-8000-000000000002'
  where name='10000000-0000-4000-8000-000000000001/original.jpg';
  raise exception 'ownership transfer succeeded'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name,owner_id) values('avatars','20000000-0000-4000-8000-000000000002/injected.jpg',auth.uid()::text);
  raise exception 'foreign namespace insert succeeded'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name,owner_id) values('avatars','10000000-0000-4000-8000-000000000001/forged-owner.jpg','20000000-0000-4000-8000-000000000002');
  raise exception 'inconsistent owner insert succeeded'; exception when insufficient_privilege then null; end;
end$$;
do $$declare bad text;begin
 foreach bad in array array['root.jpg','10000000-0000-4000-8000-000000000001/../victim.jpg',
  '10000000-0000-4000-8000-000000000001/./image.jpg','10000000-0000-4000-8000-000000000001//image.jpg',
  '10000000-0000-4000-8000-000000000001/image.jpg/','10000000-0000-4000-8000-000000000001/%2e%2e/image.jpg',
  '10000000-0000-4000-8000-000000000001/'||chr(92)||'image.jpg',
  '10000000-0000-4000-8000-000000000001/'||chr(10)||'image.jpg'] loop
  begin insert into storage.objects(bucket_id,name,owner_id) values('avatars',bad,auth.uid()::text);
   raise exception 'malformed path succeeded: %',bad; exception when insufficient_privilege then null; end;
 end loop;
end$$;
insert into storage.objects(bucket_id,name,owner_id) values('avatars','10000000-0000-4000-8000-000000000001/new.jpg',auth.uid()::text);
with changed as(update storage.objects set name='10000000-0000-4000-8000-000000000001/subfolder/new.jpg',metadata='{"ok":true}'
 where name='10000000-0000-4000-8000-000000000001/new.jpg' returning name)
select public.qa_avatar_assert(count(*)=1,'own namespace rename and metadata update permitted') from changed;
with changed as(update storage.objects set metadata='{"ok":true}' where name='10000000-0000-4000-8000-000000000001/legacy-null.jpg' returning name)
select public.qa_avatar_assert(count(*)=1,'legacy NULL owner own namespace update permitted') from changed;
with removed as(delete from storage.objects where name='10000000-0000-4000-8000-000000000001/subfolder/new.jpg' returning name)
select public.qa_avatar_assert(count(*)=1,'own namespace delete permitted') from removed;
with changed as(update storage.objects set metadata='{"attacker":true}' where name like '20000000-%' returning name)
select public.qa_avatar_assert(count(*)=0,'foreign and inconsistent legacy objects not writable') from changed;
with removed as(delete from storage.objects where name like '20000000-%' returning name)
select public.qa_avatar_assert(count(*)=0,'foreign and inconsistent legacy objects not deletable') from removed;
insert into storage.objects(bucket_id,name,owner_id) values('fixture-other','unscoped-name',auth.uid()::text);
with changed as(update storage.objects set metadata='{"ok":true}' where bucket_id='fixture-other' returning name)
select public.qa_avatar_assert(count(*)=1,'other bucket update unaffected') from changed;
with removed as(delete from storage.objects where bucket_id='fixture-other' returning name)
select public.qa_avatar_assert(count(*)=1,'other bucket delete unaffected') from removed;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
with changed as(update storage.objects set metadata='{"modified":true}' where name like '%legacy-inconsistent.jpg' returning name)
select public.qa_avatar_assert(count(*)=0,'folder owner cannot modify inconsistent legacy object') from changed;
select public.qa_avatar_assert((select count(*)=4 from storage.objects where bucket_id='avatars'),'authenticated public reads preserved');
set local role anon;
select public.qa_avatar_assert((select count(*)=4 from storage.objects where bucket_id='avatars'),'anonymous public reads preserved');
do $$begin
 begin insert into storage.objects(bucket_id,name,owner_id) values('avatars','10000000-0000-4000-8000-000000000001/anon.jpg',null);
  raise exception 'anonymous insert succeeded'; exception when insufficient_privilege then null; end;
end$$;
with changed as(update storage.objects set metadata='{"anon":true}' returning name)
select public.qa_avatar_assert(count(*)=0,'anonymous update denied') from changed;
with removed as(delete from storage.objects returning name)
select public.qa_avatar_assert(count(*)=0,'anonymous delete denied') from removed;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
with changed as(update storage.objects set name='20000000-0000-4000-8000-000000000002/injected.jpg'
 where name='10000000-0000-4000-8000-000000000001/original.jpg' returning name)
select public.qa_avatar_assert(count(*)=1,'legacy owner-ID policy permits foreign namespace rename') from changed;
set local request.jwt.claim.sub='20000000-0000-4000-8000-000000000002';
with changed as(update storage.objects set metadata='{"foreignOwnerModified":true}'
 where name='20000000-0000-4000-8000-000000000002/injected.jpg' returning name)
select public.qa_avatar_assert(count(*)=1,'legacy folder policy permits second actor modifying A-owned object') from changed;
rollback;

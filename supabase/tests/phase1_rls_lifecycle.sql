begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
create function pg_temp.assert_true(ok boolean,msg text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %',msg; end if; end $$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','owner@example.test',now(),'{}'),
 ('20000000-0000-0000-0000-000000000002','counterparty@example.test',now(),'{}'),
 ('30000000-0000-0000-0000-000000000003','unrelated@example.test',now(),'{}');

set local role anon;
select pg_temp.assert_true((select count(*)=3 from public.lego_sets where catalog_source='fixture'),'anon catalogue read');
select pg_temp.assert_true(not has_table_privilege('anon','public.profiles','select'),'anon has no private-profile table grant');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into collection_items(user_id,set_number,available_for_exchange) values
 ('10000000-0000-0000-0000-000000000001','75192-1',true);
insert into wishlists(user_id,set_number) values
 ('10000000-0000-0000-0000-000000000001','10307-1');
select pg_temp.assert_true((select count(*)=1 from growth_events where user_id=auth.uid() and event_name='collection_added'),'collection growth trigger');
select pg_temp.assert_true((select count(*)=1 from growth_events where user_id=auth.uid() and event_name='wishlist_added'),'wishlist growth trigger');
delete from wishlists where user_id=auth.uid() and set_number='10307-1';
select pg_temp.assert_true(not exists(select 1 from wishlists where user_id=auth.uid() and set_number='10307-1'),'wishlist delete');
select pg_temp.assert_true((select count(*)>0 from bc_search_lego_sets('75192',null,null,20) where set_number='75192-1'),'bare set-number search');
select pg_temp.assert_true((select count(*)>0 from bc_search_lego_sets('Millennium Falcon',null,null,20) where set_number='75192-1'),'model-name search');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000002';
insert into collection_items(user_id,set_number,available_for_exchange) values
 ('20000000-0000-0000-0000-000000000002','10307-1',true);
reset role;

insert into exchange_requests(requester_id,responder_id,offered_item_id,requested_item_id,duration_days)
select '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',a.id,b.id,30
from collection_items a,collection_items b where a.user_id='10000000-0000-0000-0000-000000000001' and b.user_id='20000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
delete from collection_items where user_id=auth.uid() and set_number='75192-1';
select pg_temp.assert_true(not exists(select 1 from exchange_requests),'pending request cascades on collection delete');
insert into collection_items(user_id,set_number,available_for_exchange) values(auth.uid(),'75192-1',true);
reset role;

insert into exchanges(user_a,user_b,item_a,item_b,duration_days,state)
select '10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',a.id,b.id,30,'accepted'
from collection_items a,collection_items b where a.user_id='10000000-0000-0000-0000-000000000001' and b.user_id='20000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
do $$begin
  begin delete from collection_items where user_id=auth.uid() and set_number='75192-1';
    raise exception 'accepted exchange deletion unexpectedly succeeded';
  exception when foreign_key_violation then null; end;
end$$;
reset role;

insert into notifications(user_id,kind,title,body) values('10000000-0000-0000-0000-000000000001','test','Owner','Private');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('avatars','10000000-0000-0000-0000-000000000001/avatar.png','10000000-0000-0000-0000-000000000001','{}');
update storage.objects set metadata='{"updated":true}' where bucket_id='avatars' and name='10000000-0000-0000-0000-000000000001/avatar.png';
select pg_temp.assert_true((select metadata->>'updated'='true' from storage.objects where name='10000000-0000-0000-0000-000000000001/avatar.png'),'avatar owner upload/update');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select count(*)=1 from profiles),'unrelated sees only own private profile');
select pg_temp.assert_true((select count(*)=0 from notifications),'unrelated notification denied');
update storage.objects set metadata='{"attacker":true}' where name='10000000-0000-0000-0000-000000000001/avatar.png';
select pg_temp.assert_true(not exists(select 1 from storage.objects where metadata ? 'attacker'),'unrelated avatar update denied');
select pg_temp.assert_true((select count(*)=3 from public_profiles),'public profile projection visible');
reset role;

set local role service_role;
select pg_temp.assert_true((select count(*)=3 from profiles),'service role bypasses profile RLS');
select pg_temp.assert_true(exists(select 1 from notifications where user_id='10000000-0000-0000-0000-000000000001' and kind='test'),'service role sees owner notification');
reset role;

select pass('phase1 RLS and lifecycle assertions passed');
select * from finish();
rollback;

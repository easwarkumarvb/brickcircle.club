create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if; end $$;

insert into auth.users(id) values
 ('10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002'),
 ('30000000-0000-0000-0000-000000000003');
insert into public.profiles(id,display_name,country,city) values
 ('10000000-0000-0000-0000-000000000001','Ramya','India','Bengaluru'),
 ('20000000-0000-0000-0000-000000000002','Easwar','India','Bengaluru'),
 ('30000000-0000-0000-0000-000000000003','Elsewhere','India','Mumbai');
insert into public.lego_sets(set_number,name) values ('42115-1','Lamborghini Sián'),('21309-1','NASA Apollo Saturn V');

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
insert into public.collection_items(id,user_id,set_number,available_for_exchange) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','42115-1',true);
insert into public.wishlists(user_id,set_number) values ('10000000-0000-0000-0000-000000000001','21309-1');
reset role;

set role authenticated;
set request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';
insert into public.collection_items(id,user_id,set_number,available_for_exchange) values
 ('b0000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','21309-1',true);
insert into public.wishlists(user_id,set_number) values ('20000000-0000-0000-0000-000000000002','42115-1');
reset role;

select pg_temp.assert_true((select count(*)=2 from public.notifications where kind='reciprocal_match'),'one durable match notification is created for each participant');
select pg_temp.assert_true((select count(*)=1 from public.notifications where user_id='10000000-0000-0000-0000-000000000001' and actor_user_id='20000000-0000-0000-0000-000000000002'),'Ramya receives exactly one correctly attributed match event');
select pg_temp.assert_true((select count(*)=1 from public.notifications where user_id='20000000-0000-0000-0000-000000000002' and actor_user_id='10000000-0000-0000-0000-000000000001'),'Easwar receives exactly one correctly attributed match event');
select pg_temp.assert_true((select bool_and(metadata->>'route'='#matches') from public.notifications where kind='reciprocal_match'),'match notifications deep-link to matches');

update public.collection_items set available_for_exchange=true where id='b0000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select count(*)=2 from public.notifications where kind='reciprocal_match'),'repeat detection is deduplicated');

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values
 ('10000000-0000-0000-0000-000000000001','https://push.example/subscription-a','public-key-material-aaaaaaaa','auth-secret-aaaa');
select pg_temp.assert_true((select count(*)=1 from public.push_subscriptions),'user can create and read their own subscription');
do $$ begin
  begin
    insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values
      ('20000000-0000-0000-0000-000000000002','https://push.example/forged','public-key-material-bbbbbbbb','auth-secret-bbbb');
    raise exception 'cross-user subscription insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.assert_true((select count(*)=0 from public.push_subscriptions where user_id='20000000-0000-0000-0000-000000000002'),'user cannot create another user subscription');
reset role;

select pg_temp.assert_true(not has_table_privilege('authenticated','public.push_delivery_log','select'),'delivery logs are server-only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.queue_new_reciprocal_match_notifications(uuid)','execute'),'users cannot invoke reciprocal notification generation');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.detect_new_reciprocal_matches()','execute'),'collection trigger is not a client RPC');
select pg_temp.assert_true((select prosecdef and proconfig && array['search_path=','search_path=""']::text[] from pg_proc where oid='public.queue_new_reciprocal_match_notifications(uuid)'::regprocedure),'reciprocal event function has an empty search_path');

select 'web push database regression assertions passed' as result;

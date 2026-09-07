create or replace function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if;
end;
$$;

insert into public.profiles(id,display_name) values
  ('10000000-0000-0000-0000-000000000001','Ramya'),
  ('20000000-0000-0000-0000-000000000002','Easwar'),
  ('30000000-0000-0000-0000-000000000003','Another Collector');

insert into public.collection_items(id,user_id,set_number,available_for_exchange) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','42115-1',true),
  ('b0000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','21309-1',true);

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
insert into public.exchange_requests(
  id,requester_id,responder_id,offered_item_id,requested_item_id,duration_days
) values (
  'e0000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  60
);

select pg_temp.assert_true(
  (select count(*)=0 from public.notifications where user_id='20000000-0000-0000-0000-000000000002'),
  'requester cannot read responder notification'
);
reset role;

select pg_temp.assert_true(
  (select count(*)=1 from public.notifications where entity_id='e0000000-0000-0000-0000-000000000001'),
  'successful proposal creates exactly one notification'
);
select pg_temp.assert_true(
  (select user_id='20000000-0000-0000-0000-000000000002'
      and actor_user_id='10000000-0000-0000-0000-000000000001'
      and kind='request_received'
      and entity_type='exchange_request'
      and read_at is null
      and title='New exchange proposal'
      and body='Ramya proposed an exchange with you.'
   from public.notifications where entity_id='e0000000-0000-0000-0000-000000000001'),
  'notification identifies the responder, actor, proposal and unread state'
);
select pg_temp.assert_true(
  (select metadata->>'exchange_request_id'='e0000000-0000-0000-0000-000000000001'
      and metadata->>'offered_item_id'='a0000000-0000-0000-0000-000000000001'
      and metadata->>'requested_item_id'='b0000000-0000-0000-0000-000000000002'
      and metadata->>'route'='#exchanges/e0000000-0000-0000-0000-000000000001'
   from public.notifications where entity_id='e0000000-0000-0000-0000-000000000001'),
  'proposal metadata supports a durable deep link'
);

insert into public.notifications(user_id,kind,title,body,actor_user_id,entity_type,entity_id)
values(
  '20000000-0000-0000-0000-000000000002','request_received','duplicate','duplicate',
  '10000000-0000-0000-0000-000000000001','exchange_request','e0000000-0000-0000-0000-000000000001'
)
on conflict (user_id,kind,entity_type,entity_id) where entity_id is not null do nothing;
select pg_temp.assert_true(
  (select count(*)=1 from public.notifications where entity_id='e0000000-0000-0000-0000-000000000001'),
  'logical proposal notification key suppresses duplicates'
);

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.notifications','insert'),
  'normal users cannot fabricate notifications'
);
select pg_temp.assert_true(
  has_column_privilege('authenticated','public.notifications','read_at','update')
    and not has_column_privilege('authenticated','public.notifications','title','update'),
  'normal users may update only read_at'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated','public.notify_new_exchange_request()','execute'),
  'trigger function is not a client API'
);
select pg_temp.assert_true(
  (select p.prosecdef and p.proconfig=array['search_path=']::text[]
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='notify_new_exchange_request'),
  'trigger function is hardened with an empty search_path'
);
select pg_temp.assert_true(
  exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'),
  'notifications are enabled for Realtime delivery'
);

set role authenticated;
set request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';
select pg_temp.assert_true(
  (select count(*)=1 from public.notifications where entity_id='e0000000-0000-0000-0000-000000000001' and read_at is null),
  'offline recipient sees the durable unread proposal after sign-in'
);
update public.notifications set read_at=now() where entity_id='e0000000-0000-0000-0000-000000000001';
select pg_temp.assert_true(
  (select count(*)=0 from public.notifications where entity_id='e0000000-0000-0000-0000-000000000001' and read_at is null),
  'recipient can mark proposal read'
);
reset role;

select pg_temp.assert_true(
  (select count(*)=0 from public.notifications where user_id='10000000-0000-0000-0000-000000000001'),
  'requester does not receive their own proposal notification'
);

set role authenticated;
set request.jwt.claim.sub='30000000-0000-0000-0000-000000000003';
do $$
begin
  begin
    insert into public.exchange_requests(
      requester_id,responder_id,offered_item_id,requested_item_id,duration_days
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000002',
      60
    );
    raise exception 'unauthorized proposal unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select pg_temp.assert_true(
  (select count(*)=1 from public.notifications),
  'failed proposal creates no notification'
);

select 'exchange proposal notification regression assertions passed' as result;

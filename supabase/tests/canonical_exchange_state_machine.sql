\set ON_ERROR_STOP on
begin;
create temporary table test_context(name text primary key,id uuid not null);
grant all on test_context to authenticated;

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000001','a@example.test'),
  ('00000000-0000-4000-8000-000000000002','b@example.test'),
  ('00000000-0000-4000-8000-000000000003','c@example.test'),
  ('00000000-0000-4000-8000-000000000004','d@example.test');
insert into public.profiles(id,display_name,country,city,adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001','A','IN','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000002','B','IN','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000003','C','IN','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000004','D','IN','Bengaluru',now());
insert into public.lego_sets(set_number,name,theme,estimated_value) values
  ('42143-1','Ferrari Daytona SP3','Technic',450),
  ('42172-1','McLaren P1','Technic',450),
  ('10307-1','Eiffel Tower','Icons',500),
  ('10316-1','The Lord of the Rings: Rivendell','Icons',500);
insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,estimated_value,available_for_exchange) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','42143-1','Excellent',100,'a.jpg',450,true),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','42172-1','Excellent',100,'b.jpg',450,true),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','10307-1','Good',100,'c.jpg',500,true),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004','10316-1','Good',100,'d.jpg',500,true);
insert into public.wishlists(user_id,set_number) values
  ('00000000-0000-4000-8000-000000000001','42172-1'),
  ('00000000-0000-4000-8000-000000000002','42143-1'),
  ('00000000-0000-4000-8000-000000000003','10316-1'),
  ('00000000-0000-4000-8000-000000000004','10307-1');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select (public.create_exchange_case(
  '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',60,
  'Let us exchange','create-a-b'
)->'case'->>'id')::uuid as case_id \gset
insert into test_context values('first',:'case_id');

do $$ declare first_id uuid; retry jsonb; begin
  select id into first_id from test_context where name='first';
  retry:=public.create_exchange_case(
    '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',60,
    'Let us exchange','create-a-b');
  if (retry->'case'->>'id')::uuid<>first_id or retry->>'idempotent'<>'true' then raise exception 'proposal retry was not idempotent'; end if;
  retry:=public.create_exchange_case(
    '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',60,
    'duplicate click','create-a-b-second-key');
  if (retry->'case'->>'id')::uuid<>first_id then raise exception 'same physical match created a duplicate case'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.exchange_case_item_locks where case_id=(select id from test_context where name='first'))<>2 then raise exception 'proposal did not soft-hold both physical items'; end if;
end $$;
set local role authenticated;

-- A non-participant cannot read or mutate the aggregate.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
do $$ begin
  if (select count(*) from public.exchange_cases)<>0 then raise exception 'third party can read exchange cases'; end if;
  if has_table_privilege('authenticated','public.exchange_cases','INSERT,UPDATE,DELETE') then raise exception 'browser can mutate exchange cases directly'; end if;
  if has_table_privilege('authenticated','public.exchange_case_events','INSERT,UPDATE,DELETE') then raise exception 'browser can mutate audit events directly'; end if;
  begin
    perform public.exchange_case_transition((select id from test_context where name='first'),1,'accept','third-party-accept','{}');
    raise exception 'third party transition unexpectedly succeeded';
  exception when others then
    if sqlerrm='third party transition unexpectedly succeeded' then raise; end if;
  end;
end $$;

-- Recipient counteroffers inside the same case; proposer then accepts.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),
  'counter','counter-a-b','{"duration_days":30,"message":"Thirty days works better"}');
do $$ begin
  if (select count(*) from public.exchange_cases where id=(select id from test_context where name='first'))<>1 then raise exception 'counter created a second case'; end if;
  begin
    perform public.exchange_case_transition((select id from test_context where name='first'),1,'accept','stale-accept','{}');
    raise exception 'stale transition unexpectedly succeeded';
  exception when others then if sqlerrm='stale transition unexpectedly succeeded' then raise; end if; end;
end $$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'accept','accept-a-b','{}');

-- One canonical meetup, dual safety/arrival/inspection/handoff, then an early return.
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'propose_meetup','meetup-a-b',
  jsonb_build_object('venue_name','Metro station help desk','venue_area','Main concourse','meetup_at',now()+interval '2 days'));
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'accept_meetup','accept-meetup-a-b','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'safety_ack','safety-a','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'safety_ack','safety-b','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'arrive','arrive-a','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'arrive','arrive-b','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'inspect','inspect-a','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'inspect','inspect-b','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'handoff','handoff-a','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'handoff','handoff-b','{}');
reset role;
do $$ begin
  if (select state from public.exchange_cases where id=(select id from test_context where name='first'))<>'ACTIVE' then raise exception 'dual handoff did not activate case'; end if;
  if (select return_due_at::date-handoff_at::date from public.exchange_cases where id=(select id from test_context where name='first'))<>30 then raise exception 'return due date is not anchored to handoff'; end if;
  if (select count(*) from public.exchange_case_item_locks where case_id=(select id from test_context where name='first') and lock_kind='ON_EXCHANGE')<>2 then raise exception 'physical custody lock missing'; end if;
end $$;
set local role authenticated;

select public.send_exchange_case_message(:'case_id','Can we return next week?','message-b-1');
select public.send_exchange_case_message(:'case_id','Can we return next week?','message-b-1');
reset role;
do $$ begin
  if (select count(*) from public.exchange_case_messages where case_id=(select id from test_context where name='first'))<>1 then raise exception 'message retry duplicated content'; end if;
  if (select count(*) from public.notifications where exchange_case_id=(select id from test_context where name='first') and kind='exchange_message')<>1 then raise exception 'message notification was not deduplicated'; end if;
end $$;
set local role authenticated;

select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'early_return','early-return-b','{}');
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'propose_return','return-meetup-b',
  jsonb_build_object('venue_name','Library entrance','venue_area','Security desk','meetup_at',now()+interval '1 day'));
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'accept_return','accept-return-a','{}');
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'return_arrive','return-arrive-a','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'return_arrive','return-arrive-b','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'return_inspect','return-inspect-a','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'return_inspect','return-inspect-b','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000001';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'return_confirm','return-confirm-a','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000002';
select public.exchange_case_transition(:'case_id',(select state_version from public.exchange_cases where id=:'case_id'),'return_confirm','return-confirm-b','{}');
reset role;
do $$ begin
  if (select state from public.exchange_cases where id=(select id from test_context where name='first'))<>'COMPLETED' then raise exception 'dual return did not complete case'; end if;
  if exists(select 1 from public.exchange_case_item_locks where case_id=(select id from test_context where name='first')) then raise exception 'completed case retained item locks'; end if;
  if (select count(*) from public.collection_items where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002') and exchange_review_required)<>2 then raise exception 'returned items were not held for owner review'; end if;
  if (select count(*) from public.notification_email_deliveries) < 1 then raise exception 'durable notification outbox remained empty'; end if;
end $$;
set local role authenticated;

-- Blocking is bilateral for matching and proposal creation.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000003';
insert into public.exchange_user_blocks(blocker_id,blocked_id) values
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004');
do $$ begin
  if exists(select 1 from public.find_matches('00000000-0000-4000-8000-000000000003')) then raise exception 'blocked collector appeared in matching'; end if;
  begin
    perform public.create_exchange_case('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004',60,'blocked','blocked-create');
    raise exception 'blocked exchange unexpectedly succeeded';
  exception when others then if sqlerrm='blocked exchange unexpectedly succeeded' then raise; end if; end;
end $$;
delete from public.exchange_user_blocks where blocker_id='00000000-0000-4000-8000-000000000003' and blocked_id='00000000-0000-4000-8000-000000000004';

-- Pre-handoff cancellation releases both physical holds and restores preferences.
select (public.create_exchange_case('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004',90,'Second case','create-c-d')->'case'->>'id')::uuid as second_case_id \gset
insert into test_context values('second',:'second_case_id');
select public.exchange_case_transition(:'second_case_id',(select state_version from public.exchange_cases where id=:'second_case_id'),'cancel','cancel-c-d','{"reason":"Plans changed"}');
reset role;
do $$ begin
  if exists(select 1 from public.exchange_case_item_locks where case_id=(select id from test_context where name='second')) then raise exception 'cancelled case retained item holds'; end if;
  if (select count(*) from public.collection_items where id in ('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004') and available_for_exchange)<>2 then raise exception 'cancellation did not restore availability preference'; end if;
end $$;

-- Legacy lifecycle procedures and direct workflow table writes are unavailable.
do $$ begin
  if to_regprocedure('public.create_exchange_request(uuid,uuid,integer,text)') is not null
     and has_function_privilege('authenticated', to_regprocedure('public.create_exchange_request(uuid,uuid,integer,text)'), 'EXECUTE')
  then raise exception 'legacy proposal RPC is still executable'; end if;
  if to_regprocedure('public.respond_exchange_request(uuid,text)') is not null
     and has_function_privilege('authenticated', to_regprocedure('public.respond_exchange_request(uuid,text)'), 'EXECUTE')
  then raise exception 'legacy response RPC is still executable'; end if;
  if has_table_privilege('authenticated','public.exchanges','INSERT,UPDATE,DELETE') then raise exception 'legacy lifecycle table remains browser-writable'; end if;
end $$;

rollback;

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if;
end;
$$;

insert into public.profiles(id,display_name) values
  ('71000000-0000-0000-0000-000000000001','Cancel Test A'),
  ('72000000-0000-0000-0000-000000000002','Cancel Test B');

insert into public.collection_items(id,user_id,set_number,available_for_exchange) values
  ('7a000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','42115-1',true),
  ('7b000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000002','21309-1',true);

-- Simulate legacy rows that predate mandatory owner photos, then enable the
-- production guard before cancellation exercises the regression path.
drop trigger if exists bc_require_owner_photo_for_exchange on public.collection_items;
create trigger bc_require_owner_photo_for_exchange
before insert or update of available_for_exchange,owner_photo_path on public.collection_items
for each row execute function public.bc_require_owner_photo_for_exchange();

insert into public.exchange_requests(
  id,requester_id,responder_id,offered_item_id,requested_item_id,duration_days,status
) values (
  '7c000000-0000-0000-0000-000000000003',
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000002',
  '7a000000-0000-0000-0000-000000000001',
  '7b000000-0000-0000-0000-000000000002',
  60,
  'accepted'
);

insert into public.exchanges(
  id,request_id,user_a,user_b,item_a,item_b,duration_days,state
) values (
  '7d000000-0000-0000-0000-000000000004',
  '7c000000-0000-0000-0000-000000000003',
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000002',
  '7a000000-0000-0000-0000-000000000001',
  '7b000000-0000-0000-0000-000000000002',
  60,
  'accepted'
);

set role authenticated;
set request.jwt.claim.sub='71000000-0000-0000-0000-000000000001';
select public.cancel_in_person_exchange('7d000000-0000-0000-0000-000000000004',null);
reset role;

select pg_temp.assert_true(
  (select state='cancelled' from public.exchanges where id='7d000000-0000-0000-0000-000000000004'),
  'pre-handoff cancellation closes the exchange'
);
select pg_temp.assert_true(
  (select status='cancelled' from public.exchange_requests where id='7c000000-0000-0000-0000-000000000003'),
  'pre-handoff cancellation also closes the accepted proposal'
);

set role authenticated;
set request.jwt.claim.sub='71000000-0000-0000-0000-000000000001';
delete from public.collection_items where id='7a000000-0000-0000-0000-000000000001';
reset role;

select pg_temp.assert_true(
  not exists(select 1 from public.collection_items where id='7a000000-0000-0000-0000-000000000001'),
  'owner can remove a set after cancelling before handoff'
);
select pg_temp.assert_true(
  (select item_a is null and item_a_set_number='42115-1'
   from public.exchanges where id='7d000000-0000-0000-0000-000000000004'),
  'terminal exchange detaches live item FK and retains its set snapshot'
);
select pg_temp.assert_true(
  (select offered_item_id is null and offered_item_set_number='42115-1'
   from public.exchange_requests where id='7c000000-0000-0000-0000-000000000003'),
  'terminal proposal detaches live item FK and retains its set snapshot'
);

-- Regression guard: a genuinely pending proposal must still prevent removal.
insert into public.collection_items(id,user_id,set_number,owner_photo_path,available_for_exchange) values
  ('7e000000-0000-0000-0000-000000000005','71000000-0000-0000-0000-000000000001','42083-1','71000000-0000-0000-0000-000000000001/bugatti.jpg',true);
insert into public.exchange_requests(
  id,requester_id,responder_id,offered_item_id,requested_item_id,duration_days,status
) values (
  '7f000000-0000-0000-0000-000000000006',
  '71000000-0000-0000-0000-000000000001',
  '72000000-0000-0000-0000-000000000002',
  '7e000000-0000-0000-0000-000000000005',
  '7b000000-0000-0000-0000-000000000002',
  30,
  'pending'
);

set role authenticated;
set request.jwt.claim.sub='71000000-0000-0000-0000-000000000001';
do $$
begin
  begin
    delete from public.collection_items where id='7e000000-0000-0000-0000-000000000005';
    raise exception 'pending proposal deletion unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;
reset role;

select pg_temp.assert_true(
  exists(select 1 from public.collection_items where id='7e000000-0000-0000-0000-000000000005'),
  'pending proposal still blocks collection removal'
);

insert into public.collection_items(id,user_id,set_number,owner_photo_path,available_for_exchange) values
  ('7e000000-0000-0000-0000-000000000007','71000000-0000-0000-0000-000000000001','42143-1',null,false);
set role authenticated;
set request.jwt.claim.sub='72000000-0000-0000-0000-000000000002';
delete from public.collection_items where id='7e000000-0000-0000-0000-000000000007';
reset role;
select pg_temp.assert_true(
  exists(select 1 from public.collection_items where id='7e000000-0000-0000-0000-000000000007'),
  'RLS prevents a different collector from removing an owned set'
);
select pg_temp.assert_true(
  not has_function_privilege('anon','public.cancel_in_person_exchange(uuid,text)','EXECUTE'),
  'anonymous role cannot execute cancellation RPC'
);
select pg_temp.assert_true(
  has_function_privilege('authenticated','public.cancel_in_person_exchange(uuid,text)','EXECUTE'),
  'authenticated role can execute cancellation RPC'
);
select pg_temp.assert_true(
  exists(select 1 from pg_proc where oid='public.cancel_in_person_exchange(uuid,text)'::regprocedure and 'search_path=public'=any(proconfig)),
  'security-definer cancellation RPC pins search_path to public'
);

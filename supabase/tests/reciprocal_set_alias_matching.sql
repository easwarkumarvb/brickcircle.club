\set ON_ERROR_STOP on

create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin
  if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %',message; end if;
end $$;

insert into public.profiles(id,display_name,country,city) values
  ('10000000-0000-0000-0000-000000000001','Dhyan Easwar','India','Bengaluru'),
  ('20000000-0000-0000-0000-000000000002','Easwar Kumar vb','India','Bangalore'),
  ('30000000-0000-0000-0000-000000000003','Exact Set Collector','India','Bengaluru'),
  ('40000000-0000-0000-0000-000000000004','Different Product Collector','India','Bengaluru'),
  ('50000000-0000-0000-0000-000000000005','Different City Collector','India','Mumbai'),
  ('60000000-0000-0000-0000-000000000006','Unavailable Collector','India','Bengaluru'),
  ('70000000-0000-0000-0000-000000000007','Different Country Collector','United States','Bengaluru');

insert into public.lego_sets(set_number,name,theme,estimated_value) values
  ('42143','Ferrari Daytona SP3','Technic',450),
  ('42143-1','Ferrari Daytona SP3','Technic',450),
  ('21309-1','NASA Apollo Saturn V','Ideas',180),
  ('92176-1','NASA Apollo Saturn V','Ideas',180),
  ('99999-1','NASA Apollo Saturn V Display Stand','Ideas',40),
  ('88888-1','Ferrari Daytona SP3 Display Stand','Technic',40);

insert into public.collection_items(user_id,set_number,available_for_exchange) values
  ('10000000-0000-0000-0000-000000000001','42143',true),
  ('20000000-0000-0000-0000-000000000002','21309-1',true),
  ('30000000-0000-0000-0000-000000000003','92176-1',true),
  ('40000000-0000-0000-0000-000000000004','99999-1',true),
  ('50000000-0000-0000-0000-000000000005','21309-1',true),
  ('60000000-0000-0000-0000-000000000006','21309-1',false),
  ('70000000-0000-0000-0000-000000000007','21309-1',true);

insert into public.wishlists(user_id,set_number) values
  ('10000000-0000-0000-0000-000000000001','92176-1'),
  ('20000000-0000-0000-0000-000000000002','42143-1'),
  ('20000000-0000-0000-0000-000000000002','42143'),
  ('30000000-0000-0000-0000-000000000003','42143'),
  ('40000000-0000-0000-0000-000000000004','88888-1'),
  ('50000000-0000-0000-0000-000000000005','42143-1'),
  ('60000000-0000-0000-0000-000000000006','42143-1'),
  ('70000000-0000-0000-0000-000000000007','42143-1');

select pg_temp.assert_true(
  public.normalize_lego_product_name('  NASA---Apollo  Saturn V ')='nasa apollo saturn v',
  'canonical product-name normalization'
);
select pg_temp.assert_true(
  public.normalize_lego_product_name('NASA Apollo Saturn V')<>public.normalize_lego_product_name('NASA Apollo Saturn V Display Stand'),
  'different product names remain distinct'
);
select pg_temp.assert_true(not has_function_privilege('anon','public.find_matches(uuid)','execute'),'anon cannot execute find_matches');
select pg_temp.assert_true(has_function_privilege('authenticated','public.find_matches(uuid)','execute'),'authenticated can execute find_matches');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.normalize_lego_product_name(text)','execute'),'normalizer is not a client API');

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';

select pg_temp.assert_true((select count(*)=1 from public.find_matches('10000000-0000-0000-0000-000000000001') where match_user='20000000-0000-0000-0000-000000000002'),'alias match appears once despite duplicate wishlist aliases');
select pg_temp.assert_true((select offered_set='42143' and offered_name='Ferrari Daytona SP3' and requested_set='21309-1' and requested_name='NASA Apollo Saturn V' from public.find_matches('10000000-0000-0000-0000-000000000001') where match_user='20000000-0000-0000-0000-000000000002'),'alias match returns the physical collection items and canonical catalogue names');
select pg_temp.assert_true((select count(*)=1 from public.find_matches('10000000-0000-0000-0000-000000000001') where match_user='30000000-0000-0000-0000-000000000003'),'exact set-number reciprocal match remains');
select pg_temp.assert_true((select count(*)=0 from public.find_matches('10000000-0000-0000-0000-000000000001') where match_user='40000000-0000-0000-0000-000000000004'),'different product names do not match');
select pg_temp.assert_true((select count(*)=0 from public.find_matches('10000000-0000-0000-0000-000000000001') where match_user='50000000-0000-0000-0000-000000000005'),'different city does not match');
select pg_temp.assert_true((select count(*)=0 from public.find_matches('10000000-0000-0000-0000-000000000001') where match_user='60000000-0000-0000-0000-000000000006'),'non-exchangeable set does not match');
select pg_temp.assert_true((select count(*)=0 from public.find_matches('10000000-0000-0000-0000-000000000001') where match_user='70000000-0000-0000-0000-000000000007'),'different country does not match');
select pg_temp.assert_true((select count(*)=0 from public.find_matches('20000000-0000-0000-0000-000000000002')),'caller cannot request another user matches');

select match_user,offered_set,offered_name,requested_set,requested_name,match_score
from public.find_matches('10000000-0000-0000-0000-000000000001')
where match_user='20000000-0000-0000-0000-000000000002';

reset role;
set role authenticated;
set request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select count(*)=1 from public.find_matches('20000000-0000-0000-0000-000000000002') where match_user='10000000-0000-0000-0000-000000000001'),'alias reciprocal match appears for counterparty');
select pg_temp.assert_true((select offered_name='NASA Apollo Saturn V' and requested_name='Ferrari Daytona SP3' from public.find_matches('20000000-0000-0000-0000-000000000002') where match_user='10000000-0000-0000-0000-000000000001'),'counterparty names resolve correctly');
reset role;

select 'reciprocal set alias regression assertions passed' as result;

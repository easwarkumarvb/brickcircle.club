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
  ('70000000-0000-0000-0000-000000000007','Different Country Collector','United States','Bengaluru'),
  ('80000000-0000-0000-0000-000000000008','UCS Falcon Owner','India','Bengaluru'),
  ('90000000-0000-0000-0000-000000000009','Other Falcon Wanter','India','Bengaluru'),
  ('a0000000-0000-0000-0000-000000000010','UCS AT-AT Owner','India','Bengaluru'),
  ('b0000000-0000-0000-0000-000000000011','Other AT-AT Wanter','India','Bengaluru');

insert into public.lego_sets(set_number,name,theme,estimated_value) values
  ('42143','Ferrari Daytona SP3','Technic',450),
  ('42143-1','Ferrari Daytona SP3','Technic',450),
  ('21309-1','NASA Apollo Saturn V','Ideas',180),
  ('92176-1','NASA Apollo Saturn V','Ideas',180),
  ('75192-1','Millennium Falcon','Star Wars',850),
  ('7965-1','Millennium Falcon','Star Wars',140),
  ('75313-1','AT-AT','Star Wars',850),
  ('75288-1','AT-AT','Star Wars',170),
  ('99999-1','NASA Apollo Saturn V Display Stand','Ideas',40),
  ('88888-1','Ferrari Daytona SP3 Display Stand','Technic',40);

insert into public.collection_items(user_id,set_number,available_for_exchange) values
  ('10000000-0000-0000-0000-000000000001','42143',true),
  ('20000000-0000-0000-0000-000000000002','21309-1',true),
  ('30000000-0000-0000-0000-000000000003','92176-1',true),
  ('40000000-0000-0000-0000-000000000004','99999-1',true),
  ('50000000-0000-0000-0000-000000000005','21309-1',true),
  ('60000000-0000-0000-0000-000000000006','21309-1',false),
  ('70000000-0000-0000-0000-000000000007','21309-1',true),
  ('80000000-0000-0000-0000-000000000008','75192-1',true),
  ('90000000-0000-0000-0000-000000000009','42143',true),
  ('a0000000-0000-0000-0000-000000000010','75313-1',true),
  ('b0000000-0000-0000-0000-000000000011','42143',true);

insert into public.wishlists(user_id,set_number) values
  ('10000000-0000-0000-0000-000000000001','92176-1'),
  ('20000000-0000-0000-0000-000000000002','42143-1'),
  ('20000000-0000-0000-0000-000000000002','42143'),
  ('30000000-0000-0000-0000-000000000003','42143'),
  ('40000000-0000-0000-0000-000000000004','88888-1'),
  ('50000000-0000-0000-0000-000000000005','42143-1'),
  ('60000000-0000-0000-0000-000000000006','42143-1'),
  ('70000000-0000-0000-0000-000000000007','42143-1'),
  ('80000000-0000-0000-0000-000000000008','42143-1'),
  ('90000000-0000-0000-0000-000000000009','7965-1'),
  ('a0000000-0000-0000-0000-000000000010','42143-1'),
  ('b0000000-0000-0000-0000-000000000011','75288-1');

select pg_temp.assert_true(
  public.canonical_lego_product_identity('42143')=public.canonical_lego_product_identity('42143-1'),
  'bare and standard -1 set-number formats share identity'
);
select pg_temp.assert_true(
  public.canonical_lego_product_identity('21309-1')=public.canonical_lego_product_identity('92176-1'),
  'reviewed Saturn V reissues share explicit identity'
);
select pg_temp.assert_true(
  public.canonical_lego_product_identity('21309')=public.canonical_lego_product_identity('92176-1'),
  'reviewed Saturn V reissues retain bare and -1 formatting equivalence'
);
select pg_temp.assert_true(
  public.canonical_lego_product_identity('75192-1')<>public.canonical_lego_product_identity('7965-1'),
  'different Millennium Falcon set numbers remain distinct'
);
select pg_temp.assert_true(
  public.canonical_lego_product_identity('75313-1')<>public.canonical_lego_product_identity('75288-1'),
  'different AT-AT set numbers remain distinct'
);
select pg_temp.assert_true(not has_function_privilege('anon','public.find_matches(uuid)','execute'),'anon cannot execute find_matches');
select pg_temp.assert_true(has_function_privilege('authenticated','public.find_matches(uuid)','execute'),'authenticated can execute find_matches');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.canonical_lego_product_identity(text)','execute'),'canonical identity helper is not a client API');

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

set role authenticated;
set request.jwt.claim.sub='80000000-0000-0000-0000-000000000008';
select pg_temp.assert_true((select count(*)=0 from public.find_matches('80000000-0000-0000-0000-000000000008') where match_user='90000000-0000-0000-0000-000000000009'),'different Millennium Falcon sets do not alias-match solely by name');
reset role;

set role authenticated;
set request.jwt.claim.sub='a0000000-0000-0000-0000-000000000010';
select pg_temp.assert_true((select count(*)=0 from public.find_matches('a0000000-0000-0000-0000-000000000010') where match_user='b0000000-0000-0000-0000-000000000011'),'different AT-AT sets do not alias-match solely by name');
reset role;

select 'reciprocal set alias regression assertions passed' as result;

-- Isolated CI only. Claims below simulate PostgREST in a disposable PostgreSQL,
-- use real SET ROLE calls, and roll back every fixture. Never run against hosted Auth.
begin;
set local timezone='Asia/Kolkata'; -- every date bucket and window must stay UTC
insert into auth.users(id,email,created_at,email_confirmed_at)
select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'private-'||n||'@example.test',
  case when n=1 then now()-interval '200 days' when n=2 then (date_trunc('day',now() at time zone 'UTC')-interval '6 days') at time zone 'UTC' when n=3 then now() else now()-interval '1 day' end,
  now()-interval '1 minute' from generate_series(1,25) n;
insert into public.profiles(id,display_name,country,city,adult_confirmed_at)
select id,'Collector',case when right(id::text,2) in('04','05') then 'United Kingdom' else 'India' end,case when right(id::text,2)::int>=6 then 'City '||right(id::text,2) else 'Bengaluru' end,now()-interval '1 day' from auth.users;
insert into public.lego_sets(set_number,name) values('fixture','Test');
insert into public.collection_items(id,user_id,set_number,owner_photo_path,available_for_exchange)
select id,id,'fixture',id::text||'/primary.jpg',true from auth.users;
insert into public.wishlists(user_id,set_number) select id,'fixture' from auth.users;
insert into private.exchange_admins(user_id) values('00000000-0000-4000-8000-000000000001');
insert into auth.sessions(id,user_id) values('00000000-0000-4000-9000-000000000001','00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-9000-000000000002','00000000-0000-4000-8000-000000000002');
insert into public.exchange_cases(id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,owner_preference_a,owner_preference_b,created_at,accepted_at,handoff_at,completed_at,return_due_at)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,a.id,b.id,a.id,b.id,a.id,b.id,30,
 case when n in(1,2,3) then 'COMPLETED' when n=4 then 'ACTIVE' else 'PROPOSED' end,true,true,
 case when n=1 then now()-interval '100 days' when n=3 then now() else now()-interval '1 day' end,
 case when n<=4 then now()-interval '1 day' end,case when n<=4 then now()-interval '12 hours' end,
 case when n=1 then now()-interval '90 days' when n=2 then now()-interval '1 hour' when n=3 then now() end,
 now()-interval '1 hour'
from generate_series(1,5) n cross join auth.users a cross join auth.users b
where a.id='00000000-0000-4000-8000-000000000001' and b.id='00000000-0000-4000-8000-000000000002';
insert into public.exchange_case_events(case_id,event_type,resulting_state,actor_user_id,state_version,idempotency_key,created_at)
select id,'fixture',state,case when right(id::text,1)='1' then null else user_a end,1,id::text,now()-interval '1 hour' from public.exchange_cases;
insert into public.exchange_case_issues(case_id,reported_by,subject_user_id,category,description,status,idempotency_key)
select id,user_a,user_b,'other','Private issue fixture','open',id::text from public.exchange_cases where right(id::text,1)='4';
insert into public.exchange_case_issues(case_id,reported_by,subject_user_id,category,description,status,idempotency_key)
select id,user_b,user_a,'other','Second issue same case','unresolved','second-'||id::text from public.exchange_cases where right(id::text,1)='4';
insert into public.exchange_case_support_requests(case_id,requested_by,note,case_state_at_request,case_state_version_at_request,idempotency_key)
select id,user_a,'Private support fixture',state,state_version,id::text from public.exchange_cases where right(id::text,1)='4';
set local role anon;
do $$ begin
  begin perform public.admin_growth_report(7); raise exception 'anon allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  begin perform public.admin_growth_report(7); raise exception 'missing identity allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","session_id":"00000000-0000-4000-9000-000000000002","aal":"aal2","user_metadata":{"admin":true}}',true);
do $$ begin
  begin perform public.admin_growth_report(null); raise exception 'ordinary member allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-9000-000000000001","aal":"aal1"}',true);
do $$ begin
  begin perform public.admin_growth_report(7); raise exception 'AAL1 allowed'; exception when sqlstate 'PT403' then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
do $$ begin
  begin perform public.admin_growth_report(7); raise exception 'missing session allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","session_id":"00000000-0000-4000-9000-000000000001","aal":"aal2"}',true);
do $$ declare r jsonb; n integer; begin
  foreach n in array array[7,28,90] loop
    r:=public.admin_growth_report(n);
    assert r->>'version'='1';
    assert jsonb_array_length(r->'daily')=n;
    assert jsonb_array_length(r->'cities')=20;
    assert (select sum((d->>'registrations')::int) from jsonb_array_elements(r->'daily') d)=(r#>>'{metrics,new_registrations,current}')::int;
    assert (select sum((d->>'completed_exchanges')::int) from jsonb_array_elements(r->'daily') d)=(r#>>'{metrics,completed_exchanges,current}')::int;
    assert length(r::text)<40000;
    assert r::text not like '%@example.test%' and r::text not like '%00000000-%' and r::text not like '%primary.jpg%';
  end loop;
  r:=public.admin_growth_report(7);
  assert (select count(*) from jsonb_array_elements(r->'cities') c where c->>'city'='bengaluru')=2; -- country collision kept separate
  assert (r#>>'{activation,registered}')::int=23;
  assert (r#>>'{activation,email_verified}')::int=23;
  assert (r#>>'{activation,ready}')::int=23;
  assert (r#>>'{metrics,new_registrations,current}')::int=23; -- inclusive start; exclusive end
  assert (r#>>'{metrics,new_registrations,previous}')::int=0;
  assert (r#>>'{metrics,active_exchange_collectors,current}')::int=1; -- NULL system actor excluded
  assert (r#>>'{metrics,completed_exchanges,current}')::int=1; -- now() excluded
  assert (r#>>'{metrics,repeat_collectors,current}')::int=2; -- both repeat participants once
  assert (r#>>'{exchange_cohort,proposed}')::int=3; -- excludes old and end-boundary case
  assert (r#>>'{exchange_cohort,completed}')::int=1;
  assert (r#>>'{health,unresolved_issues}')::int=1; -- two issue rows dedup by case
  assert (r#>>'{health,open_support}')::int=1;
  assert (r#>>'{health,active_custody}')::int=1;
  assert (r#>>'{health,overdue_returns}')::int=1; -- overdue proposed has no actual custody
  assert (select (c->>'completed_exchanges')::int from jsonb_array_elements(r->'cities') c where c->>'city'='bengaluru' and c->>'country'='india')=1; -- two local parties one case
  foreach n in array array[0,1,8,365] loop
    begin perform public.admin_growth_report(n); raise exception 'invalid days allowed'; exception when invalid_parameter_value then null; end;
  end loop;
  begin perform public.admin_growth_report(null); raise exception 'null days allowed'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
update auth.sessions set not_after=now()-interval '1 second' where id='00000000-0000-4000-9000-000000000001';
set local role authenticated;
do $$ begin begin perform public.admin_growth_report(); raise exception 'expired session allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
delete from auth.sessions where id='00000000-0000-4000-9000-000000000001';
set local role authenticated;
do $$ begin begin perform public.admin_growth_report(); raise exception 'revoked session allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
insert into auth.sessions(id,user_id) values('00000000-0000-4000-9000-000000000001','00000000-0000-4000-8000-000000000001');
delete from private.exchange_admins;
set local role authenticated;
do $$ begin begin perform public.admin_growth_report(); raise exception 'revoked allowlist allowed'; exception when insufficient_privilege then null; end; end $$;
reset role;
rollback;

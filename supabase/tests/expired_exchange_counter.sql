\set ON_ERROR_STOP on
begin;

do $$ declare transition_oid oid:='public.exchange_case_transition(uuid,bigint,text,text,jsonb)'::regprocedure; begin
  if not (select prosecdef and proconfig && array['search_path=','search_path=""']::text[]
          from pg_catalog.pg_proc where oid=transition_oid) then
    raise exception 'Transition must remain SECURITY DEFINER with an empty search_path';
  end if;
  if not pg_catalog.has_function_privilege('authenticated',transition_oid,'EXECUTE')
     or pg_catalog.has_function_privilege('anon',transition_oid,'EXECUTE') then
    raise exception 'Transition execution grants changed';
  end if;
end $$;

create temporary table counter_test_context(name text primary key,case_id uuid not null unique);
grant all on counter_test_context to authenticated;

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000058','counter-058@example.test'),
  ('00000000-0000-4000-8000-000000000059','counter-059@example.test'),
  ('00000000-0000-4000-8000-000000000060','counter-060@example.test'),
  ('00000000-0000-4000-8000-000000000061','counter-061@example.test'),
  ('00000000-0000-4000-8000-000000000062','counter-062@example.test'),
  ('00000000-0000-4000-8000-000000000063','counter-063@example.test'),
  ('00000000-0000-4000-8000-000000000064','counter-064@example.test'),
  ('00000000-0000-4000-8000-000000000065','counter-065@example.test'),
  ('00000000-0000-4000-8000-000000000066','counter-066@example.test'),
  ('00000000-0000-4000-8000-000000000067','counter-067@example.test');

insert into public.profiles(id,display_name,country,city,adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000058','Counter 058','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000059','Counter 059','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000060','Counter 060','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000061','Counter 061','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000062','Counter 062','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000063','Counter 063','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000064','Counter 064','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000065','Counter 065','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000066','Counter 066','IN','Bengaluru',pg_catalog.now()),
  ('00000000-0000-4000-8000-000000000067','Counter 067','IN','Bengaluru',pg_catalog.now());

insert into public.lego_sets(set_number,name,theme) values
  ('counter-regression-01','Counter Regression 01','Test'),
  ('counter-regression-02','Counter Regression 02','Test'),
  ('counter-regression-03','Counter Regression 03','Test'),
  ('counter-regression-04','Counter Regression 04','Test'),
  ('counter-regression-05','Counter Regression 05','Test'),
  ('counter-regression-06','Counter Regression 06','Test'),
  ('counter-regression-07','Counter Regression 07','Test'),
  ('counter-regression-08','Counter Regression 08','Test'),
  ('counter-regression-09','Counter Regression 09','Test'),
  ('counter-regression-10','Counter Regression 10','Test');

insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,available_for_exchange) values
  ('61000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000058','counter-regression-01','Good',100,'counter-test/01.jpg',true),
  ('61000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000059','counter-regression-02','Good',100,'counter-test/02.jpg',true),
  ('61000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000060','counter-regression-03','Good',100,'counter-test/03.jpg',true),
  ('61000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000061','counter-regression-04','Good',100,'counter-test/04.jpg',true),
  ('61000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000062','counter-regression-05','Good',100,'counter-test/05.jpg',true),
  ('61000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000063','counter-regression-06','Good',100,'counter-test/06.jpg',true),
  ('61000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000064','counter-regression-07','Good',100,'counter-test/07.jpg',true),
  ('61000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000065','counter-regression-08','Good',100,'counter-test/08.jpg',true),
  ('61000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000066','counter-regression-09','Good',100,'counter-test/09.jpg',true),
  ('61000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000067','counter-regression-10','Good',100,'counter-test/10.jpg',true);

insert into public.wishlists(user_id,set_number) values
  ('00000000-0000-4000-8000-000000000058','counter-regression-02'),
  ('00000000-0000-4000-8000-000000000059','counter-regression-01'),
  ('00000000-0000-4000-8000-000000000060','counter-regression-04'),
  ('00000000-0000-4000-8000-000000000061','counter-regression-03'),
  ('00000000-0000-4000-8000-000000000062','counter-regression-06'),
  ('00000000-0000-4000-8000-000000000063','counter-regression-05'),
  ('00000000-0000-4000-8000-000000000064','counter-regression-08'),
  ('00000000-0000-4000-8000-000000000065','counter-regression-07'),
  ('00000000-0000-4000-8000-000000000066','counter-regression-10'),
  ('00000000-0000-4000-8000-000000000067','counter-regression-09');

set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000058';
insert into counter_test_context values
  ('expired',(public.create_exchange_case('61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',60,'Expired counter test','counter-regression-create-1')->'case'->>'id')::uuid);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000060';
insert into counter_test_context values
  ('boundary',(public.create_exchange_case('61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000004',60,'Boundary counter test','counter-regression-create-2')->'case'->>'id')::uuid);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000062';
insert into counter_test_context values
  ('future',(public.create_exchange_case('61000000-0000-4000-8000-000000000005','61000000-0000-4000-8000-000000000006',60,'Future counter test','counter-regression-create-3')->'case'->>'id')::uuid);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000064';
insert into counter_test_context values
  ('decline',(public.create_exchange_case('61000000-0000-4000-8000-000000000007','61000000-0000-4000-8000-000000000008',60,'Expired decline test','counter-regression-create-4')->'case'->>'id')::uuid);
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000066';
insert into counter_test_context values
  ('withdraw',(public.create_exchange_case('61000000-0000-4000-8000-000000000009','61000000-0000-4000-8000-000000000010',60,'Expired withdrawal test','counter-regression-create-5')->'case'->>'id')::uuid);
reset role;

update public.exchange_cases c
set response_deadline=case ctx.name
  when 'expired' then pg_catalog.now()-interval '1 second'
  when 'boundary' then pg_catalog.now()
  when 'future' then pg_catalog.now()+interval '1 day'
  else pg_catalog.now()-interval '1 day'
end
from counter_test_context ctx where ctx.case_id=c.id;

create temporary table late_counter_before as
select c.id,pg_catalog.to_jsonb(c) as case_row,
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.item_id),'[]'::jsonb)
   from public.exchange_case_item_locks l where l.case_id=c.id) as item_locks,
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.id),'[]'::jsonb)
   from public.exchange_case_events e where e.case_id=c.id) as events,
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(n) order by n.id),'[]'::jsonb)
   from public.notifications n where n.exchange_case_id=c.id) as in_app_notifications,
  (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.id),'[]'::jsonb)
   from public.notification_email_deliveries d
   join public.notifications n on n.id=d.notification_id
   where n.exchange_case_id=c.id) as email_outbox
from public.exchange_cases c join counter_test_context ctx on ctx.case_id=c.id
where ctx.name in ('expired','boundary');

-- A late counter must fail before changing any lifecycle or delivery evidence.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000059';
do $$ begin
  begin
    perform public.exchange_case_transition(
      (select case_id from counter_test_context where name='expired'),1,'counter','late-counter-expired','{"duration_days":30}');
    raise exception 'regression: expired counter unexpectedly succeeded';
  exception when others then
    if sqlerrm='This proposal has expired' then null;
    elsif sqlerrm='regression: expired counter unexpectedly succeeded' then raise;
    else raise;
    end if;
  end;
end $$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
do $$ begin
  begin
    perform public.exchange_case_transition(
      (select case_id from counter_test_context where name='boundary'),1,'counter','late-counter-boundary','{"duration_days":30}');
    raise exception 'regression: boundary counter unexpectedly succeeded';
  exception when others then
    if sqlerrm='This proposal has expired' then null;
    elsif sqlerrm='regression: boundary counter unexpectedly succeeded' then raise;
    else raise;
    end if;
  end;
end $$;

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000057';
do $$ begin
  begin
    perform public.exchange_case_transition(
      (select case_id from counter_test_context where name='future'),1,'counter','outsider-counter','{"duration_days":30}');
    raise exception 'regression: authenticated outsider unexpectedly succeeded';
  exception when others then
    if sqlerrm='Exchange case unavailable' then null;
    elsif sqlerrm='regression: authenticated outsider unexpectedly succeeded' then raise;
    else raise;
    end if;
  end;
end $$;

reset role;
do $$ declare prior late_counter_before%rowtype; current_case public.exchange_cases%rowtype; begin
  for prior in select * from late_counter_before loop
    select * into current_case from public.exchange_cases where id=prior.id;
    if pg_catalog.to_jsonb(current_case) is distinct from prior.case_row
       or (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(l) order by l.item_id),'[]'::jsonb)
           from public.exchange_case_item_locks l where l.case_id=prior.id) is distinct from prior.item_locks
       or (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e) order by e.id),'[]'::jsonb)
           from public.exchange_case_events e where e.case_id=prior.id) is distinct from prior.events
       or (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(n) order by n.id),'[]'::jsonb)
           from public.notifications n where n.exchange_case_id=prior.id) is distinct from prior.in_app_notifications
       or (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by d.id),'[]'::jsonb)
           from public.notification_email_deliveries d
           join public.notifications n on n.id=d.notification_id
           where n.exchange_case_id=prior.id) is distinct from prior.email_outbox
       or exists(select 1 from public.exchange_case_events e where e.case_id=prior.id
         and e.idempotency_key in ('late-counter-expired','late-counter-boundary')) then
      raise exception 'Rejected late counter changed case, locks, events, notifications, email outbox, or idempotency entries';
    end if;
  end loop;
end $$;

-- A counter remains available while the proposal deadline is in the future.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000063';
select public.exchange_case_transition(
  (select case_id from counter_test_context where name='future'),1,'counter','future-counter','{"duration_days":30}');
reset role;
do $$ begin
  if (select state_version from public.exchange_cases where id=(select case_id from counter_test_context where name='future'))<>2
     or (select proposer_id from public.exchange_cases where id=(select case_id from counter_test_context where name='future'))<>'00000000-0000-4000-8000-000000000063'
     or (select recipient_id from public.exchange_cases where id=(select case_id from counter_test_context where name='future'))<>'00000000-0000-4000-8000-000000000062'
     or (select count(*) from public.exchange_case_events where case_id=(select case_id from counter_test_context where name='future') and idempotency_key='future-counter')<>1
  then raise exception 'Future-dated counter did not complete the expected transition'; end if;
end $$;

-- Expiry does not prevent a participant from declining or withdrawing.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000065';
select public.exchange_case_transition(
  (select case_id from counter_test_context where name='decline'),1,'decline','expired-decline','{}');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000066';
select public.exchange_case_transition(
  (select case_id from counter_test_context where name='withdraw'),1,'withdraw','expired-withdraw','{}');
reset role;
do $$ begin
  if (select state from public.exchange_cases where id=(select case_id from counter_test_context where name='decline'))<>'DECLINED'
     or (select state from public.exchange_cases where id=(select case_id from counter_test_context where name='withdraw'))<>'WITHDRAWN'
  then raise exception 'Decline or withdrawal was blocked after proposal expiry'; end if;
end $$;

rollback;

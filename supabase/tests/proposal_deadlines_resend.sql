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


create function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if; end $$;
create function pg_temp.resend_rejected(id uuid,actor uuid,key text) returns boolean language plpgsql as $$
declare version bigint; begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select state_version into version from public.exchange_cases where exchange_cases.id=resend_rejected.id;
 begin perform public.resend_exchange_case_invite(id,version,key); exception when others then return true; end;
 return false;
end $$;

select pg_temp.assert_true(has_function_privilege('authenticated','public.resend_exchange_case_invite(uuid,bigint,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.resend_exchange_case_invite(uuid,bigint,text,jsonb)','EXECUTE'),'resend ACL');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.queue_exchange_case_reminders(timestamptz,integer)','EXECUTE'),'queue remains server-only');
-- Boundary and stale/resolved reminder tests use actual tables, triggers and RPCs.
update public.exchange_cases set response_deadline=now()+interval '24 hours' where id=(select case_id from counter_test_context where name='expired');
select pg_temp.assert_true(public.queue_exchange_case_reminders(now(),500)>=1,'24h stage enqueued');
select pg_temp.assert_true(public.queue_exchange_case_reminders(now(),500)=0,'repeat stage deduped');
select pg_temp.assert_true((select count(*)=1 from public.notifications where kind='proposal_reminder'),'single reminder');
select pg_temp.assert_true((select bool_and(user_id=c.recipient_id and metadata->>'stage'='24h') from public.notifications n join public.exchange_cases c on c.id=n.exchange_case_id where kind='proposal_reminder'),'decision maker only');
select pg_temp.assert_true((select bool_and(public.exchange_proposal_notification_current(id)) from public.notifications where kind='proposal_reminder'),'current delivery valid');
select pg_temp.assert_true((select count(*)=1 from public.notification_email_deliveries d join public.notifications n on n.id=d.notification_id where n.kind='proposal_reminder'),'existing email outbox reused');
-- Non-proposal version changes neither requeue nor invalidate reminders.
update public.exchange_cases set state_version=state_version+1 where id=(select case_id from counter_test_context where name='expired');
select pg_temp.assert_true(public.queue_exchange_case_reminders(now(),500)=0,'unrelated version dedup');
select pg_temp.assert_true((select bool_and(public.exchange_proposal_notification_current(id)) from public.notifications where kind='proposal_reminder'),'unrelated version valid');
update public.exchange_cases set response_deadline=now()+interval '2 minutes',proposer_id=user_b,recipient_id=user_a where id=(select case_id from counter_test_context where name='expired');
select pg_temp.assert_true((select not public.exchange_proposal_notification_current(id) from public.notifications where kind='proposal_reminder' limit 1),'old revision suppressed at delivery');
select pg_temp.assert_true(public.queue_exchange_case_reminders(now(),500)=1,'bounded lifetime final stage');
select pg_temp.assert_true((select count(*)=1 from public.notifications where kind='proposal_reminder' and metadata->>'stage'='1h' and body like '%2 minutes%'),'actual remaining wording');
update public.exchange_cases set response_deadline=now() where id=(select case_id from counter_test_context where name='expired');
select pg_temp.assert_true(public.queue_exchange_case_reminders(now(),500)=0,'no reminder at expiry');
select pg_temp.assert_true((select not bool_or(public.exchange_proposal_notification_current(id)) from public.notifications where kind='proposal_reminder'),'expired delivery suppressed');

-- Current counter proposer is B. Recipient and unrelated callers cannot replay its key.
select pg_temp.assert_true(pg_temp.resend_rejected((select case_id from counter_test_context where name='expired'),'00000000-0000-4000-8000-000000000058','resend-one'),'recipient denied');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000059';
select public.resend_exchange_case_invite(c.id,c.state_version,'resend-one') from public.exchange_cases c where id=(select case_id from counter_test_context where name='expired');
select pg_temp.assert_true((public.resend_exchange_case_invite((select case_id from counter_test_context where name='expired'),0,'resend-one')->>'idempotent')::boolean,'replay after case lock');
select pg_temp.assert_true(pg_temp.resend_rejected((select case_id from counter_test_context where name='expired'),'00000000-0000-4000-8000-000000000058','resend-one'),'unauthorized replay denied');
select pg_temp.assert_true(pg_temp.resend_rejected((select case_id from counter_test_context where name='expired'),'00000000-0000-4000-8000-000000000059','early-resend'),'no early extension');
select pg_temp.assert_true((select response_deadline=now()+interval '48 hours' from public.exchange_cases where id=(select case_id from counter_test_context where name='expired')),'normal fresh deadline');
select pg_temp.assert_true((select count(*)=1 from public.exchange_case_events where event_type='proposal_resent'),'one resend event');
select pg_temp.assert_true((select count(*)=1 from public.notifications where title='Exchange invite resent'),'recipient notified once');
select pg_temp.assert_true((select (metadata->>'previous_response_deadline')::timestamptz=now() and metadata->>'previous_cancelled_at' is not null from public.exchange_case_events where event_type='proposal_resent'),'old expiry preserved');
update public.exchange_cases set response_deadline=now() where id=(select case_id from counter_test_context where name='expired');
select public.expire_exchange_cases(100);
select pg_temp.assert_true((select count(*)=2 from public.exchange_case_events where event_type='expire'),'second expiry distinct audit key');
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000059';
select public.resend_exchange_case_invite(c.id,c.state_version,'resend-two') from public.exchange_cases c where id=(select case_id from counter_test_context where name='expired');
select pg_temp.assert_true((select count(*)=2 from public.exchange_case_item_locks where case_id=(select case_id from counter_test_context where name='expired')),'expired holds reacquired');

-- Missing deadlines and every non-resendable state fail closed.
do $$ declare status text; target_id uuid:=(select case_id from counter_test_context where name='boundary'); begin
 update public.exchange_cases set response_deadline=null where exchange_cases.id=target_id;
 perform pg_temp.assert_true(pg_temp.resend_rejected(target_id,'00000000-0000-4000-8000-000000000060','null-deadline'),'null deadline denied');
 foreach status in array array['DECLINED','WITHDRAWN','ACCEPTED','COMPLETED','CANCELLED'] loop
  update public.exchange_cases set state=status,response_deadline=now()-interval '1 day' where exchange_cases.id=target_id;
  perform pg_temp.assert_true(pg_temp.resend_rejected(target_id,'00000000-0000-4000-8000-000000000060','closed-'||status),'closed state denied '||status);
 end loop;
end $$;
-- Eligibility changes cannot reuse an old invitation's assumptions.
do $$ declare target_id uuid:=(select case_id from counter_test_context where name='withdraw'); mutation text; begin
 update public.exchange_cases set response_deadline=now() where id=target_id;
 foreach mutation in array array[
  'update public.collection_items set available_for_exchange=false where id=''61000000-0000-4000-8000-000000000009''',
  'update public.collection_items set exchange_review_required=true where id=''61000000-0000-4000-8000-000000000009''',
  'update public.collection_items set owner_photo_path=null where id=''61000000-0000-4000-8000-000000000010''',
  'update public.collection_items set condition=null where id=''61000000-0000-4000-8000-000000000010''',
  'update public.collection_items set completeness=null where id=''61000000-0000-4000-8000-000000000010''',
  'update public.collection_items set user_id=''00000000-0000-4000-8000-000000000058'' where id=''61000000-0000-4000-8000-000000000010''',
  'update public.profiles set adult_confirmed_at=null where id=''00000000-0000-4000-8000-000000000066''',
  'update public.profiles set city=''Different city'' where id=''00000000-0000-4000-8000-000000000067''',
  'delete from public.wishlists where user_id=''00000000-0000-4000-8000-000000000066''',
  'insert into public.exchange_user_blocks(blocker_id,blocked_id) values(''00000000-0000-4000-8000-000000000066'',''00000000-0000-4000-8000-000000000067'')'
 ] loop
  begin
   perform set_config('brickcircle.workflow_transition','on',true);
   execute mutation;
   perform pg_temp.assert_true(pg_temp.resend_rejected(target_id,'00000000-0000-4000-8000-000000000066','eligibility'),'eligibility change denied: '||mutation);
   raise exception using errcode='PT001',message='rollback eligibility fixture';
  exception when sqlstate 'PT001' then null; end;
 end loop;
end $$;
-- Resolved reminders are invalid even before their original response deadline.
update public.exchange_cases set response_deadline=now()+interval '30 minutes' where id=(select case_id from counter_test_context where name='withdraw');
select public.queue_exchange_case_reminders(now(),500);
update public.exchange_cases set state='DECLINED' where id=(select case_id from counter_test_context where name='withdraw');
select pg_temp.assert_true((select not bool_or(public.exchange_proposal_notification_current(id)) from public.notifications where kind='proposal_reminder' and exchange_case_id=(select case_id from counter_test_context where name='withdraw')),'resolved delivery suppressed');

-- A conflicting manual lock with no case must never be stolen.
update public.exchange_cases set response_deadline=now() where id=(select case_id from counter_test_context where name='future');
update public.exchange_case_item_locks set case_id=null,lock_kind='MANUAL_REVIEW' where item_id='61000000-0000-4000-8000-000000000005';
select pg_temp.assert_true(pg_temp.resend_rejected((select case_id from counter_test_context where name='future'),'00000000-0000-4000-8000-000000000062','conflict'),'manual lock denied');
select pg_temp.assert_true((select case_id is null and lock_kind='MANUAL_REVIEW' from public.exchange_case_item_locks where item_id='61000000-0000-4000-8000-000000000005'),'manual hold intact');
-- Existing overdue return reminders retain both recipients and daily behavior.
update public.exchange_cases set state='ACTIVE',return_due_at=now()-interval '1 day' where id=(select case_id from counter_test_context where name='decline');
select public.queue_exchange_case_reminders(now(),500);
select pg_temp.assert_true((select count(*)=2 from public.notifications where kind='return_overdue'),'overdue returns remain reachable');
select pg_temp.assert_true((select count(*)=1 from cron.job where jobname='brickcircle-proposal-deadlines' and schedule='*/5 * * * *' and active),'actual scheduler registered');
-- With p_limit=1, already delivered proposals AND returns must leave the batch.
-- Isolate five candidates from earlier regression fixtures without deleting history.
update public.exchange_cases set state='DECLINED';
update public.exchange_cases c set state='PROPOSED',response_deadline=now()+interval '36 hours',
 updated_at=now()-interval '5 days'
from counter_test_context ctx where ctx.case_id=c.id and ctx.name in ('expired','boundary','future');
update public.exchange_cases c set state='ACTIVE',return_due_at=now()-interval '1 day',
 updated_at=now()-interval '4 days'
from counter_test_context ctx where ctx.case_id=c.id and ctx.name in ('decline','withdraw');
do $$ declare i integer; total integer:=0; n integer; at_time timestamptz:=now()+interval '1 day'; begin
 for i in 1..5 loop
  n:=public.queue_exchange_case_reminders(at_time,1);
  perform pg_temp.assert_true(n>0,'batch advances to next unnotified case'); total:=total+n;
 end loop;
 perform pg_temp.assert_true(total=7,'three decision makers and both recipients of two returns');
 perform pg_temp.assert_true(public.queue_exchange_case_reminders(at_time,1)=0,'batch drained without duplicates');
 -- Same proposal deadlines now enter the final hour: each advances exactly once again.
 for i in 1..3 loop
  perform pg_temp.assert_true(public.queue_exchange_case_reminders(at_time+interval '11 hours',1)=1,'final-hour stage advances');
 end loop;
 perform pg_temp.assert_true(public.queue_exchange_case_reminders(at_time+interval '11 hours',1)=0,'final-hour stage deduped');
 perform pg_temp.assert_true((select count(*)=6 from public.notifications where kind='proposal_reminder'
  and (metadata->>'response_deadline')::timestamptz=now()+interval '36 hours'),'both proposal stages once for every case');
 perform pg_temp.assert_true(public.queue_exchange_case_reminders(at_time+interval '1 day',1)=2,'first overdue return next daily reminder');
 perform pg_temp.assert_true(public.queue_exchange_case_reminders(at_time+interval '1 day',1)=2,'second overdue return next daily reminder');
 perform pg_temp.assert_true(public.queue_exchange_case_reminders(at_time+interval '1 day',1)=0,'daily overdue return reminders deduped');
end $$;

rollback;

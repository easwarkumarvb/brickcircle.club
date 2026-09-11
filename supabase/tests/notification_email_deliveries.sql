create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'assertion failed: %',message; end if; end $$;

set role service_role;

insert into public.notifications(id,user_id,kind,title,body,entity_type,entity_id) values
 ('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','reciprocal_match','New match','You have a match.','reciprocal_match','b0000000-0000-4000-8000-000000000001'),
 ('a0000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','request_received','New request','You have a request.','exchange_request','b0000000-0000-4000-8000-000000000002'),
 ('a0000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','exchange_accepted','Accepted','Accepted.' ,null,null),
 ('a0000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','exchange_declined','Declined','Declined.',null,null),
 ('a0000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','exchange_cancelled','Cancelled','Cancelled.',null,null),
 ('a0000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','meetup_proposed','Meetup','Meetup proposed.',null,null),
 ('a0000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','swap_started','Started','Swap started.',null,null),
 ('a0000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','return_meetup_proposed','Return meetup','Return meetup proposed.',null,null),
 ('a0000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','return_overdue','Overdue','Return overdue.',null,null),
 ('a0000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','return_dispute','Issue','Return issue.',null,null),
 ('a0000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','return_completed','Completed','Return completed.',null,null),
 ('a0000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','review_received','Review','Review received.',null,null),
 ('a0000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','exchange_status','Status','Low-value generic status.',null,null);

select pg_temp.assert_true((select count(*)=11 from public.notification_email_deliveries),'only allowlisted durable events create email deliveries');
select pg_temp.assert_true((select count(*)=13 from public.notifications),'all in-app notifications remain durable');
select pg_temp.assert_true((select bool_and(recipient_email is null) from public.notification_email_deliveries),'database queue does not copy or trust a browser-supplied address');
select pg_temp.assert_true((select count(*)=0 from public.notification_email_deliveries where notification_kind in ('review_received','exchange_status')),'unsupported notifications never enter the email queue');

do $$ begin
  begin
    insert into public.notification_email_deliveries(notification_id,recipient_user_id,notification_kind)
    values('a0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','reciprocal_match');
    raise exception 'duplicate source delivery unexpectedly succeeded';
  exception when unique_violation then null;
  end;
end $$;
select pg_temp.assert_true((select count(*)=1 from public.notification_email_deliveries where notification_id='a0000000-0000-4000-8000-000000000001'),'a source notification has exactly one email delivery');

do $$ begin
  begin
    insert into public.notifications(id,user_id,kind,title) values('a0000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000001','request_received','rolled back');
    raise exception 'simulate marketplace rollback';
  exception when others then null;
  end;
end $$;
select pg_temp.assert_true((select count(*)=0 from public.notifications where id='a0000000-0000-4000-8000-000000000099'),'failed marketplace transaction leaves no notification');
select pg_temp.assert_true((select count(*)=0 from public.notification_email_deliveries where notification_id='a0000000-0000-4000-8000-000000000099'),'failed marketplace transaction leaves no email delivery');

reset role;

select pg_temp.assert_true(not has_table_privilege('authenticated','public.notification_email_deliveries','select'),'browser roles cannot read delivery logs');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.notification_email_deliveries','insert'),'browser roles cannot create arbitrary email jobs');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.notification_email_deliveries','update'),'browser roles cannot change recipients or statuses');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.claim_notification_email_deliveries(integer,uuid)','execute'),'browser roles cannot claim email jobs');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.enqueue_marketplace_notification_email()','execute'),'email trigger is not a browser RPC');
select pg_temp.assert_true((select prosecdef and proconfig && array['search_path=','search_path=""']::text[] from pg_proc where oid='public.enqueue_marketplace_notification_email()'::regprocedure),'email enqueue function has an empty search_path');
select pg_temp.assert_true((select prosecdef and proconfig && array['search_path=','search_path=""']::text[] from pg_proc where oid='public.claim_notification_email_deliveries(integer,uuid)'::regprocedure),'claim function has an empty search_path');

set role authenticated;
set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*)=13 from public.notifications),'recipient still sees all own in-app notifications');
do $$ begin
  begin
    insert into public.notification_email_deliveries(notification_id,recipient_user_id,notification_kind)
    values('a0000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','request_received');
    raise exception 'browser-created email job unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set role service_role;
select pg_temp.assert_true((select count(*)=1 from public.claim_notification_email_deliveries(1,null)),'worker claims one due delivery');
select pg_temp.assert_true((select count(*)=1 from public.notification_email_deliveries where status='processing' and attempt_count=1),'claim is atomic and increments attempts');
update public.notification_email_deliveries set status='retry',next_attempt_at=pg_catalog.now()-interval '1 second' where status='processing';
select pg_temp.assert_true((select count(*)=1 from public.claim_notification_email_deliveries(1,null)),'transient failure can be retried');
select pg_temp.assert_true((select count(*)=1 from public.notification_email_deliveries where status='processing' and attempt_count=2),'retry increments attempt count once');
update public.notification_email_deliveries set status='permanent_failure',recipient_email='first@example.com',last_error='Brevo HTTP 400' where status='processing';
select pg_temp.assert_true((select count(*)=13 from public.notifications),'email failure never deletes or changes the in-app source');
reset role;

select 'notification email database regression assertions passed' as result;

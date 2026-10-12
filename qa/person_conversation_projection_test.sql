\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000201';
do $$
declare a uuid:='00000000-0000-4000-8000-000000000201'; b uuid:='00000000-0000-4000-8000-000000000202'; c uuid:='00000000-0000-4000-8000-000000000203';
 first record; next record; f record; prev record; n integer:=0; saved jsonb;
begin
 assert (select unread_count from public.list_collector_conversations() where peer_id=b)=1001;
 select * into first from public.list_collector_conversations(null,null,1);
 assert first.peer_id=b;
 select * into next from public.list_collector_conversations(first.last_at,first.peer_id,1);
 assert next.peer_id=c; -- survives >1000 messages with newer peer
 assert (select count(*) from public.collector_conversation_feed(b,null,null,null,100))=100;
 select * into first from public.collector_conversation_feed(b,null,null,null,1);
 select * into next from public.collector_conversation_feed(b,first.occurred_at,first.source_type,first.source_id,1);
 assert next.source_id<>first.source_id;
 saved:=public.mark_collector_conversation_read(b,first.occurred_at,first.source_type,first.source_id);
 assert (select unread_count from public.list_collector_conversations() where peer_id=b)=0;
 perform public.mark_collector_conversation_read(b,next.occurred_at,next.source_type,next.source_id);
 assert (select through_id from public.collector_conversation_read_cursors where peer_id=b)=first.source_id;
 begin perform public.collector_conversation_feed(b,first.occurred_at,null,null,1);raise exception 'Partial cursor accepted';exception when invalid_parameter_value then null;end;
 begin perform public.collector_conversation_feed(b,null,null,null,101);raise exception 'Oversized feed accepted';exception when invalid_parameter_value then null;end;
 begin perform public.list_collector_conversations(null,null,51);raise exception 'Oversized inbox accepted';exception when invalid_parameter_value then null;end;
 begin perform public.mark_collector_conversation_read(b,first.occurred_at+'1 second'::interval,first.source_type,first.source_id);raise exception 'Forged cursor accepted';exception when insufficient_privilege then null;end;
 begin update public.collector_conversation_summaries set unread_count=0;raise exception 'Derived summary write allowed';exception when insufficient_privilege then null;end;
 begin insert into public.collector_conversation_read_cursors(user_id,peer_id,through_at,through_type,through_id) values(b,a,first.occurred_at,first.source_type,first.source_id);raise exception 'Other owner cursor accepted';exception when insufficient_privilege then null;end;
 assert not has_function_privilege('anon','public.list_collector_conversations(timestamptz,uuid,integer)','EXECUTE');

end;$$;
reset role;
-- A newly inserted message after the cursor is unread; deletion decrements and
-- restores latest preview. Correction/backfill before cursor remains read.
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000202';
insert into public.messages(id,sender_id,recipient_id,body,created_at) values
('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000201','New after read','2026-10-02'),
('70000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000201','Late historical backfill','2026-08-01');
do $$ begin
 assert (select unread_count from public.collector_conversation_summaries where user_id='00000000-0000-4000-8000-000000000201' and peer_id='00000000-0000-4000-8000-000000000202')=1;
end;$$;
delete from public.messages where id='70000000-0000-4000-8000-000000000001';
do $$ begin
 assert (select unread_count from public.collector_conversation_summaries where user_id='00000000-0000-4000-8000-000000000201' and peer_id='00000000-0000-4000-8000-000000000202')=0;
 assert not exists(select 1 from public.collector_conversation_entries where source_id='70000000-0000-4000-8000-000000000001');
end;$$;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000203';
do $$ begin
 assert (select count(*) from public.collector_conversation_feed('00000000-0000-4000-8000-000000000202'))=0;
 assert not exists(select 1 from public.collector_conversation_entries where user_id='00000000-0000-4000-8000-000000000201');
end;$$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000051';
do $$ declare cid uuid; result jsonb; replay jsonb; begin
 assert (select count(distinct case_id) from public.collector_conversation_feed('00000000-0000-4000-8000-000000000052',null,null,null,100))>=2;
 assert (select count(*) from public.list_collector_conversations() where peer_id='00000000-0000-4000-8000-000000000052')=1;
 select id into cid from public.exchange_cases where user_a='00000000-0000-4000-8000-000000000051' and user_b='00000000-0000-4000-8000-000000000052' and state not in('COMPLETED','CANCELLED','DECLINED','WITHDRAWN','EXPIRED') limit 1;
 if cid is not null then
 result:=public.send_exchange_case_message(cid,'Projection contextual retry','projection-case-retry');
 replay:=public.send_exchange_case_message(cid,'Projection contextual retry','projection-case-retry');
 assert result->'message'->>'id'=replay->'message'->>'id';
 assert (select count(*) from public.collector_conversation_entries where source_type='case_message' and source_id=(result->'message'->>'id')::uuid)=1;
 end if;
end;$$;
reset role;
do $$ begin
 assert not has_function_privilege('authenticated','private.bc_project_conversation(uuid,uuid,timestamptz,text,uuid,uuid,boolean,boolean)','EXECUTE');
end;$$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000202';
insert into public.messages(id,sender_id,recipient_id,body,created_at) values
 ('70000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000201','Newest restricted','2026-11-01');
create policy "QA deny newest payload" on public.messages as restrictive for select to authenticated
 using(id<>'70000000-0000-4000-8000-000000000099');
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000201';
do $$ declare first record; second record; begin
 assert (select count(*) from public.collector_conversation_feed('00000000-0000-4000-8000-000000000202',null,null,null,100))=100;
 assert not exists(select 1 from public.collector_conversation_feed('00000000-0000-4000-8000-000000000202') where payload->>'body'='Newest restricted');
 select * into first from public.list_collector_conversations(null,null,1);
 assert first.peer_id='00000000-0000-4000-8000-000000000202' and first.last_at='2026-10-01'::timestamptz;
 select * into second from public.list_collector_conversations(first.last_at,first.peer_id,1);
 assert second.peer_id='00000000-0000-4000-8000-000000000203';
 select * into first from public.collector_conversation_feed('00000000-0000-4000-8000-000000000202',null,null,null,1);
 select * into second from public.collector_conversation_feed('00000000-0000-4000-8000-000000000202',first.occurred_at,first.source_type,first.source_id,1);
 assert second.source_id is not null and second.source_id<>first.source_id;
end;$$;
reset role;
rollback;


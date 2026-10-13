-- UNEXECUTED: requires the staged proposal installed in a disposable local DB.
-- Three existing adult profiles + one nonterminal canonical case are required.
-- All fixtures and read cursors roll back. Never run against production.
begin;
do $$
declare a uuid; b uuid; outsider uuid; cid uuid; result jsonb; marker jsonb;
  newest record; older record; page_row record; found_message uuid;
  affected_rows integer; previous_at timestamptz; previous_type text collate "C"; previous_id uuid;
begin
  assert not has_function_privilege('anon','public.collector_conversation_feed(uuid,timestamptz,text,uuid,integer)','EXECUTE');
  assert not has_function_privilege('anon','public.mark_collector_conversation_read(uuid,timestamptz,text,uuid)','EXECUTE');
  assert not has_table_privilege('authenticated','public.collector_conversation_read_cursors','DELETE');
  assert not has_table_privilege('anon','public.collector_conversation_read_cursors','SELECT');
  assert (select not prosecdef from pg_proc where oid='public.collector_conversation_feed(uuid,timestamptz,text,uuid,integer)'::regprocedure);
  assert (select not prosecdef from pg_proc where oid='public.mark_collector_conversation_read(uuid,timestamptz,text,uuid)'::regprocedure);
  select id,user_a,user_b into cid,a,b from public.exchange_cases
    where state not in('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED') order by id limit 1;
  select id into outsider from public.profiles where id not in(a,b) order by id limit 1;
  if cid is null or outsider is null then raise exception 'Disposable DB requires a case and a third collector'; end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  result:=public.send_collector_message(b,'Read model first direct','qa-read-model-direct-1');
  found_message:=(result->'message'->>'id')::uuid;
  perform public.send_collector_message(b,'Read model second direct','qa-read-model-direct-2');
  perform public.send_collector_message(b,'Read model third direct','qa-read-model-direct-3');
  perform public.send_exchange_case_message(cid,'Read model contextual message','qa-read-model-case');
  assert exists(select 1 from public.collector_conversation_feed(b) where source_id=found_message and source_type='direct_message');
  assert (select count(*) from public.collector_conversation_feed(b,null,null,null,2))=2;
  -- Strict tuple ordering also covers equal timestamps across multiple sources.
  for page_row in select * from public.collector_conversation_feed(b,null,null,null,100) loop
    if previous_at is not null then
      assert (page_row.occurred_at,page_row.source_type collate "C",page_row.source_id)
        <(previous_at,previous_type,previous_id);
    end if;
    previous_at:=page_row.occurred_at;previous_type:=page_row.source_type;previous_id:=page_row.source_id;
  end loop;
  select * into newest from public.collector_conversation_feed(b,null,null,null,1);
  select * into older from public.collector_conversation_feed(b,newest.occurred_at,newest.source_type,newest.source_id,1);
  assert older.source_id is not null;
  assert not exists(select 1 from public.collector_conversation_feed(b,newest.occurred_at,newest.source_type,newest.source_id,100)
    where source_type=newest.source_type and source_id=newest.source_id);
  marker:=public.mark_collector_conversation_read(b,newest.occurred_at,newest.source_type,newest.source_id);
  assert marker->>'through_id'=newest.source_id::text;
  marker:=public.mark_collector_conversation_read(b,older.occurred_at,older.source_type,older.source_id);
  assert marker->>'through_id'=newest.source_id::text; -- stale device cannot move RPC cursor backward
  begin perform public.collector_conversation_feed(b,null,null,null,101);raise exception 'Oversize page accepted';exception when invalid_parameter_value then null;end;
  begin perform public.collector_conversation_feed(b,newest.occurred_at,null,null,1);raise exception 'Partial cursor accepted';exception when invalid_parameter_value then null;end;
  begin perform public.mark_collector_conversation_read(b,newest.occurred_at+'1 second'::interval,newest.source_type,newest.source_id);raise exception 'Forged timestamp accepted';exception when insufficient_privilege then null;end;
  begin
    insert into public.collector_conversation_read_cursors(user_id,peer_id,through_at,through_type,through_id)
      values(b,a,newest.occurred_at,newest.source_type,newest.source_id);
    raise exception 'Foreign read cursor insert accepted';
  exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  assert not exists(select 1 from public.collector_conversation_feed(b,null,null,null,100)
    where source_id=found_message or case_id=cid);
  assert (select count(*) from public.collector_conversation_read_cursors where user_id=a)=0;
  begin perform public.mark_collector_conversation_read(b,newest.occurred_at,newest.source_type,newest.source_id);raise exception 'Outsider cursor accepted';exception when insufficient_privilege then null;end;
  update public.collector_conversation_read_cursors set through_at=now() where user_id=a;
  get diagnostics affected_rows=row_count;
  assert affected_rows=0;
  perform set_config('request.jwt.claim.sub',b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  assert exists(select 1 from public.collector_conversation_feed(a) where source_id=found_message);
  assert (select count(*) from public.collector_conversation_read_cursors where user_id=a)=0;
  perform public.mark_collector_conversation_read(a,newest.occurred_at,newest.source_type,newest.source_id);
  assert (select count(*) from public.collector_conversation_read_cursors where user_id=b and peer_id=a)=1;
  execute 'reset role';
end;
$$;
rollback;

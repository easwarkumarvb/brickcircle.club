-- Run against staging with at least 3 profiles and a nonterminal exchange.
-- Fixtures, messages and notifications all roll back.
begin;
do $$
declare a uuid; b uuid; outsider uuid; cid uuid; result jsonb; replay jsonb; mid uuid; before_notes bigint;
begin
  assert not has_function_privilege('anon','public.send_collector_message(uuid,text,text)','EXECUTE');
  assert not has_function_privilege('anon','public.send_exchange_case_message(uuid,text,text)','EXECUTE');
  assert not has_table_privilege('authenticated','public.messages','TRUNCATE');
  select id,user_a,user_b into cid,a,b from public.exchange_cases where state not in('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED') order by id limit 1;
  select id into outsider from public.profiles where id not in(a,b) order by id limit 1;
  if cid is null or outsider is null then raise exception 'Staging requires a case and a third collector'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  result:=public.send_collector_message(b,'  Test direct delivery  ','qa-guided-direct');
  replay:=public.send_collector_message(b,'Test direct delivery','qa-guided-direct');
  assert replay->>'idempotent'='true';assert result->'message'->>'id'=replay->'message'->>'id';
  assert (select count(*) from public.messages where sender_id=a and client_message_key='qa-guided-direct')=1;
  begin perform public.send_collector_message(b,'Different body','qa-guided-direct');raise exception 'Changed replay accepted';exception when invalid_parameter_value then null;end;
  begin perform public.send_collector_message(outsider,'Test direct delivery','qa-guided-direct');raise exception 'Wrong recipient accepted';exception when invalid_parameter_value then null;end;
  begin perform public.send_collector_message(a,'Self message','qa-self');raise exception 'Self message accepted';exception when invalid_parameter_value then null;end;
  begin perform public.send_collector_message(b,' ','qa-blank');raise exception 'Blank accepted';exception when invalid_parameter_value then null;end;
  begin perform public.send_collector_message(b,repeat('x',4001),'qa-long');raise exception 'Oversize accepted';exception when invalid_parameter_value then null;end;
  result:=public.send_exchange_case_message(cid,'Test case delivery','qa-guided-case');
  replay:=public.send_exchange_case_message(cid,'Test case delivery','qa-guided-case');
  assert replay->>'idempotent'='true';assert result->'message'->>'id'=replay->'message'->>'id';
  mid:=(result->'message'->>'id')::uuid;
  begin perform public.send_exchange_case_message(cid,'Changed case delivery','qa-guided-case');raise exception 'Changed case replay accepted';exception when invalid_parameter_value then null;end;
  begin perform public.send_exchange_case_message('00000000-0000-4000-8000-000000000000','Test case delivery','qa-guided-case');raise exception 'Wrong case replay accepted';exception when invalid_parameter_value then null;end;
  begin perform public.send_exchange_case_message(cid,'','qa-blank-case');raise exception 'Blank case accepted';exception when invalid_parameter_value then null;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  assert (select count(*) from public.exchange_case_messages where id=mid)=1;
  assert (select count(*) from public.notifications where exchange_case_message_id=mid and user_id=b)=1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  assert (select count(*) from public.exchange_case_messages where id=mid)=0;
  assert (select count(*) from public.messages where sender_id=a and client_message_key='qa-guided-direct')=0;
  begin perform public.send_exchange_case_message(cid,'Intrusion','qa-outsider');raise exception 'Outsider accepted';exception when insufficient_privilege then null;end;
  execute 'reset role';
end;
$$;
rollback;

-- Run only in a disposable staging project with canonical exchange fixtures.
-- Every fixture change, session, administrator grant and rate-limit row is rolled back.
begin;
do $$
declare a uuid; m uuid; sid uuid:=extensions.gen_random_uuid(); mid uuid:=extensions.gen_random_uuid();
  i integer;
begin
  select id into a from public.profiles order by created_at,id limit 1;
  select id into m from public.profiles where id<>a order by created_at,id limit 1;
  if a is null or m is null then raise exception 'Staging requires two disposable profiles'; end if;
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,a,now(),now()),(mid,m,now(),now());
  insert into private.exchange_admins(user_id) values(a) on conflict do nothing;
  delete from private.exchange_admins where user_id=m;
  assert not has_function_privilege('anon','private.assert_admin_rpc_rate_limit()','EXECUTE');
  assert not has_function_privilege('authenticated','private.assert_admin_rpc_rate_limit()','EXECUTE');
  assert not has_function_privilege('service_role','private.assert_admin_rpc_rate_limit()','EXECUTE');
  assert not has_function_privilege('anon','private.assert_marketplace_admin()','EXECUTE');
  assert not has_table_privilege('anon','private.admin_rpc_rate_limits','SELECT');
  assert not has_table_privilege('authenticated','private.admin_rpc_rate_limits','SELECT');
  assert not has_table_privilege('authenticated','private.admin_rpc_rate_limits','INSERT');
  assert not has_table_privilege('service_role','private.admin_rpc_rate_limits','SELECT');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',mid,'user_metadata',jsonb_build_object('admin',true))::text,true);
  begin perform private.assert_marketplace_admin(); raise exception 'Member admin gate unexpectedly allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  begin perform private.assert_marketplace_admin(); raise exception 'Single factor admin allowed'; exception when sqlstate 'PT403' then null; end;
  assert not exists(select 1 from private.admin_rpc_rate_limits where admin_id=a);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'aal','aal2')::text,true);
  -- Each simulated request clears the transaction-local marker, as a new request transaction would.
  for i in 1..60 loop
    perform private.assert_marketplace_admin();
    perform set_config('brickcircle.admin_rpc_rate_limited','0',true);
  end loop;
  assert (select count(*) from private.admin_rpc_rate_limits where admin_id=a)=1;
  assert (select request_count from private.admin_rpc_rate_limits where admin_id=a)=60;
  begin perform private.assert_marketplace_admin(); raise exception 'Rate limit not enforced'; exception when sqlstate 'PT429' then null; end;
  assert (select request_count from private.admin_rpc_rate_limits where admin_id=a)=60;
  -- Nested admin RPC calls in one request count once.
  update private.admin_rpc_rate_limits set request_count=0 where admin_id=a;
  perform set_config('brickcircle.admin_rpc_rate_limited','0',true);
  perform private.assert_marketplace_admin();
  perform private.assert_marketplace_admin();
  assert (select request_count from private.admin_rpc_rate_limits where admin_id=a)=1;
  -- A gated call whose RPC later fails rolls the count back with the transaction.
  perform set_config('brickcircle.admin_rpc_rate_limited','0',true);
  begin perform public.admin_marketplace_read('bogus'); raise exception 'Unknown section allowed'; exception when invalid_parameter_value then null; end;
  assert (select request_count from private.admin_rpc_rate_limits where admin_id=a)=1;
  perform set_config('brickcircle.admin_rpc_rate_limited','0',true);
  perform private.assert_marketplace_admin();
  assert (select request_count from private.admin_rpc_rate_limits where admin_id=a)=2;
  -- Stale rows are cleaned and the fixed window restarts.
  update private.admin_rpc_rate_limits set window_start=now()-interval '2 hours',request_count=59 where admin_id=a;
  perform set_config('brickcircle.admin_rpc_rate_limited','0',true);
  perform private.assert_marketplace_admin();
  assert (select request_count from private.admin_rpc_rate_limits where admin_id=a)=1;
  assert (select window_start from private.admin_rpc_rate_limits where admin_id=a)=date_trunc('minute',now());
end;
$$;
rollback;
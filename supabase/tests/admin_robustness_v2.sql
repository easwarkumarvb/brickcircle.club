-- DISPOSABLE STAGING ONLY: tteyypklldgwwicrgjzt. Execute as postgres via the
-- approved connector. Real SET LOCAL ROLE calls below exercise authenticated
-- grants, not merely forged JWT claims under the postgres role. All changes roll back.
begin;
do $$
declare a uuid; m uuid; sid uuid:=extensions.gen_random_uuid(); mid uuid:=extensions.gen_random_uuid();
  cid uuid; support_id uuid; note_request uuid:=extensions.gen_random_uuid(); status_id uuid:=extensions.gen_random_uuid();
  result jsonb; again jsonb; expected text[]; seen text[]; n integer; part text; mode text; original_state text;
begin
  select id into a from public.profiles order by created_at,id limit 1;
  select id into m from public.profiles where id<>a order by created_at,id limit 1;
  select id,state into cid,original_state from public.exchange_cases order by created_at,id limit 1;
  if a is null or m is null or cid is null then raise exception 'Requires two disposable profiles and an exchange fixture'; end if;
  insert into auth.sessions(id,user_id,created_at,updated_at) values(sid,a,now(),now()),(mid,m,now(),now());
  insert into private.exchange_admins(user_id) values(a) on conflict do nothing;
  delete from private.exchange_admins where user_id=m;
  assert not has_function_privilege('anon','public.admin_marketplace_read_v2(text,text,integer,text,jsonb,text)','EXECUTE');
  assert not has_function_privilege('anon','public.admin_support_note(uuid,text,uuid)','EXECUTE');
  assert not has_function_privilege('anon','public.admin_support_detail_v2(uuid,integer,text)','EXECUTE');
  assert not has_table_privilege('authenticated','private.marketplace_admin_audit','SELECT');

  insert into public.lego_sets(set_number,name) select 'robustness-'||g||'-1','Staging pagination fixture' from generate_series(1,130) g on conflict do nothing;
  insert into public.collection_items(user_id,set_number,created_at,available_for_exchange)
    select a,'robustness-'||g||'-1','2026-01-01T00:00:00Z'::timestamptz,false from generate_series(1,130) g on conflict(user_id,set_number) do nothing;
  insert into public.wishlists(user_id,set_number,created_at)
    select a,'robustness-'||g||'-1','2026-01-01T00:00:00Z'::timestamptz from generate_series(1,130) g on conflict(user_id,set_number) do nothing;
  insert into public.exchange_case_events(case_id,event_type,resulting_state,state_version,idempotency_key,created_at)
    select cid,'staging_pagination',original_state,1,'robustness:'||extensions.gen_random_uuid(), '2026-01-01T00:00:00Z'::timestamptz from generate_series(1,130);
  insert into public.exchange_case_support_requests(case_id,requested_by,category,note,case_state_at_request,case_state_version_at_request,idempotency_key,created_at)
    select id,user_a,'other','Submitted <img src=x onerror=bad()>',state,state_version,extensions.gen_random_uuid()::text,now()-interval '8 days'
    from public.exchange_cases where id=cid returning id into support_id;

  -- Real ordinary-member role, including editable forged metadata.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',mid,'aal','aal2','user_metadata',jsonb_build_object('admin',true))::text,true);
  execute 'set local role authenticated'; assert current_user='authenticated';
  begin perform public.admin_marketplace_read_v2(); raise exception 'Member read allowed'; exception when insufficient_privilege then null; end;
  begin perform public.admin_support_detail_v2(support_id); raise exception 'Member detail allowed'; exception when insufficient_privilege then null; end;
  begin perform public.admin_support_note(support_id,'Internal staging note',note_request); raise exception 'Member note allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'aal','aal1')::text,true);
  execute 'set local role authenticated';
  begin perform public.admin_marketplace_read_v2(); raise exception 'AAL1 read allowed'; exception when sqlstate 'PT403' then null; end;
  begin perform public.admin_support_detail_v2(support_id); raise exception 'AAL1 detail allowed'; exception when sqlstate 'PT403' then null; end;
  begin perform public.admin_support_note(support_id,'Internal staging note',note_request); raise exception 'AAL1 note allowed'; exception when sqlstate 'PT403' then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'aal','aal2')::text,true);

  foreach part in array array['collection','wishlist','events'] loop
    if part='collection' then select array_agg(id::text order by created_at desc,id) into expected from public.collection_items where user_id=a;
    elsif part='wishlist' then select array_agg(id::text order by created_at desc,id) into expected from public.wishlists where user_id=a;
    else select array_agg(id::text order by state_version desc,created_at desc,id) into expected from public.exchange_case_events where case_id=cid; end if;
    seen:=array[]::text[];n:=0;
    execute 'set local role authenticated';
    loop
      result:=case when part='events' then public.admin_marketplace_read_v2('exchange_detail','',n,cid::text)
        else public.admin_marketplace_read_v2('member_detail','',n,a::text,'{}',part) end;
      assert (result->>'total')::int=array_length(expected,1);
      assert jsonb_array_length(result->'rows')<=25;
      seen:=seen||coalesce((select array_agg(e->>'id' order by ord) from jsonb_array_elements(result->'rows') with ordinality t(e,ord)),array[]::text[]);
      exit when (n+1)*25 >= (result->>'total')::int;n:=n+1;
    end loop;
    assert seen=expected;assert array_length(seen,1)>=130;
    execute 'reset role';
  end loop;

  execute 'set local role authenticated';
  result:=public.admin_marketplace_read_v2('support',support_id::text,0,null,'{"status":"open","age":"older_7_days"}');
  assert (result->>'total')::int=1;
  result:=public.admin_marketplace_read_v2('support',support_id::text,0,null,'{"age":"older_30_days"}');assert (result->>'total')::int=0;
  result:=public.admin_marketplace_read_v2('exchanges',cid::text,0,null,jsonb_build_object('stage',original_state));assert (result->>'total')::int=1;
  begin perform public.admin_marketplace_read_v2('support','',0,null,'{"sql":"true"}');raise exception 'Unknown filter allowed';exception when invalid_parameter_value then null;end;
  begin perform public.admin_marketplace_read_v2('support','',0,null,'{"status":null}');raise exception 'Null filter allowed';exception when invalid_parameter_value then null;end;
  begin perform public.admin_marketplace_read_v2('exchanges','',0,null,'{"overdue":"true"}');raise exception 'Wrong filter type allowed';exception when invalid_parameter_value then null;end;
  begin perform public.admin_marketplace_read_v2('member_detail','',-1,a::text,'{}','collection');raise exception 'Negative page allowed';exception when invalid_parameter_value then null;end;
  result:=public.admin_support_note(support_id,'Internal note <script>unsafe</script>',note_request);
  again:=public.admin_support_note(support_id,'Internal note <script>unsafe</script>',note_request);
  assert (again->>'replayed')::boolean;assert result->>'audit_id'=again->>'audit_id';
  begin perform public.admin_support_note(support_id,'Different payload text',note_request);raise exception 'Conflicting note replay allowed';exception when serialization_failure then null;end;
  begin perform public.admin_marketplace_mutate('support',support_id::text,'resolved',0,'Internal note <script>unsafe</script>',note_request);raise exception 'Cross-action replay allowed';exception when serialization_failure then null;end;
  result:=public.admin_support_detail_v2(support_id);assert result->'rows'->0->>'action'='support_note';assert result->'request'->>'status'='open';assert (result->'request'->>'revision')::int=0;
  result:=public.admin_marketplace_mutate('support',support_id::text,'in_progress',0,'Investigating internal triage',status_id);
  again:=public.admin_marketplace_mutate('support',support_id::text,'in_progress',0,'Investigating internal triage',status_id);assert (again->>'replayed')::boolean;
  begin perform public.admin_marketplace_mutate('support',support_id::text,'resolved',0,'Stale internal revision',extensions.gen_random_uuid());raise exception 'Stale revision allowed';exception when serialization_failure then null;end;
  begin perform public.admin_support_note(support_id,'Investigating internal triage',status_id);raise exception 'Status-to-note replay allowed';exception when serialization_failure then null;end;
  perform public.admin_marketplace_mutate('support',support_id::text,'resolved',1,'Internal workflow completed',extensions.gen_random_uuid());
  result:=public.admin_support_detail_v2(support_id);assert result->'request'->>'status'='resolved';assert (result->>'total')::int=3;
  result:=public.admin_support_detail_v2(support_id,0,'events');assert (result->>'total')::int>=130;
  -- Original RPC signature still executes, with its original detail response shape.
  result:=public.admin_marketplace_read('member_detail','',0,a::text);assert result ? 'collection';
  execute 'reset role';
  assert (select count(*) from private.marketplace_admin_audit where actor_id=a and request_id=note_request)=1;
  assert (select state from public.exchange_cases where id=cid)=original_state;
  assert (select closed_at from public.exchange_case_support_requests where id=support_id) is null;
  assert not exists(select 1 from private.marketplace_admin_revisions where entity_type='support' and entity_id=support_id::text and revision<>2);

  -- Request IDs are actor-scoped, including the same UUID on the same request.
  insert into private.exchange_admins(user_id) values(m) on conflict do nothing;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',mid,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  result:=public.admin_support_note(support_id,'Second administrator independent note',note_request);
  assert not (result->>'replayed')::boolean;
  again:=public.admin_support_note(support_id,'Second administrator independent note',note_request);assert (again->>'replayed')::boolean;
  execute 'reset role';
  assert (select count(*) from private.marketplace_admin_audit where request_id=note_request)=2;
  delete from private.exchange_admins where user_id=m;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sid,'aal','aal2')::text,true);
  execute 'set local role authenticated';
  for n in 1..30 loop perform public.admin_support_note(support_id,'Tied timestamp history note '||n,extensions.gen_random_uuid());end loop;
  execute 'reset role';
  select array_agg(id::text order by created_at desc,id) into expected from private.marketplace_admin_audit where entity_type='support' and entity_id=support_id::text;
  seen:=array[]::text[];n:=0;
  execute 'set local role authenticated';
  loop
    result:=public.admin_support_detail_v2(support_id,n,'history');assert (result->>'total')::int=34;assert jsonb_array_length(result->'rows')<=25;
    seen:=seen||coalesce((select array_agg(e->>'id' order by ord) from jsonb_array_elements(result->'rows') with ordinality t(e,ord)),array[]::text[]);
    exit when (n+1)*25 >= (result->>'total')::int;n:=n+1;
  end loop;
  assert seen=expected;
  execute 'reset role';

  foreach mode in array array['expired','revoked_session','revoked_admin'] loop
    if mode='expired' then update auth.sessions set not_after=now()-interval '1 second' where id=sid;
    elsif mode='revoked_session' then delete from auth.sessions where id=sid;
    else insert into auth.sessions(id,user_id) values(sid,a);delete from private.exchange_admins where user_id=a;end if;
    execute 'set local role authenticated';
    begin perform public.admin_marketplace_read_v2();raise exception 'Invalid session/admin read allowed';exception when insufficient_privilege then null;end;
    begin perform public.admin_support_detail_v2(support_id);raise exception 'Invalid session/admin detail allowed';exception when insufficient_privilege then null;end;
    begin perform public.admin_support_note(support_id,'Internal staging note',extensions.gen_random_uuid());raise exception 'Invalid session/admin note allowed';exception when insufficient_privilege then null;end;
    execute 'reset role';
  end loop;
end;
$$;
rollback;

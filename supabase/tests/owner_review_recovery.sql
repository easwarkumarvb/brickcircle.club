\set ON_ERROR_STOP on
begin;

-- Owner-review recovery: a terminal canonical case plus a legacy disputed
-- row must not block set_exchange_item_availability(true) once the legacy
-- bc_guard_collection_exchangeability trigger is retired. A canonical item
-- lock must still block recovery.

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000061','recovery-a@example.test'),
  ('00000000-0000-4000-8000-000000000062','recovery-b@example.test');

insert into public.profiles(id,display_name,country,city,adult_confirmed_at) values
  ('00000000-0000-4000-8000-000000000061','Recovery A','IN','Bengaluru',now()),
  ('00000000-0000-4000-8000-000000000062','Recovery B','IN','Bengaluru',now());

insert into public.lego_sets(set_number,name,theme,estimated_value) values
  ('21309-1','NASA Apollo Saturn V','Ideas',400),
  ('42143-1','Ferrari Daytona SP3','Technic',450),
  ('42172-1','McLaren P1','Technic',450);

-- Item 1: owner-review hold, no active workflow (recovery target).
insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,available_for_exchange,exchange_review_required) values
  ('61000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061','21309-1','Excellent',100,'61/saturn.jpg',false,true);

-- Item 2: companion for the completed case.
insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,available_for_exchange,exchange_review_required) values
  ('61000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000062','42143-1','Excellent',100,'62/ferrari.jpg',false,true);

-- Item 3: has an active canonical lock (recovery must be blocked).
insert into public.collection_items(id,user_id,set_number,condition,completeness,owner_photo_path,available_for_exchange,exchange_review_required) values
  ('61000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000061','42172-1','Excellent',100,'61/mclaren.jpg',false,true);

-- Set up canonical cases and locks as the table owner (bypasses RLS).
-- Terminal canonical case (COMPLETED) referencing item 1.
insert into public.exchange_cases(id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,state_version,owner_preference_a,owner_preference_b,created_at,updated_at) values
  ('62000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',30,'COMPLETED',5,true,true,now(),now());

-- Non-terminal canonical case (PROPOSED) referencing item 3.
insert into public.exchange_cases(id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,state_version,owner_preference_a,owner_preference_b,created_at,updated_at) values
  ('62000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062','61000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062',30,'PROPOSED',1,true,true,now(),now());

-- Canonical item lock for item 3 (PROPOSAL_PENDING).
insert into public.exchange_case_item_locks(item_id,case_id,lock_kind) values
  ('61000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000002','PROPOSAL_PENDING');

-- Legacy disputed row in public.exchanges (audit-only, must not block recovery).
insert into public.exchanges(id,request_id,user_a,user_b,item_a,item_b,duration_days,state,created_at,updated_at) values
  ('63000000-0000-4000-8000-000000000001',null,'00000000-0000-4000-8000-000000000061','00000000-0000-4000-8000-000000000062','61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',30,'disputed',now(),now());

-- The legacy trigger must be dropped.
do $$ begin
  if exists(select 1 from pg_trigger where tgname='bc_guard_collection_exchangeability' and tgrelid='public.collection_items'::regclass) then
    raise exception 'legacy trigger bc_guard_collection_exchangeability still exists on collection_items';
  end if;
end $$;

-- Canonical guards must still be in place.
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='bc_guard_collection_case_fields' and tgrelid='public.collection_items'::regclass) then
    raise exception 'canonical guard bc_guard_collection_case_fields was dropped';
  end if;
  if not exists(select 1 from pg_trigger where tgname='bc_guard_collection_case_delete' and tgrelid='public.collection_items'::regclass) then
    raise exception 'canonical guard bc_guard_collection_case_delete was dropped';
  end if;
end $$;

-- Scenario A: legacy disputed row does not block owner recovery.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
select public.set_exchange_item_availability('61000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select available_for_exchange from public.collection_items where id='61000000-0000-4000-8000-000000000001') <> true then
    raise exception 'owner recovery did not make the item available';
  end if;
  if (select exchange_review_required from public.collection_items where id='61000000-0000-4000-8000-000000000001') <> false then
    raise exception 'owner recovery did not clear exchange_review_required';
  end if;
end $$;
reset role;

-- Scenario B: canonical item lock still blocks recovery.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
do $$ begin
  begin
    perform public.set_exchange_item_availability('61000000-0000-4000-8000-000000000003',true);
    raise exception 'canonical item lock did not block recovery';
  exception when others then
    if sqlerrm='canonical item lock did not block recovery' then raise; end if;
    if position('exchange case' in sqlerrm)=0 then raise; end if;
  end;
end $$;
reset role;

-- Scenario C: direct browser-style updates to protected fields remain blocked.
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000061';
do $$ begin
  begin
    update public.collection_items
      set available_for_exchange=false
      where id='61000000-0000-4000-8000-000000000001';
    raise exception 'direct protected-field update unexpectedly succeeded';
  exception when others then
    if sqlerrm='direct protected-field update unexpectedly succeeded' then raise; end if;
    if position('permission denied' in lower(sqlerrm))=0
       and position('exchange availability action' in lower(sqlerrm))=0 then raise; end if;
  end;
end $$;
reset role;

-- Concurrency invariant: proposal creation and availability recovery serialize
-- on the same collection_items row before either relies on lock-table state.
do $$
declare availability_def text; proposal_def text;
begin
  select pg_get_functiondef('public.set_exchange_item_availability(uuid,boolean)'::regprocedure)
    into availability_def;
  select pg_get_functiondef(
    'public.create_exchange_case(uuid,uuid,integer,text,text)'::regprocedure
  ) into proposal_def;

  if position('where id=p_item_id for update' in lower(availability_def))=0 then
    raise exception 'availability RPC no longer locks the collection item first';
  end if;
  if position('where id in (p_offered_item_id,p_requested_item_id) order by id for update' in lower(proposal_def))=0 then
    raise exception 'proposal RPC no longer locks both collection items first';
  end if;
  if position('not offered.available_for_exchange or offered.exchange_review_required' in lower(proposal_def))=0 then
    raise exception 'proposal RPC no longer rechecks canonical availability after row locking';
  end if;
end $$;

-- Only controlled RPCs may set the workflow-transition GUC for authenticated callers.
do $$
declare unexpected text;
begin
  select string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ')
    into unexpected
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prokind='f'
    and pg_get_functiondef(p.oid) ilike '%brickcircle.workflow_transition%'
    and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and p.proname not in ('set_exchange_item_availability','exchange_case_transition');

  if unexpected is not null then
    raise exception 'unexpected authenticated workflow-transition setter(s): %', unexpected;
  end if;
end $$;

rollback;

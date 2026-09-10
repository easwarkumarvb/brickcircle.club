do $$
begin
  if exists(
    select 1 from public.collection_items c
    join public.exchanges e on e.state not in ('completed','cancelled')
      and (e.item_a=c.id or e.item_b=c.id)
    where c.available_for_exchange
  ) then raise exception 'active exchange item remained advertised'; end if;

  if (select status from public.exchange_requests where id='30000000-0000-4000-8000-000000000102') <> 'cancelled'
  then raise exception 'invalid pending proposal was not cancelled'; end if;

  if (select state from public.exchanges where id='40000000-0000-4000-8000-000000000101') <> 'swap_active'
  then raise exception 'existing physical exchange was changed'; end if;

  if (select count(*) from public.notifications where entity_id='30000000-0000-4000-8000-000000000102') <> 2
  then raise exception 'both proposal participants were not notified'; end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);
do $$
begin
  if exists(select 1 from public.find_matches('00000000-0000-4000-8000-000000000101'))
  then raise exception 'reserved item leaked into reciprocal matching'; end if;
end $$;

do $$
begin
  begin
    update public.collection_items
    set available_for_exchange=true
    where id='10000000-0000-4000-8000-000000000101';
    raise exception 'reserved item was allowed to become exchangeable';
  exception when sqlstate '55000' then null;
  end;
end $$;

update public.exchanges
set state='disputed'
where id='40000000-0000-4000-8000-000000000101';

do $$
begin
  begin
    insert into public.exchanges(id,request_id,user_a,user_b,item_a,item_b,duration_days,state)
    values(
      '40000000-0000-4000-8000-000000000102',
      '30000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000101',
      '10000000-0000-4000-8000-000000000102',
      '10000000-0000-4000-8000-000000000101',
      60,'accepted'
    );
    raise exception 'disputed exchange released a physical set';
  exception when sqlstate '55000' then null;
  end;
end $$;

do $$
begin
  if not pg_catalog.has_function_privilege('authenticated','public.find_matches(uuid)','EXECUTE')
  then raise exception 'authenticated users cannot find matches'; end if;
  if pg_catalog.has_function_privilege('authenticated','public.queue_new_reciprocal_match_notifications(uuid)','EXECUTE')
  then raise exception 'internal notification function exposed to authenticated users'; end if;
  if pg_catalog.has_function_privilege('anon','public.queue_new_reciprocal_match_notifications(uuid)','EXECUTE')
  then raise exception 'internal notification function exposed to anonymous users'; end if;
end $$;

select 'exchange availability integrity passed' as result;

\set ON_ERROR_STOP on
begin;
set local role authenticated;
do $$ declare capabilities jsonb; begin
  capabilities:=public.bc_exchange_capabilities();
  if capabilities->>'release_item' <> 'true' or capabilities->>'contract_version' <> '1' then
    raise exception 'release capability contract is unavailable: %',capabilities;
  end if;
end $$;
reset role;
insert into auth.users(id) values
 ('00000000-0000-4000-8000-000000000101'),('00000000-0000-4000-8000-000000000102'),('00000000-0000-4000-8000-000000000103');
insert into public.collection_items(id,user_id,set_number,estimated_value,available_for_exchange) values
 ('10000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','42143-1',450,false),
 ('10000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000102','42172-1',450,false),
 ('10000000-0000-4000-8000-000000000103','00000000-0000-4000-8000-000000000103','42115-1',420,false);
insert into public.exchange_requests(id,requester_id,responder_id,offered_item_id,requested_item_id,duration_days,status) values
 ('30000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000102',60,'accepted');
insert into public.exchanges(id,request_id,user_a,user_b,item_a,item_b,duration_days,state) values
 ('40000000-0000-4000-8000-000000000101','30000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000102',60,'accepted');

set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000102';
do $$ begin
  begin perform public.release_exchange_item('10000000-0000-4000-8000-000000000101',null); raise exception 'third user release unexpectedly succeeded';
  exception when others then if sqlerrm='third user release unexpectedly succeeded' then raise; end if; end;
end $$;
set local "request.jwt.claim.sub"='00000000-0000-4000-8000-000000000101';
select public.release_exchange_item('10000000-0000-4000-8000-000000000101','Owner released before handoff');
do $$ begin
  if (select state from public.exchanges where id='40000000-0000-4000-8000-000000000101') <> 'released' then raise exception 'exchange not released'; end if;
  if (select status from public.exchange_requests where id='30000000-0000-4000-8000-000000000101') <> 'released' then raise exception 'request not released'; end if;
  if (select count(*) from public.notifications where kind='exchange_released') <> 1 then raise exception 'release notification missing or duplicated'; end if;
end $$;
select public.release_exchange_item('10000000-0000-4000-8000-000000000101',null);
insert into public.exchange_requests(id,requester_id,responder_id,offered_item_id,requested_item_id,duration_days,status) values
 ('30000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000103',60,'accepted');
insert into public.exchanges(id,request_id,user_a,user_b,item_a,item_b,duration_days,state) values
 ('40000000-0000-4000-8000-000000000102','30000000-0000-4000-8000-000000000102','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000103','10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000103',60,'swap_active');
update public.collection_items set available_for_exchange=false where id in ('10000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000103');
do $$ declare result jsonb; begin
  result:=public.release_exchange_item('10000000-0000-4000-8000-000000000101',null);
  if result->>'requires_early_return' <> 'true' then raise exception 'active handoff was silently released'; end if;
  if (select state from public.exchanges where id='40000000-0000-4000-8000-000000000102') <> 'swap_active' then raise exception 'active exchange changed'; end if;
  if (select available_for_exchange from public.collection_items where id='10000000-0000-4000-8000-000000000103') then raise exception 'active set unreserved'; end if;
end $$;
do $$ begin
  if has_table_privilege('authenticated','public.exchange_requests','INSERT,UPDATE,DELETE') then raise exception 'request mutation still granted'; end if;
  if has_table_privilege('authenticated','public.exchanges','INSERT,UPDATE,DELETE') then raise exception 'exchange mutation still granted'; end if;
end $$;
rollback;

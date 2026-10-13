-- Ensure pre-handoff cancellation fully releases both LEGO sets and closes the linked request.
create or replace function public.cancel_in_person_exchange(
  p_exchange_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.exchanges%rowtype;
  me uuid := auth.uid();
  other uuid;
  item_a_released boolean := false;
  item_b_released boolean := false;
begin
  if me is null then
    raise exception 'Not authenticated';
  end if;

  select * into e
  from public.exchanges
  where id = p_exchange_id
  for update;

  if not found then
    raise exception 'Exchange not found';
  end if;

  if me not in (e.user_a, e.user_b) then
    raise exception 'Not an exchange participant';
  end if;

  -- Once physical handoff has completed, the return workflow owns the lifecycle.
  if e.state = 'swap_active' then
    raise exception 'The LEGO sets have already been handed over. Use the return workflow to close the temporary swap.';
  end if;

  -- Make repeated cancellation safe and do not re-reserve already-released sets.
  if e.state = 'cancelled' then
    select available_for_exchange into item_a_released
      from public.collection_items where id = e.item_a;
    select available_for_exchange into item_b_released
      from public.collection_items where id = e.item_b;
    return jsonb_build_object(
      'ok', true,
      'status', 'cancelled',
      'idempotent', true,
      'item_a_released', coalesce(item_a_released, false),
      'item_b_released', coalesce(item_b_released, false),
      'sets_released', coalesce(item_a_released, false) and coalesce(item_b_released, false)
    );
  end if;

  if e.state in ('completed','disputed') then
    raise exception 'Exchange is already closed';
  end if;

  other := case when me = e.user_a then e.user_b else e.user_a end;

  update public.exchanges
     set state = 'cancelled', updated_at = now()
   where id = e.id;

  update public.exchange_meetups
     set status = 'cancelled', updated_at = now()
   where exchange_id = e.id
     and status <> 'completed';

  -- The proposal that created this exchange must no longer remain accepted after cancellation.
  update public.exchange_requests
     set status = 'cancelled', updated_at = now()
   where id = e.request_id
     and status = 'accepted';

  -- Release each item only when no different non-terminal exchange still reserves it.
  update public.collection_items ci
     set available_for_exchange = true,
         updated_at = now()
   where ci.id in (e.item_a, e.item_b)
     and not exists (
       select 1
       from public.exchanges x
       where x.id <> e.id
         and x.state not in ('completed','cancelled','disputed')
         and (x.item_a = ci.id or x.item_b = ci.id)
     );

  select available_for_exchange into item_a_released
    from public.collection_items where id = e.item_a;
  select available_for_exchange into item_b_released
    from public.collection_items where id = e.item_b;

  insert into public.notifications(user_id,kind,title,body,created_at)
  values(
    other,
    'exchange_cancelled',
    'Exchange cancelled',
    coalesce(nullif(trim(p_reason),''),'The other collector cancelled this exchange. The LEGO sets are available again.'),
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'cancelled',
    'idempotent', false,
    'item_a_released', coalesce(item_a_released, false),
    'item_b_released', coalesce(item_b_released, false),
    'sets_released', coalesce(item_a_released, false) and coalesce(item_b_released, false)
  );
end
$$;

revoke all on function public.cancel_in_person_exchange(uuid,text) from public;
grant execute on function public.cancel_in_person_exchange(uuid,text) to authenticated;

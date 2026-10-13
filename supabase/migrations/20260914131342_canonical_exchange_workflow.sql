-- Canonical owner-controlled release/unreserve contract.
-- This migration is intentionally later than every historical exchange migration.

alter table public.exchange_requests drop constraint if exists exchange_requests_status_check;
alter table public.exchange_requests add constraint exchange_requests_status_check
  check (status in ('pending','accepted','declined','cancelled','expired','released'));

alter table public.exchanges drop constraint if exists exchanges_state_check;
alter table public.exchanges add constraint exchanges_state_check
  check (state in (
    'accepted','deposit_pending','photos_pending','shipping','building',
    'return_shipping','inspection','swap_active','completed','disputed',
    'cancelled','released'
  ));

alter table public.exchange_workflow_events
  add column if not exists dedupe_key text;

create unique index if not exists exchange_workflow_events_dedupe_idx
  on public.exchange_workflow_events(dedupe_key)
  where dedupe_key is not null;

create or replace function public.release_exchange_item(
  p_item_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owned public.collection_items%rowtype;
  request_row public.exchange_requests%rowtype;
  exchange_row public.exchanges%rowtype;
  other_user uuid;
  target_entity uuid;
  target_type text;
  target_route text;
  reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_item_id is null then raise exception 'Choose a LEGO set'; end if;

  select * into owned
  from public.collection_items
  where id = p_item_id
  for update;

  if not found or owned.user_id <> me then
    raise exception 'You can release only your own LEGO set';
  end if;

  select e.* into exchange_row
  from public.exchanges e
  where e.state not in ('completed','cancelled','released')
    and p_item_id in (e.item_a,e.item_b)
  order by e.created_at desc
  limit 1
  for update;

  if found then
    if exchange_row.state in ('swap_active','disputed') then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'requires_early_return', true,
        'exchange_id', exchange_row.id,
        'status', exchange_row.state,
        'message', case when exchange_row.state = 'disputed'
          then 'This exchange has an open issue. Contact the participant or continue the dispute workflow.'
          else 'The physical handoff is complete. Request an early return, contact the participant, or report an issue.' end
      );
    end if;

    other_user := case when me = exchange_row.user_a then exchange_row.user_b else exchange_row.user_a end;
    target_entity := exchange_row.id;
    target_type := 'exchange';
    target_route := '#exchanges/' || exchange_row.id::text;

    update public.exchanges
      set state = 'released', updated_at = pg_catalog.now()
      where id = exchange_row.id;
    update public.exchange_requests
      set status = 'released', updated_at = pg_catalog.now()
      where id = exchange_row.request_id and status in ('pending','accepted');
    update public.exchange_meetups
      set status = 'cancelled', updated_at = pg_catalog.now()
      where exchange_id = exchange_row.id and status <> 'completed';
    update public.collection_items ci
      set available_for_exchange = true, updated_at = pg_catalog.now()
      where ci.id in (exchange_row.item_a,exchange_row.item_b)
        and not exists (
          select 1 from public.exchanges active
          where active.id <> exchange_row.id
            and active.state not in ('completed','cancelled','released')
            and (active.item_a = ci.id or active.item_b = ci.id)
        );
  else
    select r.* into request_row
    from public.exchange_requests r
    where r.status = 'pending'
      and p_item_id in (r.offered_item_id,r.requested_item_id)
    order by r.created_at desc
    limit 1
    for update;

    if found then
      if me not in (request_row.requester_id,request_row.responder_id) then
        raise exception 'Not an exchange participant';
      end if;
      other_user := case when me = request_row.requester_id then request_row.responder_id else request_row.requester_id end;
      target_entity := request_row.id;
      target_type := 'exchange_request';
      target_route := '#exchanges/' || request_row.id::text;
      update public.exchange_requests
        set status = 'released', updated_at = pg_catalog.now()
        where id = request_row.id;
      update public.collection_items
        set available_for_exchange = true, updated_at = pg_catalog.now()
        where id in (request_row.offered_item_id,request_row.requested_item_id);
    else
      update public.collection_items
        set available_for_exchange = true, updated_at = pg_catalog.now()
        where id = owned.id;
      return pg_catalog.jsonb_build_object('ok',true,'status','available','idempotent',true,'item_id',owned.id);
    end if;
  end if;

  insert into public.exchange_workflow_events(
    exchange_request_id,exchange_id,actor_user_id,event_type,dedupe_key,metadata
  ) values (
    case when target_type='exchange_request' then target_entity else exchange_row.request_id end,
    case when target_type='exchange' then target_entity else null end,
    me,'set_released','release:'||target_type||':'||target_entity::text,
    pg_catalog.jsonb_build_object('item_id',owned.id,'reason',reason,'route',target_route)
  ) on conflict (dedupe_key) where dedupe_key is not null do nothing;

  insert into public.notifications(
    user_id,kind,title,body,actor_user_id,entity_type,entity_id,metadata
  ) values (
    other_user,'exchange_released','A LEGO set was released',
    coalesce(reason,'The other collector released their set. Both sets are available for a new match.'),
    me,target_type,target_entity,
    pg_catalog.jsonb_build_object('item_id',owned.id,'route',target_route)
  ) on conflict (user_id,kind,entity_type,entity_id) where entity_id is not null do nothing;

  return pg_catalog.jsonb_build_object(
    'ok',true,'status','released','idempotent',false,
    'item_id',owned.id,'entity_type',target_type,'entity_id',target_entity
  );
end;
$$;

revoke all on function public.release_exchange_item(uuid,text) from public,anon;
grant execute on function public.release_exchange_item(uuid,text) to authenticated;

-- Lifecycle tables are server-owned. Participants retain SELECT through RLS.
revoke insert,update,delete on table public.exchange_requests from authenticated;
revoke insert,update,delete on table public.exchanges from authenticated;

-- Include release as a high-value, best-effort email event. The existing unique
-- notification-delivery constraint prevents duplicate delivery after retries.
create or replace function public.enqueue_marketplace_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = any(array[
    'reciprocal_match','request_received','exchange_accepted','exchange_declined',
    'exchange_cancelled','exchange_released','meetup_proposed','swap_started',
    'return_meetup_proposed','return_overdue','return_dispute','return_completed'
  ]::text[]) then
    insert into public.notification_email_deliveries(
      notification_id,recipient_user_id,notification_kind
    ) values (new.id,new.user_id,new.kind)
    on conflict (notification_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_marketplace_notification_email() from public,anon,authenticated;
grant execute on function public.enqueue_marketplace_notification_email() to service_role;

-- BrickCircle: make proposal creation and exchange-message delivery server owned.
-- This migration deliberately leaves the existing accepted/meetup/return state
-- functions in place; they already serialize their transitions and reservations.

create table if not exists public.exchange_workflow_events (
  id uuid primary key default extensions.gen_random_uuid(),
  exchange_request_id uuid references public.exchange_requests(id) on delete cascade,
  exchange_id uuid references public.exchanges(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now()
);

alter table public.exchange_workflow_events enable row level security;
revoke all on table public.exchange_workflow_events from public, anon, authenticated;
grant all on table public.exchange_workflow_events to service_role;

create index if not exists exchange_workflow_events_request_created_idx
  on public.exchange_workflow_events(exchange_request_id, created_at desc);
create index if not exists exchange_workflow_events_exchange_created_idx
  on public.exchange_workflow_events(exchange_id, created_at desc);

create or replace function public.bc_audit_exchange_request_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid;
begin
  if tg_op = 'INSERT' then actor := new.requester_id;
  elsif new.status = 'accepted' or new.status = 'declined' then actor := new.responder_id;
  elsif new.status = 'cancelled' then actor := coalesce(auth.uid(), new.requester_id);
  else actor := auth.uid(); end if;
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.exchange_workflow_events(exchange_request_id, actor_user_id, event_type, metadata)
    values (new.id, actor, 'proposal_' || new.status, pg_catalog.jsonb_build_object('status', new.status));
  end if;
  return new;
end;
$$;

create or replace function public.bc_audit_exchange_state_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.state is distinct from new.state then
    insert into public.exchange_workflow_events(exchange_request_id, exchange_id, actor_user_id, event_type, metadata)
    values (new.request_id, new.id, auth.uid(), 'exchange_' || new.state, pg_catalog.jsonb_build_object('state', new.state));
  end if;
  return new;
end;
$$;

drop trigger if exists bc_audit_exchange_request_transition on public.exchange_requests;
create trigger bc_audit_exchange_request_transition after insert or update of status on public.exchange_requests
for each row execute function public.bc_audit_exchange_request_transition();
drop trigger if exists bc_audit_exchange_state_transition on public.exchanges;
create trigger bc_audit_exchange_state_transition after insert or update of state on public.exchanges
for each row execute function public.bc_audit_exchange_state_transition();

create or replace function public.create_exchange_request(
  p_offered_item_id uuid,
  p_requested_item_id uuid,
  p_duration_days integer,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  offered public.collection_items%rowtype;
  requested public.collection_items%rowtype;
  existing public.exchange_requests%rowtype;
  created_request public.exchange_requests%rowtype;
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if p_offered_item_id is null or p_requested_item_id is null or p_offered_item_id = p_requested_item_id then
    raise exception 'Choose two different LEGO sets';
  end if;
  if p_duration_days not in (30, 60, 90) then
    raise exception 'Choose a supported temporary exchange period';
  end if;

  -- Lock in a stable order so competing proposals cannot observe stale availability.
  perform 1 from public.collection_items where id in (p_offered_item_id, p_requested_item_id) order by id for update;
  select * into offered from public.collection_items where id = p_offered_item_id;
  select * into requested from public.collection_items where id = p_requested_item_id;
  if not found or offered.id is null or requested.id is null then raise exception 'One of these LEGO sets is unavailable'; end if;
  if offered.user_id <> me or not offered.available_for_exchange then raise exception 'Your offered LEGO set is not available for exchange'; end if;
  if requested.user_id = me or not requested.available_for_exchange then raise exception 'The requested LEGO set is not available for exchange'; end if;

  -- A proposal is valid only for a current reciprocal match. Recipient ownership is
  -- derived from the physical item, never accepted from the browser.
  if not exists (
    select 1 from public.wishlists mine
    where mine.user_id = me
      and public.canonical_lego_product_identity(mine.set_number) = public.canonical_lego_product_identity(requested.set_number)
  ) or not exists (
    select 1 from public.wishlists theirs
    where theirs.user_id = requested.user_id
      and public.canonical_lego_product_identity(theirs.set_number) = public.canonical_lego_product_identity(offered.set_number)
  ) then raise exception 'This reciprocal match is no longer available'; end if;

  if exists (select 1 from public.exchanges e where e.state not in ('completed','cancelled') and (e.item_a in (offered.id, requested.id) or e.item_b in (offered.id, requested.id))) then
    raise exception 'One of these LEGO sets is already reserved in another active exchange';
  end if;

  select * into existing from public.exchange_requests r
  where r.requester_id = me and r.responder_id = requested.user_id
    and r.offered_item_id = offered.id and r.requested_item_id = requested.id and r.status = 'pending'
  order by r.created_at desc limit 1 for update;
  if found then
    return pg_catalog.jsonb_build_object('ok', true, 'request_id', existing.id, 'status', existing.status, 'idempotent', true);
  end if;

  insert into public.exchange_requests(requester_id, responder_id, offered_item_id, requested_item_id, duration_days, offered_value, requested_value, proposed_deposit, message)
  values (me, requested.user_id, offered.id, requested.id, p_duration_days, coalesce(offered.estimated_value, 0), coalesce(requested.estimated_value, 0), 0, nullif(pg_catalog.btrim(p_message), ''))
  returning * into created_request;

  return pg_catalog.jsonb_build_object('ok', true, 'request_id', created_request.id, 'status', created_request.status, 'idempotent', false);
end;
$$;

revoke all on function public.create_exchange_request(uuid, uuid, integer, text) from public, anon;
grant execute on function public.create_exchange_request(uuid, uuid, integer, text) to authenticated;

-- The proposal trigger remains the single durable notification producer. Client
-- inserts are removed so every proposal passes the authenticated validation above.
revoke insert, update, delete on table public.exchange_requests from authenticated;

create or replace function public.bc_prepare_exchange_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  exchange_row public.exchanges%rowtype;
  me uuid := auth.uid();
begin
  if me is null or new.sender_id <> me then raise exception 'Only the signed-in sender may create a message'; end if;
  if nullif(pg_catalog.btrim(new.body), '') is null then raise exception 'A message cannot be blank'; end if;
  if new.exchange_id is not null then
    select * into exchange_row from public.exchanges where id = new.exchange_id;
    if not found or me not in (exchange_row.user_a, exchange_row.user_b) then raise exception 'Not an exchange participant'; end if;
    new.recipient_id := case when me = exchange_row.user_a then exchange_row.user_b else exchange_row.user_a end;
  elsif new.recipient_id is null or new.recipient_id = me then
    raise exception 'Choose another collector';
  end if;
  return new;
end;
$$;

create or replace function public.bc_notify_exchange_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(user_id, kind, title, body, actor_user_id, entity_type, entity_id, metadata)
  values (
    new.recipient_id, 'message_received', 'New message from a collector',
    'You have a new BrickCircle message.', new.sender_id, 'message', new.id,
    pg_catalog.jsonb_build_object('exchange_id', new.exchange_id, 'route', case when new.exchange_id is null then '#inbox' else '#exchanges/' || new.exchange_id::text end)
  ) on conflict (user_id, kind, entity_type, entity_id) where entity_id is not null do nothing;
  insert into public.exchange_workflow_events(exchange_id, actor_user_id, event_type, metadata)
  values (new.exchange_id, new.sender_id, 'message_sent', pg_catalog.jsonb_build_object('message_id', new.id));
  return new;
end;
$$;

drop trigger if exists bc_prepare_exchange_message on public.messages;
create trigger bc_prepare_exchange_message before insert on public.messages
for each row execute function public.bc_prepare_exchange_message();
drop trigger if exists bc_notify_exchange_message on public.messages;
create trigger bc_notify_exchange_message after insert on public.messages
for each row execute function public.bc_notify_exchange_message();

revoke all on function public.bc_prepare_exchange_message() from public, anon, authenticated;
revoke all on function public.bc_notify_exchange_message() from public, anon, authenticated;
revoke all on function public.bc_audit_exchange_request_transition() from public, anon, authenticated;
revoke all on function public.bc_audit_exchange_state_transition() from public, anon, authenticated;

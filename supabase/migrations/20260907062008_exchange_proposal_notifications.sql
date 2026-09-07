-- Durable, recipient-scoped exchange proposal notifications.
-- Reconciles the live v22 trigger into repository migration lineage.

alter table public.notifications
  add column if not exists actor_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Existing request notifications were created in the same transaction and have
-- the exact exchange-request timestamp. Backfill only unambiguous pairs.
with candidates as (
  select
    n.id as notification_id,
    r.id as request_id,
    r.requester_id,
    r.offered_item_id,
    r.requested_item_id,
    coalesce(nullif(pg_catalog.btrim(p.display_name), ''), 'A collector') as requester_name,
    count(*) over (partition by n.id) as candidate_count,
    row_number() over (partition by r.id order by n.created_at, n.id) as notification_rank
  from public.notifications n
  join public.exchange_requests r
    on r.responder_id = n.user_id
   and r.created_at = n.created_at
  left join public.profiles p on p.id = r.requester_id
  where n.kind = 'request_received'
    and n.entity_id is null
)
update public.notifications n
set actor_user_id = c.requester_id,
    entity_type = 'exchange_request',
    entity_id = c.request_id,
    title = 'New exchange proposal',
    body = pg_catalog.format('%s proposed an exchange with you.', c.requester_name),
    metadata = pg_catalog.jsonb_build_object(
      'exchange_request_id', c.request_id,
      'requester_id', c.requester_id,
      'offered_item_id', c.offered_item_id,
      'requested_item_id', c.requested_item_id,
      'route', '#exchanges/' || c.request_id::text
    )
from candidates c
where n.id = c.notification_id
  and c.candidate_count = 1
  and c.notification_rank = 1;

create unique index if not exists notifications_entity_dedupe_idx
  on public.notifications(user_id, kind, entity_type, entity_id)
  where entity_id is not null;

create or replace function public.notify_new_exchange_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_name text;
begin
  select coalesce(
    nullif(pg_catalog.btrim(p.display_name), ''),
    'A collector'
  )
  into requester_name
  from public.profiles p
  where p.id = new.requester_id;

  insert into public.notifications(
    user_id,
    kind,
    title,
    body,
    actor_user_id,
    entity_type,
    entity_id,
    metadata
  )
  values(
    new.responder_id,
    'request_received',
    'New exchange proposal',
    pg_catalog.format('%s proposed an exchange with you.', coalesce(requester_name, 'A collector')),
    new.requester_id,
    'exchange_request',
    new.id,
    pg_catalog.jsonb_build_object(
      'exchange_request_id', new.id,
      'requester_id', new.requester_id,
      'offered_item_id', new.offered_item_id,
      'requested_item_id', new.requested_item_id,
      'route', '#exchanges/' || new.id::text
    )
  )
  on conflict (user_id, kind, entity_type, entity_id)
    where entity_id is not null
  do nothing;

  return new;
end;
$$;

revoke all on function public.notify_new_exchange_request() from public, anon, authenticated;
grant execute on function public.notify_new_exchange_request() to service_role;

drop trigger if exists exchange_request_notification on public.exchange_requests;
create trigger exchange_request_notification
after insert on public.exchange_requests
for each row execute function public.notify_new_exchange_request();

-- Authenticated clients may only change read_at on their own rows. The existing
-- recipient-only SELECT/UPDATE RLS policies remain authoritative.
revoke update on table public.notifications from authenticated;
grant update(read_at) on table public.notifications to authenticated;

-- Postgres Changes respects the notifications RLS policy and the client also
-- applies a user_id filter. Add the table only when it is not already present.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end;
$$;
